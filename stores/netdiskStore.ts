import { create } from "zustand";
import { api } from "@/services/api";
import Logger from "@/utils/Logger";

const logger = Logger.withTag('NetDiskStore');

export interface NetDiskItem {
  url: string;
  password?: string;
  note: string;
  datetime: string;
  source: string;
  images?: string[];
}

export interface NetDiskResults {
  quark: NetDiskItem[];
  magnet: NetDiskItem[];
  baidu: NetDiskItem[];
}

interface NetDiskState {
  keyword: string;
  results: NetDiskResults;
  loading: boolean;
  error: string | null;
  setKeyword: (keyword: string) => void;
  search: (query?: string) => Promise<void>;
  clearResults: () => void;
}

const useNetDiskStore = create<NetDiskState>((set, get) => ({
  keyword: "",
  results: { quark: [], magnet: [], baidu: [] },
  loading: false,
  error: null,

  setKeyword: (keyword) => set({ keyword }),

  search: async (query) => {
    const searchKeyword = query || get().keyword;
    if (!searchKeyword.trim()) return;

    set({ loading: true, error: null });

    try {
      const response = await api.searchNetDisk(searchKeyword);
      if (response.success && response.data) {
        const merged = response.data.merged_by_type || {};
        set({
          results: {
            quark: merged.quark || [],
            magnet: merged.magnet || [],
            baidu: merged.baidu || [],
          },
          loading: false
        });
      } else {
        set({ error: "未找到结果", loading: false });
      }
    } catch (e) {
      logger.error("NetDisk search failed:", e);
      set({ error: "搜索请求失败", loading: false });
    }
  },

  clearResults: () => set({ results: { quark: [], magnet: [], baidu: [] }, error: null, keyword: "" }),
}));

export default useNetDiskStore;
