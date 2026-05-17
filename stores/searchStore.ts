import { create } from "zustand";
import { SearchResult, api } from "@/services/api";

interface SearchState {
  keyword: string;
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  setKeyword: (keyword: string) => void;
  search: (keyword?: string) => Promise<void>;
  clearResults: () => void;
}

const useSearchStore = create<SearchState>((set, get) => ({
  keyword: "",
  results: [],
  loading: false,
  error: null,
  setKeyword: (keyword) => set({ keyword }),
  search: async (searchText) => {
    const term = searchText || get().keyword;
    if (!term.trim()) return;

    set({ loading: true, error: null });
    try {
      const response = await api.searchVideos(term);
      if (response.results.length > 0) {
        set({ results: response.results, loading: false });
      } else {
        set({ results: [], error: "没有找到相关内容", loading: false });
      }
    } catch (err) {
      set({ error: "搜索失败，请稍后重试。", loading: false });
    }
  },
  clearResults: () => set({ results: [], error: null, keyword: "" }),
}));

export default useSearchStore;
