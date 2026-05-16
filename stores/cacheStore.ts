import { create } from "zustand";
import * as FileSystem from "expo-file-system";
import Toast from "react-native-toast-message";
import { CacheService, CachedVideoItem } from "@/services/cacheService";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("CacheStore");

export interface CacheState {
  items: CachedVideoItem[];
  loading: boolean;
  error: string | null;
  currentDownloadId: string | null;
  downloadProgress: { [id: string]: number };
  loadCache: () => Promise<void>;
  downloadEpisode: (options: {
    source: string;
    source_name: string;
    title: string;
    poster: string;
    id: string;
    episodeIndex: number;
    episodeTitle: string;
    episodeUrl: string;
    totalEpisodes: number;
    resolution?: string | null;
  }) => Promise<void>;
  removeCacheItem: (id: string) => Promise<void>;
  clearCache: () => Promise<void>;
}

const useCacheStore = create<CacheState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  currentDownloadId: null,
  downloadProgress: {},

  loadCache: async () => {
    set({ loading: true, error: null });
    try {
      const items = await CacheService.getAll();
      set({ items, loading: false });
    } catch (error) {
      logger.warn("loadCache failed", error);
      set({ loading: false, error: "加载缓存失败" });
    }
  },

  downloadEpisode: async ({
    source,
    source_name,
    title,
    poster,
    id,
    episodeIndex,
    episodeTitle,
    episodeUrl,
    totalEpisodes,
    resolution,
  }) => {
    const itemId = `${source}_${id}_${episodeIndex}`;
    set({ currentDownloadId: itemId, downloadProgress: { ...(get().downloadProgress || {}), [itemId]: 0 } });

    try {
      await CacheService.ensureDownloadDirectory();
      const fileName = CacheService.buildFileName(source, id, episodeIndex, episodeUrl);
      const fileUri = `${CacheService.getDownloadDirectory()}${fileName}`;

      let downloadUri = fileUri;
      if (episodeUrl.toLowerCase().includes(".m3u8")) {
        downloadUri = await CacheService.downloadM3U8AsMp4(episodeUrl, fileUri, undefined, (p) => {
          set((state) => ({ downloadProgress: { ...(state.downloadProgress || {}), [itemId]: p } }));
        });
      } else {
        downloadUri = await CacheService.downloadFileWithProgress(episodeUrl, fileUri, (p) => {
          set((state) => ({ downloadProgress: { ...(state.downloadProgress || {}), [itemId]: p } }));
        });
      }

      const cachedItem: CachedVideoItem = {
        id: itemId,
        source,
        source_name,
        title,
        poster,
        episodeIndex,
        episodeTitle,
        fileUri: downloadUri,
        totalEpisodes,
        downloadedAt: Date.now(),
        resolution,
      };

      await CacheService.add(cachedItem);
      set((state) => ({ items: [cachedItem, ...state.items], currentDownloadId: null, downloadProgress: { ...(state.downloadProgress || {}), [itemId]: 1 } }));
      Toast.show({ type: "success", text1: "下载完成", text2: `${title} ${episodeTitle}` });
    } catch (error) {
      logger.warn("downloadEpisode failed", error);
      set({ currentDownloadId: null, downloadProgress: { ...(get().downloadProgress || {}) } });
      Toast.show({ type: "error", text1: "下载失败", text2: `${title} ${episodeTitle}` });
    }
  },

  removeCacheItem: async (id) => {
    set({ loading: true, error: null });
    try {
      const existing = get().items.find((item) => item.id === id);
      if (existing) {
        await CacheService.deleteFile(existing.fileUri);
      }
      await CacheService.remove(id);
      const next = get().items.filter((item) => item.id !== id);
      const dp = { ...(get().downloadProgress || {}) };
      delete dp[id];
      set((state) => ({ items: next, loading: false, downloadProgress: dp }));
      Toast.show({ type: "success", text1: "已删除缓存" });
    } catch (error) {
      logger.warn("removeCacheItem failed", error);
      set({ loading: false, error: "删除失败" });
      Toast.show({ type: "error", text1: "删除失败" });
    }
  },
  clearCache: async () => {
    set({ loading: true, error: null });
    try {
      await CacheService.clearAll();
      set({ items: [], loading: false, downloadProgress: {} });
      Toast.show({ type: "success", text1: "缓存已清除" });
    } catch (error) {
      logger.warn("clearCache failed", error);
      set({ loading: false, error: "清除缓存失败" });
      Toast.show({ type: "error", text1: "清除缓存失败" });
    }
  },
}));

export default useCacheStore;
