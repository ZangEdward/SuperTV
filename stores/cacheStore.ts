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
  // download queue and concurrency control
  queue: GroupedDownload[];
  concurrency: number;
  activeCount: number;
  setConcurrency: (value: number) => void;
  processQueue?: () => void;
  enqueueSeries: (series: Omit<GroupedDownload, 'groupId' | 'episodes'> & { episodes: { index: number; url: string }[] }) => void;
  downloadQueuedEpisode: (groupId: string, episodeIndex: number) => Promise<void>;
  cancelQueuedEpisode: (groupId: string, episodeIndex: number) => Promise<void>;
  cancelGroup: (groupId: string) => Promise<void>;
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

export type QueuedEpisode = {
  index: number;
  url: string;
  status: 'pending' | 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  id?: string; // constructed id string
};

export type GroupedDownload = {
  groupId: string;
  source: string;
  title: string;
  poster: string;
  id: string; // original content id
  episodes: QueuedEpisode[];
};

const useCacheStore = create<CacheState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  currentDownloadId: null,
  downloadProgress: {},
  queue: [],
  concurrency: 2,
  activeCount: 0,

  setConcurrency: (value) => {
    const nextValue = Math.max(1, Math.min(10, value));
    set({ concurrency: nextValue });
    (get() as any).processQueue?.();
  },

  processQueue: () => {
    let state = get();
    while (state.activeCount < state.concurrency) {
      const next = state.queue.flatMap((group) => group.episodes.map((episode) => ({ groupId: group.groupId, episode })) ).find((item) => item.episode.status === 'queued');
      if (!next) break;
      get().downloadQueuedEpisode(next.groupId, next.episode.index);
      state = get();
    }
  },

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

  enqueueSeries: (series) => {
    const groupId = `${series.source}_${series.id}_${Date.now()}`;
    const episodes: QueuedEpisode[] = series.episodes.map((ep) => ({ index: ep.index, url: ep.url, status: 'pending' as const, progress: 0, id: `${series.source}_${series.id}_${ep.index}` }));
    const group: GroupedDownload = {
      groupId,
      source: series.source,
      title: series.title,
      poster: series.poster,
      id: series.id,
      episodes,
    };
    set((state) => ({ queue: [...state.queue, group] }));
    (get() as any).processQueue?.();
  },

  // start download for a queued episode respecting concurrency
  downloadQueuedEpisode: async (groupId, episodeIndex) => {
    const state = get();
    const group = state.queue.find((g) => g.groupId === groupId);
    if (!group) return;
    const ep = group.episodes.find((e) => e.index === episodeIndex);
    if (!ep) return;

    // mark as queued if concurrency full
    if (state.activeCount >= state.concurrency) {
      ep.status = 'queued';
      set({ queue: [...state.queue] });
      return;
    }

    // start downloading
    ep.status = 'downloading';
    ep.progress = 0;
    set((s) => ({ activeCount: s.activeCount + 1, queue: [...s.queue] }));
    const itemId = `${group.source}_${group.id}_${ep.index}`;
    set({ currentDownloadId: itemId, downloadProgress: { ...(get().downloadProgress || {}), [itemId]: 0 } });

    try {
      await CacheService.ensureDownloadDirectory();
      const fileName = CacheService.buildFileName(group.source, group.id, ep.index, ep.url);
      const fileUri = `${CacheService.getDownloadDirectory()}${fileName}`;

      let downloadUri = fileUri;
      if (ep.url.toLowerCase().includes('.m3u8')) {
        const controller = new AbortController();
        // store controller in a temporary map on the store instance
        (get() as any)._controllers = { ...(get() as any)._controllers || {}, [itemId]: controller };
        downloadUri = await CacheService.downloadM3U8AsMp4(ep.url, fileUri, controller.signal, (p) => {
          ep.progress = p;
          set((s) => ({ downloadProgress: { ...(s.downloadProgress || {}), [itemId]: p }, queue: [...s.queue] }));
        });
        delete (get() as any)._controllers[itemId];
      } else {
        // create DownloadResumable here so we can cancel later
        const resumable = FileSystem.createDownloadResumable(ep.url, fileUri, {}, (progress) => {
          if (progress.totalBytesExpectedToWrite > 0) {
            const p = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
            ep.progress = p;
            set((s) => ({ downloadProgress: { ...(s.downloadProgress || {}), [itemId]: p }, queue: [...s.queue] }));
          }
        });
        (get() as any)._controllers = { ...(get() as any)._controllers || {}, [itemId]: resumable };
        const res = await resumable.downloadAsync();
        if (!res || !res.uri) throw new Error('下载失败');
        downloadUri = res.uri;
        delete (get() as any)._controllers[itemId];
      }

      const cachedItem: CachedVideoItem = {
        id: itemId,
        source: group.source,
        source_name: group.title,
        title: group.title,
        poster: group.poster,
        episodeIndex: ep.index,
        episodeTitle: `第 ${ep.index + 1} 集`,
        fileUri: downloadUri,
        totalEpisodes: group.episodes.length,
        downloadedAt: Date.now(),
      };
      await CacheService.add(cachedItem);
      // mark completed
      ep.status = 'completed';
      ep.progress = 1;
      set((s) => ({ items: [cachedItem, ...s.items], currentDownloadId: null, activeCount: s.activeCount - 1, downloadProgress: { ...(s.downloadProgress || {}), [itemId]: 1 }, queue: [...s.queue] }));
    } catch (err) {
      logger.warn('downloadQueuedEpisode failed', err);
      ep.status = 'failed';
      set((s) => ({ currentDownloadId: null, activeCount: Math.max(0, s.activeCount - 1), queue: [...s.queue] }));
    }

    // process next queued episode(s) if there is now available capacity
    (get() as any).processQueue?.();
  },

  cancelQueuedEpisode: async (groupId, episodeIndex) => {
    const group = get().queue.find((g) => g.groupId === groupId);
    if (!group) return;
    const ep = group.episodes.find((e) => e.index === episodeIndex);
    if (!ep) return;
    const itemId = `${group.source}_${group.id}_${ep.index}`;
    const controllers = (get() as any)._controllers || {};
    const ctrl = controllers[itemId];
    if (ctrl) {
      try {
        if (typeof ctrl.abort === 'function') {
          ctrl.abort();
        } else if (typeof ctrl.pauseAsync === 'function') {
          await ctrl.pauseAsync();
        }
      } catch (e) {}
      delete controllers[itemId];
      set((s) => ({ queue: [...s.queue], activeCount: Math.max(0, s.activeCount - 1) }));
      (get() as any).processQueue?.();
    }
    ep.status = 'cancelled';
    ep.progress = 0;
    set({ queue: [...get().queue] });
  },

  cancelGroup: async (groupId) => {
    const group = get().queue.find((g) => g.groupId === groupId);
    if (!group) return;
    for (const ep of group.episodes) {
      if (ep.status === 'downloading' || ep.status === 'queued' || ep.status === 'pending') {
        await get().cancelQueuedEpisode(groupId, ep.index);
      }
    }
    // remove group
    set((s) => ({ queue: s.queue.filter((g) => g.groupId !== groupId) }));
    (get() as any).processQueue?.();
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
