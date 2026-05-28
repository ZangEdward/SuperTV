import { create } from "zustand";
import { SearchResult, api } from "@/services/api";
import { getResolutionFromM3U8 } from "@/services/m3u8";
import { useSettingsStore } from "@/stores/settingsStore";
import { FavoriteManager } from "@/services/storage";
import { SpeedTestService } from "@/services/speedTestService";
import useSearchStore, { SearchDetailPool, populateDetailPool } from "./searchStore"; // 引入内存详情池
import Logger from "@/utils/Logger";

const logger = Logger.withTag('DetailStore');

/**
 * 将中文数字归一化为阿拉伯数字，用于模糊匹配
 * 例: "第四季" → "第4季", "一百二十三" → "123"
 */
function normalizeChineseNumbers(str: string): string {
  const chineseNumMap: Record<string, string> = {
    '零': '0', '一': '1', '二': '2', '三': '3', '四': '4',
    '五': '5', '六': '6', '七': '7', '八': '8', '九': '9',
    '〇': '0', '两': '2',
  };
  let result = '';
  for (const char of str) {
    result += chineseNumMap[char] || char;
  }
  return result;
}

/**
 * 增强标题匹配：先将中文数字归一化后再比较
 * 支持 "第四季" == "第4季", "第三集" == "第3集" 等
 */
function titleMatches(searchTitle: string, targetTitle: string): boolean {
  const s = searchTitle.replace(/\s+/g, '').toLowerCase();
  const t = targetTitle.replace(/\s+/g, '').toLowerCase();
  // 精确匹配
  if (s === t) return true;
  // 归一化中文数字后匹配
  const sNorm = normalizeChineseNumbers(s);
  const tNorm = normalizeChineseNumbers(t);
  if (sNorm === tNorm) return true;
  // includes 匹配
  if (t.includes(s) || s.includes(t)) return true;
  // 归一化后 includes 匹配
  if (tNorm.includes(sNorm) || sNorm.includes(tNorm)) return true;
  return false;
}

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
  isOptimizing: boolean;
  _initStartTime: number; // init 开始时间戳，用于快速回退时间窗口

  init: (q: string, preferredSource?: string, id?: string) => Promise<void>;
  setDetail: (detail: SearchResultWithResolution) => Promise<void>;
  abort: () => void;
  toggleFavorite: () => Promise<void>;
  markSourceAsFailed: (source: string, reason: string) => void;
  getNextAvailableSource: (currentSource: string, episodeIndex: number) => SearchResultWithResolution | null;
  getQuickFallbackSources: (currentSource: string, episodeIndex: number, maxAgeMs?: number) => SearchResultWithResolution[];
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
  _initStartTime: 0,

  init: async (q, preferredSource, id) => {
    const perfStart = performance.now();
    // 保存原始查询词（含空格），用于渐进式模糊搜索
    const rawQuery = q || "";
    // 强制去除空格进行搜索，适配某些源的严格匹配
    q = (q || "").replace(/\s+/g, '');
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
      _initStartTime: Date.now(),
    });

    const { videoSource } = useSettingsStore.getState();

    // [资料源识别]：豆瓣和 Bangumi 仅提供资料，不提供视频
    const isMetadataSource = preferredSource === "douban" || preferredSource === "bangumi";

    // [预载入优化]：从内存池秒开——只使用精确 key 匹配，避免子串匹配导致缓存错视频
    if (!isMetadataSource && preferredSource) {
      const qLower = q.trim().toLowerCase();
      // 只尝试精确 key 变体（去符号），不用子串匹配
      const poolKeys = [
        `${qLower}_${preferredSource}`,
        `${qLower.replace(/[\s+·./\\()（）【】\[\]《》{}：:、;；，,。！？!?""'『』«»\-—–—_*~`@#$%^&|<>]+/g, '')}_${preferredSource}`,
      ];

      for (const key of poolKeys) {
        const poolResult = SearchDetailPool.get(key);
        if (poolResult) {
          // 验证缓存结果的标题确实匹配搜索词（防止缓存错乱）
          const poolTitle = (poolResult.title || "").replace(/\s+/g, '').toLowerCase();
          if (titleMatches(qLower, poolTitle)) {
            set({
              searchResults: [poolResult as SearchResultWithResolution],
              detail: poolResult as SearchResultWithResolution,
              loading: false,
              error: null,
            });
            logger.info(`[POOL] Cache hit for "${q}" → "${poolResult.title}" (${poolResult.source_name})`);
          }
          break;
        }
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
      const searchTitle = q.replace(/\s+/g, '').toLowerCase();

      // 使用增强匹配（支持中文数字归一化）
      const matchedResults = results.filter(r => {
        const targetTitle = (r.title || "").replace(/\s+/g, '').toLowerCase();
        return titleMatches(searchTitle, targetTitle);
      });

      if (matchedResults.length === 0) {
        // 无匹配结果，尝试对 q 和结果都做中文数字归一化后重新匹配
        const qNorm = normalizeChineseNumbers(searchTitle);
        const normMatched = results.filter(r => {
          const targetTitle = (r.title || "").replace(/\s+/g, '').toLowerCase();
          const tNorm = normalizeChineseNumbers(targetTitle);
          return tNorm.includes(qNorm) || qNorm.includes(tNorm);
        });
        if (normMatched.length > 0) {
          logger.info(`[MATCH] Normalized number match found ${normMatched.length} results`);
          matchedResults.push(...normMatched);
        }
      }

      if (matchedResults.length === 0) {
        // [关键修复]：如果是在资料源路径下且这是第一个结果，无条件信任它
        if (isMetadataSource && state.searchResults.length === 0) {
          matchedResults.push(results[0]);
        } else {
          if (get().detail) set({ loading: false });
          return;
        }
      }

      // [源去重与合并]
      const resultsWithLatency = matchedResults.map(r => ({ ...r, latency: defaultLatency }));
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

      // [关键] 将搜索结果填充到 SearchDetailPool，供下次秒开使用
      populateDetailPool(results);

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

        let preferredResult: SearchResult[] = [];
        let preferredSearchError: any = null;

        try {
          const response = await api.searchVideo(q, preferredSource, signal);
          preferredResult = response.results;
        } catch (error) {
          preferredSearchError = error;
          logger.warn(`Preferred source "${preferredSource}" failed:`, error);
        }

        if (signal.aborted) return;

        if (preferredResult.length > 0) {
          // 首选源成功
          logger.info(`[SUCCESS] Preferred source "${preferredSource}" found ${preferredResult.length} results`);
          await processAndSetResults(preferredResult, 0);
          set({ loading: false });

          // 后台异步搜索其他源做换源备选（不阻塞）
          api.searchVideos(q).then(response => {
            if (!signal.aborted && response.results.length > 0) {
              const exactMatches = response.results.filter(r => {
                const targetTitle = (r.title || "").replace(/\s+/g, '').toLowerCase();
                const searchTitle = q.replace(/\s+/g, '').toLowerCase();
                return titleMatches(searchTitle, targetTitle);
              });
              if (exactMatches.length > 0) {
                processAndSetResults(exactMatches, 100);
              }
            }
          }).catch(() => {});

        } else {
          // 首选源失败→同步搜索所有源
          logger.warn(`[FALLBACK] Preferred source "${preferredSource}" failed/empty, trying all sources`);

          try {
            const { results: allResults } = await api.searchVideos(q);

            // 用 titleMatches 精确匹配
            const searchTitle = q.replace(/\s+/g, '').toLowerCase();
            let filteredResults = allResults.filter(r => {
              const targetTitle = (r.title || "").replace(/\s+/g, '').toLowerCase();
              return titleMatches(searchTitle, targetTitle);
            });

            // 精确匹配不到→渐进去尾重搜
            // 1) 有空格时：1 2 3 4 → 123 → 12 → 1
            // 2) 无空格时：逐步去掉尾部字符
            if (filteredResults.length === 0) {
              const searchTerms: string[] = [];
              const trimmed = rawQuery.trim();

              // 按空格分词渐进
              const parts = trimmed.split(/\s+/);
              if (parts.length > 1) {
                for (let len = parts.length - 1; len >= 1; len--) {
                  searchTerms.push(parts.slice(0, len).join('').replace(/\s+/g, ''));
                }
              }

              // 无空格或空格渐进无效时，按字符级逐步去掉尾部
              // "第四季丧失篇" → "第四季丧失" → "第四季丧" → "第四季" → ...
              const noSpaces = trimmed.replace(/\s+/g, '');
              if (noSpaces.length > 4) {
                for (let len = noSpaces.length - 2; len >= Math.max(2, Math.floor(noSpaces.length * 0.4)); len -= 2) {
                  const suffixRemoved = noSpaces.substring(0, len);
                  if (!searchTerms.includes(suffixRemoved)) {
                    searchTerms.push(suffixRemoved);
                  }
                }
              }

              for (const progressive of searchTerms) {
                if (signal.aborted) break;
                try {
                  const { results: progResults } = await api.searchVideos(progressive);
                  filteredResults = progResults.filter(r => {
                    const targetTitle = (r.title || "").replace(/\s+/g, '').toLowerCase();
                    return titleMatches(progressive, targetTitle);
                  });
                  if (filteredResults.length > 0) {
                    logger.info(`[FALLBACK] Progressive "${progressive}" matched ${filteredResults.length} results`);
                    break;
                  }
                } catch { continue; }
              }
            }

            if (filteredResults.length > 0) {
              await processAndSetResults(filteredResults, 100);
              set({ loading: false });
            } else {
              const errorMsg = `未找到 "${q}" 的播放源`;
              logger.error(`[ERROR] ${errorMsg}`);
              set({ error: errorMsg, loading: false });
            }
          } catch (fallbackError) {
            logger.error(`[FALLBACK] Search failed:`, fallbackError);
            set({ error: `搜索失败：${fallbackError instanceof Error ? fallbackError.message : '网络错误'}`, loading: false });
          }
        }

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
    logger.info(`[SPEED] Quick source optimization started...`);

    const QUICK_TEST_TIMEOUT = 2000;
    const testController = new AbortController();
    const signal = testController.signal;
    const speedTestTimeout = setTimeout(() => testController.abort(), QUICK_TEST_TIMEOUT);

    try {
      // 取有剧集的所有源（不排除失败源，手动触发时应重新测）
      const allResults = get().searchResults;
      const candidates = allResults.filter(r => r.episodes && r.episodes.length > 0);

      if (candidates.length === 0) {
        logger.warn(`[SPEED] No sources available for testing`);
        set({ isOptimizing: false });
        return;
      }

      logger.info(`[SPEED] Quick testing ${candidates.length} sources with ${QUICK_TEST_TIMEOUT}ms budget...`);

      // 并行测速所有候选源，2 秒截止
      const testResults = await Promise.all(
        candidates.map(async (item) => {
          if (signal.aborted) return null;
          const testUrl = item.episodes!.length > 1 ? item.episodes![1] : item.episodes![0];
          if (!testUrl) return null;
          const metrics = await SpeedTestService.testM3U8Speed(testUrl, signal);
          return { source: item.source, ...metrics };
        })
      );
      clearTimeout(speedTestTimeout);

      // 写回测速结果并重排
      const sourceMap = new Map<string, { speed: number; latency: number }>();
      for (const r of testResults) {
        if (r) sourceMap.set(r.source, { speed: r.speed, latency: r.latency });
      }

      set(state => {
        const updatedResults = state.searchResults.map(r => {
          const data = sourceMap.get(r.source);
          return data ? { ...r, speed: data.speed, latency: data.latency } : r;
        });
        return { searchResults: updatedResults.sort((a, b) => calculateSourceScore(b) - calculateSourceScore(a)) };
      });

      // 测速完成后自动切换到评分最高的源
      if (!signal.aborted) {
        const bestResults = get().searchResults;
        if (bestResults.length > 0) {
          const topSource = bestResults[0];
          const currentDetail = get().detail;

          if (currentDetail && topSource.source !== currentDetail.source) {
            logger.info(`[SPEED] Auto-switching to best source: ${topSource.source_name} (score: ${calculateSourceScore(topSource).toFixed(1)})`);
            set({ detail: topSource });

            if (!topSource.episodes || topSource.episodes.length === 0) {
              get().setDetail(topSource);
            }
          }
        }
      }
    } catch (e) {
      clearTimeout(speedTestTimeout);
      logger.warn('[SPEED] Optimization interrupted', e);
    } finally {
      set({ isOptimizing: false });
      logger.info(`[SPEED] Quick source optimization finished.`);
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

    // 使用 calculateSourceScore 多维度加权排序（速度40% + 延迟30% + 分辨率20% + 稳定性10%）
    const sortedSources = [...availableSources].sort(
      (a, b) => calculateSourceScore(b) - calculateSourceScore(a)
    );

    return sortedSources[0];
  },

  getQuickFallbackSources: (currentSource: string, episodeIndex: number) => {
    const { searchResults, failedSources } = get();

    // 只过滤掉当前失败源和已标记失败的源
    // 时间窗口由 init 中 background search 的 1s Promise.race 保证
    return searchResults.filter(result =>
      result.source !== currentSource &&
      !failedSources.has(result.source) &&
      result.episodes &&
      result.episodes.length > episodeIndex
    );
  },
}));

export default useDetailStore;
