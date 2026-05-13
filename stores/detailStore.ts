import { create } from "zustand";
import { SearchResult, api } from "@/services/api";
import { getResolutionFromM3U8 } from "@/services/m3u8";
import { useSettingsStore } from "@/stores/settingsStore";
import { FavoriteManager } from "@/services/storage";
import Logger from "@/utils/Logger";

const logger = Logger.withTag('DetailStore');

export type SearchResultWithResolution = SearchResult & {
  resolution?: string | null;
  latency?: number; // ⭐ 新增：延迟字段
};

interface DetailState {
  q: string | null;
  searchResults: SearchResultWithResolution[];
  sourcesTop5: SearchResultWithResolution[]; // ⭐ 新增：前 5 个最快源
  detail: SearchResultWithResolution | null;
  loading: boolean;
  error: string | null;
  allSourcesLoaded: boolean;
  controller: AbortController | null;
  isFavorited: boolean;
  failedSources: Set<string>;

  latencies: Record<string, number>; // ⭐ 新增：保存测速结果
  setLatencies: (lat: Record<string, number>) => void;

  init: (q: string, preferredSource?: string, id?: string) => Promise<void>;
  setDetail: (detail: SearchResultWithResolution) => Promise<void>;
  abort: () => void;
  toggleFavorite: () => Promise<void>;
  markSourceAsFailed: (source: string, reason: string) => void;
  getNextAvailableSource: (currentSource: string, episodeIndex: number) => SearchResultWithResolution | null;
}

const useDetailStore = create<DetailState>((set, get) => ({
  q: null,
  searchResults: [],
  sourcesTop5: [], // ⭐ 新增
  detail: null,
  loading: true,
  error: null,
  allSourcesLoaded: false,
  controller: null,
  isFavorited: false,
  failedSources: new Set(),

  latencies: {}, // ⭐ 新增
  setLatencies: (lat) => {
    set({ latencies: lat });

    // ⭐ 更新 searchResults 中的 latency 字段
    const { searchResults } = get();
    const updated = searchResults.map((s) => ({
      ...s,
      latency: lat[s.source] ?? Infinity,
    }));

    // ⭐ 排序
    updated.sort((a, b) => (a.latency ?? 99999) - (b.latency ?? 99999));

    // ⭐ 更新前 5 个
    set({
      searchResults: updated,
      sourcesTop5: updated.slice(0, 5),
      detail: updated[0] ?? null, // 默认选最快
    });
  },

  init: async (q, preferredSource, id) => {
    const { controller: oldController } = get();
    if (oldController) oldController.abort();

    const newController = new AbortController();
    const signal = newController.signal;

    set({
      q,
      loading: true,
      searchResults: [],
      sourcesTop5: [],
      detail: null,
      error: null,
      allSourcesLoaded: false,
      controller: newController,
    });

    const processAndSetResults = async (results: SearchResult[]) => {
      const resultsWithResolution = await Promise.all(
        results.map(async (searchResult) => {
          let resolution = null;
          try {
            if (searchResult.episodes?.length > 0) {
              resolution = await getResolutionFromM3U8(searchResult.episodes[0], signal);
            }
          } catch {}
          return { ...searchResult, resolution, latency: Infinity };
        })
      );

      if (signal.aborted) return;

      // ⭐ 初次加载：不排序（等待测速）
      set({
        searchResults: resultsWithResolution,
        sourcesTop5: resultsWithResolution.slice(0, 5),
        detail: resultsWithResolution[0] ?? null,
      });
    };

    try {
      const response = await api.searchVideo(q, preferredSource, signal);
      await processAndSetResults(response.results);
      set({ allSourcesLoaded: true });
    } catch (e) {
      if (!signal.aborted) {
        set({ error: "加载失败，请稍后重试", loading: false });
      }
    }

    set({ loading: false });
  },

  setDetail: async (detail) => {
    set({ detail });
  },

  abort: () => {
    const { controller } = get();
    if (controller) controller.abort();
  },

  toggleFavorite: async () => {
    const { detail, isFavorited } = get();
    if (!detail) return;

    if (isFavorited) {
      await FavoriteManager.remove(detail);
      set({ isFavorited: false });
    } else {
      await FavoriteManager.add(detail);
      set({ isFavorited: true });
    }
  },

  markSourceAsFailed: (source, reason) => {
    const { failedSources } = get();
    failedSources.add(source);
    set({ failedSources: new Set(failedSources) });
  },

  getNextAvailableSource: (currentSource) => {
    const { searchResults, failedSources } = get();
    const sorted = [...searchResults].sort(
      (a, b) => (a.latency ?? 99999) - (b.latency ?? 99999)
    );

    for (const s of sorted) {
      if (s.source !== currentSource && !failedSources.has(s.source)) {
        return s;
      }
    }
    return null;
  },
}));

export default useDetailStore;