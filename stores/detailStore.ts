import { create } from "zustand";
import { SearchResult, api } from "@/services/api";
import { getResolutionFromM3U8 } from "@/services/m3u8";
import { useSettingsStore } from "@/stores/settingsStore";
import { FavoriteManager } from "@/services/storage";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("DetailStore");

export type SearchResultWithResolution = SearchResult & {
  resolution?: string | null;
  latency?: number; // ⭐ 新增：延迟字段
};

interface DetailState {
  q: string | null;
  searchResults: SearchResultWithResolution[]; // ⭐ 全部源
  sourcesTop5: SearchResultWithResolution[];   // ⭐ 前 5 个最快源
  detail: SearchResultWithResolution | null;

  latencies: Record<string, number>; // ⭐ 保存测速结果
  setLatencies: (lat: Record<string, number>) => void;

  loading: boolean;
  error: string | null;
  allSourcesLoaded: boolean;
  controller: AbortController | null;
  isFavorited: boolean;
  failedSources: Set<string>;

  init: (q: string, preferredSource?: string, id?: string) => Promise<void>;
  setDetail: (detail: SearchResultWithResolution) => Promise<void>;
  abort: () => void;
  toggleFavorite: () => Promise<void>;
  markSourceAsFailed: (source: string, reason: string) => void;
  getNextAvailableSource: (
    currentSource: string,
    episodeIndex: number
  ) => SearchResultWithResolution | null;
}const useDetailStore = create<DetailState>((set, get) => ({
  q: null,
  searchResults: [],
  sourcesTop5: [],
  detail: null,

  latencies: {},

  setLatencies: (lat) => {
    const { searchResults } = get();

    // ⭐ 更新每个源的 latency 字段
    const updated = searchResults.map((s) => ({
      ...s,
      latency: lat[s.source] ?? Infinity,
    }));

    // ⭐ 按速度排序
    updated.sort((a, b) => (a.latency ?? 99999) - (b.latency ?? 99999));

    // ⭐ 更新前 5 个
    set({
      latencies: lat,
      searchResults: updated,
      sourcesTop5: updated.slice(0, 5),
      detail: updated[0] ?? null, // 默认选最快
    });
  },

  loading: true,
  error: null,
  allSourcesLoaded: false,
  controller: null,
  isFavorited: false,
  failedSources: new Set(),init: async (q, preferredSource, id) => {
    const old = get().controller;
    if (old) old.abort();

    const controller = new AbortController();
    const signal = controller.signal;

    set({
      q,
      loading: true,
      searchResults: [],
      sourcesTop5: [],
      detail: null,
      error: null,
      allSourcesLoaded: false,
      controller,
    });

    const { videoSource } = useSettingsStore.getState();

    const processResults = async (results: SearchResult[]) => {
      const processed = await Promise.all(
        results.map(async (item) => {
          let resolution = null;
          try {
            if (item.episodes?.length > 0) {
              resolution = await getResolutionFromM3U8(item.episodes[0], signal);
            }
          } catch {}
          return { ...item, resolution, latency: Infinity };
        })
      );

      if (signal.aborted) return;

      set({
        searchResults: processed,
        sourcesTop5: processed.slice(0, 5),
        detail: processed[0] ?? null,
      });
    };

    try {
      const res = await api.searchVideo(q, videoSource, signal);
      await processResults(res.results);
      set({ allSourcesLoaded: true });
    } catch (e) {
      if (!signal.aborted) {
        console.log("DetailStore.init error:", e);
        set({ error: "加载失败，请稍后重试", loading: false });
      }
    }

    set({ loading: false });
  },setDetail: async (detail) => {
    set({ detail });
  },

  abort: () => {
    const c = get().controller;
    if (c) c.abort();
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
    const failed = get().failedSources;
    failed.add(source);
    set({ failedSources: new Set(failed) });
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