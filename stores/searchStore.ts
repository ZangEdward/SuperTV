import { create } from "zustand";
import { SearchResult, api } from "@/services/api";
import { useSettingsStore } from "@/stores/settingsStore";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("SearchStore");

interface SearchState {
  keyword: string;
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  controller: AbortController | null;
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
      controller: newController
    });

    const { videoSource } = useSettingsStore.getState();

    try {
      // 1. 获取所有可用资源
      const allResources = await api.getResources(signal);

      // 2. 筛选出已启用的资源
      const enabledResources = videoSource.enabledAll
        ? allResources
        : allResources.filter((r) => videoSource.sources[r.key]);

      if (enabledResources.length === 0) {
        set({ error: "没有开启的播放源，请在设置中配置", loading: false });
        return;
      }

      let firstBatchFound = false;
      let totalFound = 0;

      // 3. 并行搜索，动态更新
      const searchPromises = enabledResources.map(async (resource) => {
        try {
          const { results } = await api.searchVideo(term, resource.key, signal);

          if (signal.aborted) return;

          if (results && results.length > 0) {
            totalFound += results.length;
            set((state) => {
              // 避免重复项（根据 title + source 简单去重，或者 server 返回的 id）
              const existingKeys = new Set(state.results.map(r => `${r.source}_${r.id}`));
              const newResults = results.filter(r => !existingKeys.has(`${r.source}_${r.id}`));

              if (newResults.length === 0) return state;

              const updatedResults = [...state.results, ...newResults];

              // 停止初始加载转圈（如果有数据了）
              if (!firstBatchFound) {
                firstBatchFound = true;
                return { results: updatedResults, loading: false };
              }
              return { results: updatedResults };
            });
          }
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            logger.warn(`Search failed for source ${resource.name}:`, err);
          }
        }
      });

      await Promise.all(searchPromises);

      if (signal.aborted) return;

      if (totalFound === 0) {
        // 降级策略：所有单源搜索都返回空时，尝试批量搜索端点
        // 参考 detailStore.ts 中的 fallback 机制
        logger.warn(`[WARN] All individual source searches returned 0 results for "${term}", trying bulk search endpoint`);
        try {
          const { results: fallbackResults } = await api.searchVideos(term);
          if (!signal.aborted && fallbackResults && fallbackResults.length > 0) {
            const filtered = fallbackResults.filter(item => {
              if (!item.title || !term) return false;
              return item.title.toLowerCase().includes(term.toLowerCase());
            });
            if (filtered.length > 0) {
              logger.info(`[SUCCESS] Fallback bulk search found ${filtered.length} results`);
              set({ results: filtered, loading: false });
            } else {
              logger.error(`[ERROR] Fallback bulk search found results but none matched "${term}"`);
              set({ error: `未找到 "${term}" 相关内容`, loading: false });
            }
          } else {
            set({ error: `未找到 "${term}" 相关内容`, loading: false });
          }
        } catch (fallbackError) {
          logger.error(`[ERROR] Fallback bulk search also failed:`, fallbackError);
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
