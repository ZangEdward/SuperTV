import { create } from "zustand";
import { SearchResult, api } from "@/services/api";
import { getResolutionFromM3U8 } from "@/services/m3u8";
import { useSettingsStore } from "@/stores/settingsStore";
import { FavoriteManager } from "@/services/storage";
import { SpeedTestService } from "@/services/speedTestService";
import useSearchStore from "./searchStore"; // 引入搜索 Store 实现预载入
import Logger from "@/utils/Logger";

const logger = Logger.withTag('DetailStore');

export type SearchResultWithResolution = SearchResult & {
  resolution?: string | null;
  latency?: number;
  speed?: number;
};

export interface SearchProgress {
  total: number;
  completed: number;
  currentSource: string | null;
  isComplete: boolean;
}

/**
 * 核心评分函数：模仿 Selene-Source 的加权模型
 */
export const calculateSourceScore = (r: SearchResultWithResolution) => {
  let score = 0;
  // 1. 速度权重 (40%) - 2MB/s 以上即为优秀
  const speedScore = Math.min((r.speed || 0) / 2, 1) * 40;
  // 2. 延迟权重 (30%) - 100ms 以下为优秀，1000ms 以上为极差
  const latencyScore = r.latency ? Math.max(0, (1000 - r.latency) / 900) * 30 : 0;
  // 3. 分辨率权重 (20%)
  let resScore = 0;
  const res = (r.resolution || "").toLowerCase();
  if (res.includes('1080') || res.includes('bd') || res.includes('hd')) resScore = 20;
  else if (res.includes('720')) resScore = 15;
  else if (res.includes('480')) resScore = 10;
  else resScore = 5;
  // 4. 稳定性权重 (10%) - 剧集越多通常越稳定
  const epScore = Math.min((r.episodes?.length || 0) / 30, 1) * 10;

  return speedScore + latencyScore + resScore + epScore;
};

interface DetailState {
  q: string | null;
  searchResults: SearchResultWithResolution[];
  sources: { source: string; source_name: string; resolution: string | null | undefined }[];
  detail: SearchResultWithResolution | null;
  loading: boolean;
  error: string | null;
  allSourcesLoaded: boolean;
  controller: AbortController | null;
  isFavorited: boolean;
  failedSources: Set<string>;
  searchProgress: SearchProgress;
  isOptimizing: boolean; // 新增：记录是否正在测速

  init: (q: string, preferredSource?: string, id?: string) => Promise<void>;
  setDetail: (detail: SearchResultWithResolution) => Promise<void>;
  abort: () => void;
  toggleFavorite: () => Promise<void>;
  markSourceAsFailed: (source: string, reason: string) => void;
  getNextAvailableSource: (currentSource: string, episodeIndex: number) => SearchResultWithResolution | null;
  optimizeSources: () => Promise<void>;
}

export const episodesSelectorBySource = (source: string) => (state: DetailState) => {
  const result = state.searchResults.find((r) => r.source === source);
  return result ? (result.episodes || []) : [];
};

export const sourcesSelector = (state: DetailState) => state.sources;

const useDetailStore = create<DetailState>((set, get) => ({
  q: null,
  searchResults: [],
  sources: [],
  detail: null,
  loading: true,
  error: null,
  allSourcesLoaded: false,
  controller: null,
  isFavorited: false,
  failedSources: new Set(),
  searchProgress: { total: 0, completed: 0, currentSource: null, isComplete: false },
  isOptimizing: false,

  init: async (q, preferredSource, id) => {
    const perfStart = performance.now();
    logger.info(`[PERF] DetailStore.init START - q: ${q}, preferredSource: ${preferredSource}, id: ${id}`);
    
    const { controller: oldController } = get();
    if (oldController) {
      oldController.abort();
    }
    const newController = new AbortController();
    const signal = newController.signal;

    set({
      q,
      loading: true,
      searchResults: [],
      detail: null,
      error: null,
      allSourcesLoaded: false,
      controller: newController,
      searchProgress: { total: 0, completed: 0, currentSource: null, isComplete: false },
    });

    const { videoSource } = useSettingsStore.getState();

    // [预载入优化]：从搜索结果中提取所有匹配项，实现秒开且保留多源列表
    const allSearchResults = useSearchStore.getState().results;
    const matchedResults = allSearchResults.filter(r =>
      r.title.trim().toLowerCase() === q.trim().toLowerCase()
    );

    if (matchedResults.length > 0) {
      const preferred = matchedResults.find(r =>
        r.id.toString() === id?.toString() && r.source === preferredSource
      ) || matchedResults[0];

      logger.info(`[PRE-CACHE] Hit! Found ${matchedResults.length} sources for ${q}`);

      set({
        searchResults: matchedResults as SearchResultWithResolution[],
        detail: preferred as SearchResultWithResolution,
        loading: false,
        error: null,
      });
      // 依然触发全量加载以确保数据最新，并获取可能缺失的其他源
    }

    const updateProgress = (updates: Partial<SearchProgress>) => {
      if (signal.aborted) return;
      set(state => ({
        searchProgress: { ...state.searchProgress, ...updates }
      }));
    };

    const processAndSetResults = async (results: SearchResult[], defaultLatency?: number) => {
      if (signal.aborted || results.length === 0) return;

      const state = get();
      const resultsWithLatency = results.map(r => ({ ...r, latency: defaultLatency }));

      // 合并并去重
      const existingSources = new Set(state.searchResults.map((r) => r.source));
      const newResults = resultsWithLatency.filter((r) => !existingSources.has(r.source));

      if (newResults.length === 0) return;

      const combinedResults = [...state.searchResults, ...newResults];

      // [逻辑升级] 初始加载即应用评分逻辑进行初步排序
      const finalResults = combinedResults.sort((a, b) => calculateSourceScore(b) - calculateSourceScore(a));

      const preferredId = id?.toString();
      const preferredMatch = preferredId
        ? finalResults.find(
            (result) => result.id.toString() === preferredId && result.source === preferredSource
          )
        : null;

      const selectedDetail = preferredMatch || state.detail || finalResults[0] || null;

      set({
        searchResults: finalResults,
        sources: finalResults.map((r) => ({
          source: r.source,
          source_name: r.source_name,
          resolution: r.resolution,
        })),
        detail: selectedDetail,
      });

      // 如果选中的详情还没有剧集数据，异步拉取一次
      if (selectedDetail && (!selectedDetail.episodes || selectedDetail.episodes.length === 0)) {
        await get().setDetail(selectedDetail);
      }
    };

    try {
      if (preferredSource && id) {
        // [路径 A] 有首选源：先精准打击，再异步拉取其他
        updateProgress({ total: 1, currentSource: '首选源' });

        let preferredResult: SearchResult[] = [];
        try {
          const response = await api.searchVideo(q, preferredSource, signal);
          preferredResult = response.results;
        } catch (error) {
          logger.warn(`Preferred source "${preferredSource}" failed`, error);
        }

        if (signal.aborted) return;
        
        if (preferredResult.length > 0) {
          await processAndSetResults(preferredResult, 0);
          set({ loading: false });
          updateProgress({ completed: 1, isComplete: true });
        } else {
          logger.info(`Preferred source failed, falling back to all-source search`);
        }
        
        // 异步拉取全量资源（换源备用），不阻塞首屏
        api.searchVideos(q).then(response => {
          if (!signal.aborted) processAndSetResults(response.results, 100);
        }).catch(() => {});

      } else {
        // [路径 B] 无首选源：模仿 Selene 异步并发加载模式
        const allResources = await api.getResources(signal);
        const enabledResources = videoSource.enabledAll ? allResources : allResources.filter((r) => videoSource.sources[r.key]);

        if (enabledResources.length === 0) {
          set({ error: "没有可用的视频源", loading: false });
          return;
        }

        updateProgress({ total: enabledResources.length });

        let completed = 0;
        let firstResultFound = false;
        const batchSize = 3; // 采用分批并发模式，使进度条和源名称更新更平滑

        // 3. 分批并行搜索，动态异步刷新结果
        for (let i = 0; i < enabledResources.length; i += batchSize) {
          if (signal.aborted) break;
          const batch = enabledResources.slice(i, i + batchSize);

          await Promise.all(batch.map(async (resource) => {
            try {
              updateProgress({ currentSource: resource.name });
              const searchStart = performance.now();

              const timeoutPromise = new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT')), 10000)
              );

              const results = await Promise.race([
                api.searchVideo(q, resource.key, signal).then(r => r.results),
                timeoutPromise
              ]) as SearchResult[] | null;

              const latency = performance.now() - searchStart;

              if (results && results.length > 0) {
                await processAndSetResults(results, latency);
                if (!firstResultFound) {
                  set({ loading: false });
                  firstResultFound = true;
                }
              }
            } catch (e) {
              logger.debug(`Search failed for ${resource.name}`);
            } finally {
              completed++;
              updateProgress({ completed });
            }
          }));
        }

        updateProgress({ isComplete: true });
      }

      // 最后同步一下收藏状态并自动开启测速优化
      const finalState = get();
      if (finalState.detail) {
        const { source, id: vid } = finalState.detail;
        const isFavorited = await FavoriteManager.isFavorited(source, vid.toString());
        set({ isFavorited });

        // [自动优化] 异步启动测速，不阻塞 UI
        setTimeout(() => get().optimizeSources(), 500);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        set({ error: "搜索失败" });
      }
    } finally {
      if (!signal.aborted) {
        set({ loading: false, allSourcesLoaded: true });
      }
    }
  },

  optimizeSources: async () => {
    const { searchResults, controller, isOptimizing } = get();
    if (searchResults.length === 0 || isOptimizing) return;

    set({ isOptimizing: true });
    const signal = controller?.signal;
    const testBatchSize = 4;

    // 分批次测速
    for (let i = 0; i < searchResults.length; i += testBatchSize) {
      if (signal?.aborted) break;
      const batch = searchResults.slice(i, i + testBatchSize);

      await Promise.all(batch.map(async (item) => {
        try {
          let episodes = item.episodes;
          if (!episodes || episodes.length === 0) {
            const detail = await api.getVideoDetail(item.source, item.id.toString());
            episodes = detail.episodes || [];
          }

          if (episodes.length === 0) return;

          const testUrl = episodes.length > 1 ? episodes[1] : episodes[0];
          const metrics = await SpeedTestService.testM3U8Speed(testUrl, signal);

          set(state => {
            const updatedResults = state.searchResults.map(r =>
              r.source === item.source ? { ...r, ...metrics } : r
            );

            // [实时重排]：每完成一个源的测速，就进行一次全局重排，确保最高分的源立刻置顶
            return {
              searchResults: [...updatedResults].sort((a, b) => calculateSourceScore(b) - calculateSourceScore(a))
            };
          });
        } catch {}
      }));
    }

    set({ isOptimizing: false });
  },

  setDetail: async (detail) => {
    // 如果没有剧集，尝试获取详情并填充
    if (!detail.episodes || detail.episodes.length === 0) {
      try {
        const fullDetail = await api.getVideoDetail(detail.source, detail.id.toString());
        if (fullDetail && fullDetail.episodes) {
          detail.episodes = fullDetail.episodes;
          detail.episodes_titles = fullDetail.episodes_titles; // 提取标题
          // 同时更新 searchResults 列表
          set(state => ({
            searchResults: state.searchResults.map(r =>
              (r.id === detail.id && r.source === detail.source)
                ? { ...r, episodes: fullDetail.episodes, episodes_titles: fullDetail.episodes_titles }
                : r
            )
          }));
        }
      } catch (e) {
        logger.error(`Failed to fetch episodes for ${detail.source_name} in setDetail`, e);
      }
    }
    set({ detail });
    const { source, id } = detail;
    const isFavorited = await FavoriteManager.isFavorited(source, id.toString());
    set({ isFavorited });
  },

  abort: () => {
    get().controller?.abort();
  },

  toggleFavorite: async () => {
    const { detail } = get();
    if (!detail) return;

    const { source, id, title, poster, source_name, episodes, year } = detail;
    const favoriteItem = {
      cover: poster,
      title,
      poster,
      source_name,
      total_episodes: episodes.length,
      search_title: get().q!,
      year: year || "",
    };

    const newIsFavorited = await FavoriteManager.toggle(source, id.toString(), favoriteItem);
    set({ isFavorited: newIsFavorited });
  },

  markSourceAsFailed: (source: string, reason: string) => {
    const { failedSources } = get();
    const newFailedSources = new Set(failedSources);
    newFailedSources.add(source);
    set({ failedSources: newFailedSources });
  },

  getNextAvailableSource: (currentSource: string, episodeIndex: number) => {
    const { searchResults, failedSources } = get();
    const availableSources = searchResults.filter(result =>
      result.source !== currentSource && 
      !failedSources.has(result.source) &&
      result.episodes && 
      result.episodes.length > episodeIndex
    );

    if (availableSources.length === 0) return null;
    
    const sortedSources = availableSources.sort((a, b) => {
      const aRes = a.resolution || '';
      const bRes = b.resolution || '';
      const priority = (res: string) => {
        if (res.includes('1080')) return 4;
        if (res.includes('720')) return 3;
        if (res.includes('480')) return 2;
        return 1;
      };
      return priority(bRes) - priority(aRes);
    });

    return sortedSources[0];
  },
}));

export default useDetailStore;
