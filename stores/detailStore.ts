import { create } from "zustand";
import { SearchResult, api } from "@/services/api";
import { getResolutionFromM3U8 } from "@/services/m3u8";
import { useSettingsStore } from "@/stores/settingsStore";
import { FavoriteManager } from "@/services/storage";
import { SpeedTestService } from "@/services/speedTestService";
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

      // 智能排序：优先显示剧集多且延迟低的
      const finalResults = combinedResults.sort((a, b) => {
        if ((b.episodes?.length || 0) !== (a.episodes?.length || 0)) {
          return (b.episodes?.length || 0) - (a.episodes?.length || 0);
        }
        return (a.latency || 0) - (b.latency || 0);
      });

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

        // 并发执行搜索
        const searchPromises = enabledResources.map(async (resource) => {
          try {
            updateProgress({ currentSource: resource.name });
            const searchStart = performance.now();

            // 为单个源增加超时竞争，防止被某个僵尸源拖死
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
        });

        // 这里的 Promise.all 只是为了等待最终状态，实际 UI 是由内部的 processAndSetResults 实时更新的
        await Promise.all(searchPromises);
        updateProgress({ isComplete: true });
      }

      // 最后同步一下收藏状态
      const finalState = get();
      if (finalState.detail) {
        const { source, id: vid } = finalState.detail;
        const isFavorited = await FavoriteManager.isFavorited(source, vid.toString());
        set({ isFavorited });
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
    const { searchResults, controller } = get();
    if (searchResults.length === 0) return;

    const signal = controller?.signal;
    const testBatchSize = 3; // 每次并发测试 3 个，防止互相抢占带宽导致测速不准

    // [逻辑升级] 模仿 Selene 的加权评分排序
    const calculateScore = (r: SearchResultWithResolution) => {
      let score = 0;
      // 1. 速度权重 (40%) - 2MB/s 以上即为优秀
      const speedScore = Math.min((r.speed || 0) / 2, 1) * 40;
      // 2. 延迟权重 (30%) - 100ms 以下为优秀，1000ms 以上为极差
      const latencyScore = r.latency ? Math.max(0, (1000 - r.latency) / 900) * 30 : 0;
      // 3. 分辨率权重 (20%)
      let resScore = 0;
      if (r.resolution?.includes('1080')) resScore = 20;
      else if (r.resolution?.includes('720')) resScore = 15;
      else if (r.resolution?.includes('480')) resScore = 10;
      // 4. 稳定性权重 (10%) - 剧集越多通常越稳定
      const epScore = Math.min((r.episodes?.length || 0) / 30, 1) * 10;

      return speedScore + latencyScore + resScore + epScore;
    };

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

          // 模仿 Selene：优先测第二集，更接近真实播放情况
          const testUrl = episodes.length > 1 ? episodes[1] : episodes[0];
          const metrics = await SpeedTestService.testM3U8Speed(testUrl, signal);

          set(state => {
            const updatedResults = state.searchResults.map(r =>
              r.source === item.source ? { ...r, ...metrics } : r
            );

            // 测速过程中不重排，防止 UI 闪烁导致用户点错，测速完成后再重排
            return { searchResults: updatedResults };
          });
        } catch {}
      }));
    }

    // 所有测速完成后，执行一次终极加权重排
    set(state => ({
      searchResults: [...state.searchResults].sort((a, b) => calculateScore(b) - calculateScore(a))
    }));
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
