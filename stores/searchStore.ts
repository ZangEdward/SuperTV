import { create } from "zustand";
import { SearchResult, api } from "@/services/api";
import { DataCacheService } from "@/services/dataCacheService";
import { useSettingsStore } from "@/stores/settingsStore";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("SearchStore");

export interface SearchProgress {
  total: number;
  completed: number;
  currentSource: string | null;
  isComplete: boolean;
}

interface SearchState {
  keyword: string;
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  controller: AbortController | null;
  searchProgress: SearchProgress;
  useAggregatedView: boolean;

  // 筛选和排序
  selectedSource: string;
  selectedYear: string;
  selectedTitle: string;
  yearSortOrder: 'none' | 'asc' | 'desc';

  setKeyword: (keyword: string) => void;
  setUseAggregatedView: (use: boolean) => void;
  setFilters: (filters: Partial<Pick<SearchState, 'selectedSource' | 'selectedYear' | 'selectedTitle' | 'yearSortOrder'>>) => void;
  search: (keyword?: string) => Promise<void>;
  clearResults: () => void;
  abort: () => void;
}

const useSearchStore = create<SearchState>((set, get) => ({
  keyword: "",
  results: [],
  loading: false,
  error: null,
  controller: null,
  searchProgress: { total: 0, completed: 0, currentSource: null, isComplete: false },
  useAggregatedView: true,
  selectedSource: 'all',
  selectedYear: 'all',
  selectedTitle: 'all',
  yearSortOrder: 'none',

  setKeyword: (keyword) => set({ keyword }),
  setUseAggregatedView: (useAggregatedView) => set({ useAggregatedView }),
  setFilters: (filters) => set(filters),

  abort: () => {
    const { controller } = get();
    if (controller) {
      controller.abort();
      set({ controller: null });
    }
  },

  search: async (searchText) => {
    const term = searchText || get().keyword;
    if (!term.trim()) return;

    // Abort previous search
    get().abort();
    const newController = new AbortController();
    const signal = newController.signal;

    // [管理优化]：启动新搜索时释放旧的剧集详情缓存，保持内存健康
    DataCacheService.clearDetailCache();

    set({
      loading: true,
      error: null,
      results: [],
      controller: newController,
      searchProgress: { total: 0, completed: 0, currentSource: null, isComplete: false },
      // 重置筛选
      selectedSource: 'all',
      selectedYear: 'all',
      selectedTitle: 'all',
      yearSortOrder: 'none',
    });

    const updateProgress = (updates: Partial<SearchProgress>) => {
      if (signal.aborted) return;
      set(state => ({
        searchProgress: { ...state.searchProgress, ...updates }
      }));
    };

    const seenTitles = new Set<string>();

    const processAndAddResults = (results: SearchResult[]) => {
      if (signal.aborted || !results || results.length === 0) return;

      set((state) => {
        const newResults = results.filter(r => {
          const normalizedTitle = r.title.trim().toLowerCase();
          if (seenTitles.has(normalizedTitle)) return false;
          seenTitles.add(normalizedTitle);
          return true;
        });

        if (newResults.length === 0) return state;

        // 只要有了结果，就关闭全屏加载状态
        return {
          results: [...state.results, ...newResults],
          loading: false
        };
      });
    };

    try {
      const settingsStore = useSettingsStore.getState();
      const { videoSource } = settingsStore;
      let enabledResources = [];

      if (settingsStore.allSources && settingsStore.allSources.length > 0) {
        enabledResources = videoSource.enabledAll
          ? settingsStore.allSources
          : settingsStore.allSources.filter((r) => videoSource.sources[r.key]);
      } else {
        const allResources = await api.getResources(signal);
        enabledResources = videoSource.enabledAll
          ? allResources
          : allResources.filter((r) => videoSource.sources[r.key]);
      }

      if (enabledResources.length === 0) {
        set({ error: "没有开启的播放源，请在设置中配置", loading: false });
        return;
      }

      updateProgress({ total: enabledResources.length });

      let completed = 0;
      // 针对骁龙 8 系列优化：激进并发。底层 OkHttp 会自动处理连接复用。
      const MAX_CONCURRENT = 24;
      const queue = [...enabledResources];

      // [高性能调度]：采用原生网络池竞争机制
      const runWorker = async () => {
        while (queue.length > 0 && !signal.aborted) {
          const resource = queue.shift();
          if (!resource) break;

          try {
            // 降低超时到 8s，强制末尾淘汰，保证搜索体感
            const timeoutPromise = new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('TIMEOUT')), 8000)
            );

            // 底层使用 RNFetchBlob 触发原生 OkHttp 请求，绕过 JS fetch 的串行队列
            const results = await Promise.race([
              api.searchVideo(term, resource.key, signal).then(r => r.results),
              timeoutPromise
            ]) as SearchResult[] | null;

            if (!signal.aborted && results && results.length > 0) {
              // 搜到一个出一个，立即同步
              processAndAddResults(results);
            }
          } catch (err) {
            // 吞掉单源错误，保持静默搜索
          } finally {
            completed++;
            // 进度上报：采用简单的原子加，减少 UI 抖动
            if (completed % 2 === 0 || completed === enabledResources.length) {
              updateProgress({ completed });
            }
          }
        }
      };

      // 同时拉起 24 个原生网络竞争任务
      const workers = Array(Math.min(MAX_CONCURRENT, enabledResources.length))
        .fill(null)
        .map(() => runWorker());

      await Promise.all(workers);
      updateProgress({ isComplete: true, completed: enabledResources.length });

      if (signal.aborted) return;

      // 如果最终完全没有结果，尝试 fallback
      if (get().results.length === 0) {
        try {
          const { results: fallbackResults } = await api.searchVideos(term);
          if (!signal.aborted && fallbackResults && fallbackResults.length > 0) {
             const filtered = fallbackResults.filter(item =>
               item.title && item.title.toLowerCase().includes(term.toLowerCase())
             );
             if (filtered.length > 0) {
               set({ results: filtered, loading: false });
             } else {
               set({ error: `未找到 "${term}" 相关内容`, loading: false });
             }
          } else {
            set({ error: `未找到 "${term}" 相关内容`, loading: false });
          }
        } catch (fallbackError) {
          set({ error: `未找到 "${term}" 相关内容`, loading: false });
        }
      } else {
        set({ loading: false });
      }

    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        set({ error: "搜索失败，请稍后重试。", loading: false });
      }
    }
  },

  clearResults: () => {
    get().abort();
    set({ results: [], error: null, keyword: "" });
  },
}));

export default useSearchStore;
