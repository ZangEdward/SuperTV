import { create } from "zustand";
import { SearchResult, api } from "@/services/api";
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
  setKeyword: (keyword: string) => void;
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

  setKeyword: (keyword) => set({ keyword }),

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
      const batchSize = 8; // 进一步增加并发数，实现真正的极速搜索

      // 3. 分批并行搜索，动态异步刷新结果（极速模式）
      for (let i = 0; i < enabledResources.length; i += batchSize) {
        if (signal.aborted) break;
        const batch = enabledResources.slice(i, i + batchSize);

        await Promise.all(batch.map(async (resource) => {
          try {
            // 移除 currentSource 更新，减少 Bridge 通信开销，加速 UI 响应

            // 增加单源超时竞争
            const timeoutPromise = new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('TIMEOUT')), 5000)
            );

            const results = await Promise.race([
              api.searchVideo(term, resource.key, signal).then(r => r.results),
              timeoutPromise
            ]) as SearchResult[] | null;

            if (signal.aborted) return;
            if (results && results.length > 0) {
              processAndAddResults(results);
            }
          } catch (err) {
            logger.debug(`Search failed for source ${resource.name}`);
          } finally {
            completed++;
            updateProgress({ completed });
          }
        }));
      }

      updateProgress({ isComplete: true });

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
