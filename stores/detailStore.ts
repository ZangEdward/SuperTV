import { create } from "zustand";
import { SearchResult, api } from "@/services/api";
import { getResolutionFromM3U8 } from "@/services/m3u8";
import { useSettingsStore } from "@/stores/settingsStore";
import { FavoriteManager } from "@/services/storage";
import { SpeedTestService } from "@/services/speedTestService";
import useSearchStore, { SearchDetailPool } from "./searchStore"; // 引入内存详情池
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

    // [资料源识别]：豆瓣和 Bangumi 仅提供资料，不提供视频
    const isMetadataSource = preferredSource === "douban" || preferredSource === "bangumi";

    // [预载入优化]：如果是从搜索页点击进入的（非资料源），尝试从内存池秒开
    if (!isMetadataSource) {
      const poolResult = SearchDetailPool.get(`${q.trim().toLowerCase()}_${preferredSource}`);
      if (poolResult) {
        set({
          searchResults: [poolResult as SearchResultWithResolution],
          detail: poolResult as SearchResultWithResolution,
          loading: false,
          error: null,
        });
      }
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
      // 获取当前主剧集的“核心特征”，用于跨源精确匹配，强制物理去空格
      const getCoreKey = (t: string) => (t || "").trim().replace(/\[.*?\]|【.*?】/g, '').replace(/\s+/g, '').toLowerCase();
      const currentCore = getCoreKey(q);

      // [资料源宽容匹配]：如果是资料源进入，匹配度可以放得更开，强制无视空格
      const strictlyMatchedResults = results.filter(r => {
          const targetTitle = (r.title || "").replace(/\s+/g, '').toLowerCase();
          const targetCore = getCoreKey(r.title);
          const searchCore = q.replace(/\s+/g, '').toLowerCase();

          // 匹配条件：只要标题包含核心词，或者核心词包含标题
          return targetCore.includes(currentCore) ||
                 currentCore.includes(targetCore) ||
                 targetTitle.includes(searchCore);
      });

      if (strictlyMatchedResults.length === 0) {
        // [关键修复]：如果是在资料源路径下且这是第一个结果，无条件信任它（解决首页点击失效）
        if (isMetadataSource && state.searchResults.length === 0) {
           strictlyMatchedResults.push(results[0]);
        } else {
           if (state.detail) set({ loading: false });
           return;
        }
      }

      // [源去重与合并]
      const resultsWithLatency = strictlyMatchedResults.map(r => ({ ...r, latency: defaultLatency }));
      const existingSources = new Set(state.searchResults.map((r) => r.source));
      const newResults = resultsWithLatency.filter((r) => !existingSources.has(r.source));

      if (newResults.length === 0) {
        if (get().detail) set({ loading: false });
        return;
      }

      const combinedResults = [...state.searchResults, ...newResults];
      // [逻辑升级] 初始加载即应用评分逻辑进行初步排序
      const finalResults = combinedResults.sort((a, b) => calculateSourceScore(b) - calculateSourceScore(a));

      // 如果当前没有有效视频 detail，或者当前 detail 还是资料源占位，执行切换
      const shouldUpdateDetail = !get().detail || isMetadataSource;

      set({
        searchResults: finalResults,
        sources: finalResults.map((r) => ({
          source: r.source,
          source_name: r.source_name,
          resolution: r.resolution,
        })),
        detail: shouldUpdateDetail ? finalResults[0] : get().detail,
      });

      // [核心优化] 只要有了搜索结果，立即异步启动测速优化，无需等待 init 结束
      if (finalResults.length > 0 && !get().isOptimizing) {
        get().optimizeSources();
      }

      // 如果选中的详情还没有剧集数据，异步拉取一次
      const selectedDetail = shouldUpdateDetail ? finalResults[0] : get().detail;
      if (selectedDetail && (!selectedDetail.episodes || selectedDetail.episodes.length === 0)) {
        await get().setDetail(selectedDetail);
      }
    };

    try {
      // 资料源（路径 B）：不尝试 Path A，直接全网探测
      if (!isMetadataSource && preferredSource && id && id !== "local" && id !== "0") {
        // [路径 A] 有确定的视频源：精准获取，同步开启换源检索
        updateProgress({ total: 1, currentSource: '首选源' });

        try {
          const response = await api.searchVideo(q, preferredSource, signal);
          if (response.results.length > 0) {
            await processAndSetResults(response.results, 0);
          }
        } catch (error) {
          logger.warn(`Preferred source "${preferredSource}" failed, will fallback`);
        }

        if (signal.aborted) return;
        
        // 2. 异步启动全网检索（用于换源），不阻塞当前显示
        api.searchVideos(q).then(response => {
          if (!signal.aborted && response.results.length > 0) {
            processAndSetResults(response.results, 100);
          }
        }).catch(() => {});

      } else {
        // [路径 B] 资料源或无确定的源：激进全网并发加载
        const allResources = await api.getResources(signal);
        const enabledResources = videoSource.enabledAll ? allResources : allResources.filter((r) => videoSource.sources[r.key]);

        if (enabledResources.length === 0) {
          set({ error: "没有可用的视频源", loading: false });
          return;
        }

        updateProgress({ total: enabledResources.length });

        let completed = 0;
        // [极致并发] 同时启动所有源的检索
        const tasks = enabledResources.map(async (resource) => {
          try {
            updateProgress({ currentSource: resource.name });
            const searchStart = performance.now();

            const timeoutPromise = new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 10000)
            );

            const results = await Promise.race([
              api.searchVideo(q, resource.key, signal).then(r => r.results),
              timeoutPromise
            ]) as SearchResult[] | null;

            if (signal.aborted) return;
            const latency = performance.now() - searchStart;

            if (results && results.length > 0) {
              await processAndSetResults(results, latency);
            }
          } catch (e) {
          } finally {
            completed++;
            updateProgress({ completed });
          }
        });

        await Promise.all(tasks);
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
    if (get().isOptimizing) return;

    set({ isOptimizing: true });
    logger.info(`[SPEED] Background source optimization started...`);

    const testController = new AbortController();
    const signal = testController.signal;

    try {
      const testBatchSize = 15;

      // 使用 while 循环配合快照检查，确保 init 过程中新发现的源也能被测速
      let hasUntested = true;
      const testedSources = new Set<string>();

      while (hasUntested && !signal.aborted) {
        const allResults = get().searchResults;
        const pending = allResults.filter(r => !testedSources.has(r.source));

        if (pending.length === 0) {
          hasUntested = false;
          break;
        }

        const batch = pending.slice(0, testBatchSize);
        await Promise.all(batch.map(async (item) => {
          if (signal.aborted) return;
          testedSources.add(item.source);
          try {
            let episodes = item.episodes;
            if (!episodes || episodes.length === 0) {
              const detail = await api.getVideoDetail(item.source, item.id.toString());
              episodes = detail.episodes || [];
            }

            if (episodes.length === 0 || signal.aborted) return;

            const testUrl = episodes.length > 1 ? episodes[1] : episodes[0];
            const metrics = await SpeedTestService.testM3U8Speed(testUrl, signal);

            if (signal.aborted) return;

            set(state => {
              const updatedResults = state.searchResults.map(r =>
                r.source === item.source ? { ...r, ...metrics } : r
              );
              return {
                searchResults: [...updatedResults].sort((a, b) => calculateSourceScore(b) - calculateSourceScore(a))
              };
            });
          } catch {}
        }));

        // 如果 init 还在进行中，稍等一下看有没有新源进来
        if (get().loading && !signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          // 如果 init 已经结束且当前批次就是最后一批，则退出
          if (pending.length <= testBatchSize) hasUntested = false;
        }
      }

      // [核心逻辑]：全网测速完成后，自动为用户切换到评分最高的源
      if (!signal.aborted) {
        const bestResults = get().searchResults;
        if (bestResults.length > 0) {
          const topSource = bestResults[0];
          const currentDetail = get().detail;

          // 只有当最优源与当前选中的源不同时，才执行自动优选切换
          if (currentDetail && topSource.source !== currentDetail.source) {
            logger.info(`[SPEED] Post-test optimization: Auto-switching to best verified source: ${topSource.source_name} (${topSource.speed} MB/s)`);
            set({ detail: topSource });

            // 异步补全详情数据
            if (!topSource.episodes || topSource.episodes.length === 0) {
              get().setDetail(topSource);
            }
          }
        }
      }
    } catch (e) {
      logger.warn('[SPEED] Optimization interrupted', e);
    } finally {
      set({ isOptimizing: false });
      logger.info(`[SPEED] Background source optimization finished.`);
    }
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
