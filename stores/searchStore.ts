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
    let term = searchText || get().keyword;
    if (!term.trim()) return;

    // 搜索时去除空格，提高源匹配成功率
    term = term.replace(/\s+/g, '');

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
        // [Selene 级存储策略]：不再在存储层进行去重合并，保留所有源的原始数据
        // 确保“火影忍者”和“火影忍者 疾风传”作为独立条目共存
        const newResults = [...state.results, ...results];

        // 仅进行物理去重（同源同ID去重）
        const uniqueResults = Array.from(new Map(newResults.map(r => [`${r.source}_${r.id}`, r])).values());

        // 填充详情池，供详情页秒开使用
        results.forEach(r => {
          const coreTitle = r.title.trim().toLowerCase();
          SearchDetailPool.set(`${coreTitle}_${r.source}`, r);
        });

        return {
          results: uniqueResults,
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

      // [策略升级]：除了 32 路节点检索，额外同步开启 1 路全网模糊检索，确保“火影忍者”能搜出全系列
      const globalSearchTask = api.searchVideos(term).then(res => {
        if (res && res.results) {
           processAndAddResults(res.results);
        }
      }).catch(() => {});

      await Promise.all([...workers, globalSearchTask]);

      // 所有任务完成后，最终同步状态
      if (!signal.aborted) {
        set({ loading: false });
        updateProgress({ isComplete: true, completed: enabledResources.length });

        // 如果结果集仍为空，可能是因为聚合太严格或真的没搜到
        if (resultMap.size === 0) {
           set({ error: `未找到 "${term}" 相关内容` });
        }
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
