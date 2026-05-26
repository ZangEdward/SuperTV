import { create } from "zustand";
import { SearchResult, api } from "@/services/api";
import { useSettingsStore } from "@/stores/settingsStore";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("SearchStore");

// [内存级详情池]：用于实现搜索到详情的秒开过渡
export const SearchDetailPool = new Map<string, SearchResult>();

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

    // [智能聚合池] 用于在搜索过程中合并同名剧集
    const resultMap = new Map<string, SearchResult>();

    const processAndAddResults = (results: SearchResult[]) => {
      if (signal.aborted || !results || results.length === 0) return;

      set((state) => {
        results.forEach(r => {
          // [智能指纹]：保留季/部/剧场版等核心信息，仅剔除资源站/清晰度等标签
          const titleFingerprint = r.title
            .trim()
            .replace(/\[.*?\]|\(.*?\)|【.*?】/g, '') // 剔除 [1080P]、(蓝光) 等
            .replace(/\s+/g, '')
            .toLowerCase();

          // 聚合 Key：指纹 + 年份 + 类型。确保第一季/第二季互不干扰
          const key = `${titleFingerprint}_${r.year || '0'}_${r.type_name || 'vod'}`;

          const existing = resultMap.get(key);
          if (!existing) {
            resultMap.set(key, r);
            // 同时更新内存详情池，供详情页秒开使用
            SearchDetailPool.set(`${r.title.trim().toLowerCase()}_${r.source}`, r);
          } else {
            // 同一指纹的作品，合并到一起，并保留集数最多的源
            if ((r.episodes?.length || 0) > (existing.episodes?.length || 0)) {
              resultMap.set(key, { ...r });
            }
          }
        });

        // [核心优化]：只要有了第一个有效结果，立即打破全屏加载状态，展现界面
        return {
          results: Array.from(resultMap.values()),
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
      // [高性能提升] 针对骁龙 8 系列优化：32 路暴力并发
      const MAX_CONCURRENT = 32;
      const queue = [...enabledResources];

      const runWorker = async () => {
        while (queue.length > 0 && !signal.aborted) {
          const resource = queue.shift();
          if (!resource) break;

          try {
            const timeoutPromise = new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('TIMEOUT')), 8000)
            );

            const results = await Promise.race([
              api.searchVideo(term, resource.key, signal).then(r => r.results),
              timeoutPromise
            ]) as SearchResult[] | null;

            if (!signal.aborted && results && results.length > 0) {
              processAndAddResults(results);
            }
          } catch (err) {
          } finally {
            completed++;
            if (completed % 2 === 0 || completed === enabledResources.length) {
              updateProgress({ completed });
            }
          }
        }
      };

      const workers = Array(Math.min(MAX_CONCURRENT, enabledResources.length))
        .fill(null)
        .map(() => runWorker());

      await Promise.all(workers);

      // 所有 worker 完成后，最终同步状态
      if (!signal.aborted) {
        set({ loading: false });
        updateProgress({ isComplete: true, completed: enabledResources.length });

        if (resultMap.size === 0) {
           // 仅在确认完全无结果时显示错误
           set({ error: `未找到 "${term}" 相关内容` });
        }
      }

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
