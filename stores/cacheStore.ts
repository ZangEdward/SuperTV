import { create } from "zustand";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  pauseQueuedEpisode: (groupId: string, episodeIndex: number) => Promise<void>;
  resumeQueuedEpisode: (groupId: string, episodeIndex: number) => Promise<void>;
  cancelQueuedEpisode: (groupId: string, episodeIndex: number) => Promise<void>;
  cancelGroup: (groupId: string) => Promise<void>;
  retryDownload: (groupId: string, episodeIndex: number) => void;
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
  removeSeries: (title: string) => Promise<void>;
  clearCache: () => Promise<void>;
  pauseAll: () => Promise<void>;
  resumeAll: () => Promise<void>;
}

export type QueuedEpisode = {
  index: number;
  url: string;
  status: 'pending' | 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled' | 'paused';
  progress?: number;
  completedCount?: number; // 新增：已完成的分片数量，用于断点续传
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
    const state = get();
    // 重新计算真实的 activeCount 以防泄漏
    const realActiveCount = state.queue.reduce(
      (acc, group) => acc + group.episodes.filter(ep => ep.status === 'downloading').length,
      0
    );

    set({ activeCount: realActiveCount });

    let currentActive = realActiveCount;
    while (currentActive < state.concurrency) {
      const next = state.queue
        .flatMap((group) => group.episodes.map((episode) => ({ groupId: group.groupId, episode })))
        .find((item) => item.episode.status === 'queued' || item.episode.status === 'pending');

      if (!next) break;
      get().downloadQueuedEpisode(next.groupId, next.episode.index);
      currentActive++;
    }
  },

  loadCache: async () => {
    const state = get();
    // 只有当内存中已经有活跃任务且队列不为空时，才跳过从存储加载队列
    const hasActiveTasks = state.queue.length > 0 && state.queue.some(g => g.episodes.some(e => e.status === 'downloading'));

    set({ loading: true, error: null });
    try {
      await CacheService.ensureDownloadDirectory();
      const items = await CacheService.getAll();

      if (!hasActiveTasks) {
        const queue = await CacheService.getQueue();
        set({ items, queue, loading: false });
      } else {
        set({ items, loading: false });
      }
    } catch (error) {
      logger.warn("loadCache failed", error);
      set({ loading: false, error: "加载缓存失败" });
    }
  },

  enqueueSeries: (series) => {
    const groupId = `${series.source}_${series.id}_${Date.now()}`;
    const episodes: QueuedEpisode[] = series.episodes.map((ep) => ({ index: ep.index, url: ep.url, status: 'pending' as const, progress: 0, completedCount: 0, id: `${series.source}_${series.id}_${ep.index}` }));
    const group: GroupedDownload = {
      groupId,
      source: series.source,
      title: series.title,
      poster: series.poster,
      id: series.id,
      episodes,
    };
    set((state) => ({ queue: [...state.queue, group] }));
    CacheService.saveQueue(get().queue);
    (get() as any).processQueue?.();
  },

  // start download for a queued episode respecting concurrency
  downloadQueuedEpisode: async (groupId, episodeIndex) => {
    const state = get();
    const groupIndex = state.queue.findIndex((g) => g.groupId === groupId);
    if (groupIndex === -1) return;

    const epIndex = state.queue[groupIndex].episodes.findIndex((e) => e.index === episodeIndex);
    if (epIndex === -1) return;

    const ep = state.queue[groupIndex].episodes[epIndex];

    // 如果已经在下载中，不要重复启动
    if (ep.status === 'downloading') return;

    // mark as queued if concurrency full
    if (state.activeCount >= state.concurrency) {
      const nextQueue = [...state.queue];
      nextQueue[groupIndex].episodes[epIndex].status = 'queued';
      set({ queue: nextQueue });
      return;
    }

    // start downloading
    const nextQueue = [...state.queue];
    nextQueue[groupIndex].episodes[epIndex].status = 'downloading';
    // 保留原有进度，如果是新开始则为0
    nextQueue[groupIndex].episodes[epIndex].progress = ep.progress || 0;

    set((s) => ({
      activeCount: s.activeCount + 1,
      queue: nextQueue
    }));

    const itemId = `${state.queue[groupIndex].source}_${state.queue[groupIndex].id}_${ep.index}`;
    set({ currentDownloadId: itemId, downloadProgress: { ...(get().downloadProgress || {}), [itemId]: ep.progress || 0 } });

    try {
      await CacheService.ensureDownloadDirectory();
      const fileName = CacheService.buildFileName(state.queue[groupIndex].source, state.queue[groupIndex].id, ep.index, ep.url);
      const fileUri = `${CacheService.getDownloadDirectory()}${fileName}`;

      let downloadUri = fileUri;
      if (ep.url.toLowerCase().includes('.m3u8')) {
        // 传递 itemId 以支持暂停/继续，并支持断点续传 (completedCount)
        (get() as any)._controllers = { ...(get() as any)._controllers || {}, [itemId]: 'm3u8' };
        downloadUri = await CacheService.downloadM3U8AsMp4(ep.url, fileUri, itemId, undefined, (p, cc) => {
          const q = get().queue;
          const gi = q.findIndex(g => g.groupId === groupId);
          if (gi !== -1) {
            const ei = q[gi].episodes.findIndex(e => e.index === episodeIndex);
            if (ei !== -1) {
              q[gi].episodes[ei].progress = p;
              q[gi].episodes[ei].completedCount = cc;
              set({
                downloadProgress: { ...(get().downloadProgress || {}), [itemId]: p },
                queue: [...q]
              });
              // 提高保存频率：每5个片段保存一次进度
              if (cc % 5 === 0) CacheService.saveQueue(q);
            }
          }
        }, { resumeIndex: ep.completedCount || 0 });
        delete (get() as any)._controllers[itemId];
      } else {
        // create DownloadResumable here so we can cancel later
        const resumable = FileSystem.createDownloadResumable(ep.url, fileUri, {}, (progress) => {
          if (progress.totalBytesExpectedToWrite > 0) {
            const p = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
            const q = get().queue;
            const gi = q.findIndex(g => g.groupId === groupId);
            if (gi !== -1) {
              const ei = q[gi].episodes.findIndex(e => e.index === episodeIndex);
              if (ei !== -1) {
                q[gi].episodes[ei].progress = p;
                set({
                  downloadProgress: { ...(get().downloadProgress || {}), [itemId]: p },
                  queue: [...q]
                });
              }
            }
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
        source: state.queue[groupIndex].source,
        source_name: state.queue[groupIndex].title,
        title: state.queue[groupIndex].title,
        poster: state.queue[groupIndex].poster,
        episodeIndex: ep.index,
        episodeTitle: `第 ${ep.index + 1} 集`,
        fileUri: downloadUri,
        totalEpisodes: state.queue[groupIndex].episodes.length,
        downloadedAt: Date.now(),
      };
      await CacheService.add(cachedItem);

      // mark completed
      const finalQueue = get().queue;
      const fgi = finalQueue.findIndex(g => g.groupId === groupId);
      if (fgi !== -1) {
        const fei = finalQueue[fgi].episodes.findIndex(e => e.index === episodeIndex);
        if (fei !== -1) {
          finalQueue[fgi].episodes[fei].status = 'completed';
          finalQueue[fgi].episodes[fei].progress = 1;
        }
      }

      set((s) => ({
        items: [cachedItem, ...s.items],
        currentDownloadId: null,
        activeCount: Math.max(0, s.activeCount - 1),
        downloadProgress: { ...(s.downloadProgress || {}), [itemId]: 1 },
        queue: [...finalQueue]
      }));
      await CacheService.saveQueue(get().queue);
    } catch (err) {
      logger.warn('downloadQueuedEpisode failed', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorQueue = get().queue;
      const egi = errorQueue.findIndex(g => g.groupId === groupId);
      if (egi !== -1) {
        const eei = errorQueue[egi].episodes.findIndex(e => e.index === episodeIndex);
        if (eei !== -1) {
          errorQueue[egi].episodes[eei].status = 'failed';
        }
      }
      set((s) => ({
        currentDownloadId: null,
        activeCount: Math.max(0, s.activeCount - 1),
        queue: [...errorQueue]
      }));
      await CacheService.saveQueue(get().queue);
      Toast.show({ type: "error", text1: "下载失败", text2: errorMessage });
    }

    // process next queued episode(s) if there is now available capacity
    get().processQueue?.();
  },

  /** 暂停下载任务（对 M3U8 使用 CacheService.pauseTask；对 MP4 使用 DownloadResumable.pauseAsync） */
  pauseQueuedEpisode: async (groupId, episodeIndex) => {
    const group = get().queue.find((g) => g.groupId === groupId);
    if (!group) return;
    const ep = group.episodes.find((e) => e.index === episodeIndex);
    if (!ep || ep.status !== 'downloading') return;
    const itemId = `${group.source}_${group.id}_${ep.index}`;

    if (ep.url.toLowerCase().includes('.m3u8')) {
      // M3U8 下载 -> 使用 CacheService 暂停机制
      CacheService.pauseTask(itemId);
    } else {
      // MP4 下载 -> 使用 expo-file-system DownloadResumable.pauseAsync
      const controllers = (get() as any)._controllers || {};
      const ctrl = controllers[itemId];
      if (ctrl && typeof ctrl.pauseAsync === 'function') {
        try { await ctrl.pauseAsync(); } catch (e) {}
      }
    }

    ep.status = 'paused';
    set({ queue: [...get().queue] });
    CacheService.saveQueue(get().queue);
  },

  /** 继续下载任务 */
  resumeQueuedEpisode: async (groupId, episodeIndex) => {
    const group = get().queue.find((g) => g.groupId === groupId);
    if (!group) return;
    const ep = group.episodes.find((e) => e.index === episodeIndex);
    if (!ep) return;
    const itemId = `${group.source}_${group.id}_${ep.index}`;

    if (ep.url.toLowerCase().includes('.m3u8')) {
      // 如果任务已经在运行中，仅调用 resume
      if (CacheService.isTaskPaused(itemId)) {
        CacheService.resumeTask(itemId);
        ep.status = 'downloading';
      } else {
        // 如果任务不在运行中（如重启后），重新启动下载（它会自动根据 completedCount 续传）
        ep.status = 'pending';
        set({ queue: [...get().queue] });
        get().downloadQueuedEpisode(groupId, episodeIndex);
      }
    } else {
      // MP4 下载 -> 使用 DownloadResumable.resumeAsync（需要重新创建？实际上可以从上次暂停处恢复）
      const controllers = (get() as any)._controllers || {};
      const ctrl = controllers[itemId];
      if (ctrl && typeof ctrl.resumeAsync === 'function') {
        try {
          ep.status = 'downloading';
          set({ queue: [...get().queue] });
          const result = await ctrl.resumeAsync();
          if (result?.uri) {
            ep.status = 'completed';
            ep.progress = 1;
            set((s) => ({ currentDownloadId: null, activeCount: Math.max(0, s.activeCount - 1), queue: [...s.queue] }));
            // 添加到缓存记录
            const cachedItem: CachedVideoItem = {
              id: itemId,
              source: group.source,
              source_name: group.title,
              title: group.title,
              poster: group.poster,
              episodeIndex: ep.index,
              episodeTitle: `第 ${ep.index + 1} 集`,
              fileUri: result.uri,
              totalEpisodes: group.episodes.length,
              downloadedAt: Date.now(),
            };
            await CacheService.add(cachedItem);
            set((s) => ({ items: [cachedItem, ...s.items] }));
          }
        } catch (e) {
          logger.warn('resumeQueuedEpisode MP4 failed', e);
          ep.status = 'failed';
          set((s) => ({ currentDownloadId: null, activeCount: Math.max(0, s.activeCount - 1), queue: [...s.queue] }));
        }
        return;
      }
      // 如果没有 resumable（如已清除），重新下载
      ep.status = 'pending';
      ep.progress = 0;
      set({ queue: [...get().queue] });
      (get() as any).processQueue?.();
      return;
    }

    set({ queue: [...get().queue] });
  },

  /** 取消下载任务（真正终止下载） */
  cancelQueuedEpisode: async (groupId, episodeIndex) => {
    const group = get().queue.find((g) => g.groupId === groupId);
    if (!group) return;
    const ep = group.episodes.find((e) => e.index === episodeIndex);
    if (!ep) return;
    const itemId = `${group.source}_${group.id}_${ep.index}`;
    const controllers = (get() as any)._controllers || {};
    const ctrl = controllers[itemId];

    // 尝试终止下载
    if (ep.url.toLowerCase().includes('.m3u8')) {
      CacheService.cancelM3U8Task(itemId);
    } else if (ctrl) {
      try {
        if (typeof ctrl.cancelAsync === 'function') {
          await ctrl.cancelAsync();
        } else if (typeof ctrl.pauseAsync === 'function') {
          await ctrl.pauseAsync();
        }
      } catch (e) {}
    }

    // 清理状态
    if (controllers[itemId]) {
      delete controllers[itemId];
    }
    ep.status = 'cancelled';
    set((s) => ({ queue: [...s.queue], activeCount: Math.max(0, s.activeCount - 1) }));
    CacheService.saveQueue(get().queue);
    (get() as any).processQueue?.();
  },

  cancelGroup: async (groupId) => {
    const group = get().queue.find((g) => g.groupId === groupId);
    if (!group) return;
    for (const ep of group.episodes) {
      if (ep.status === 'downloading' || ep.status === 'queued' || ep.status === 'pending' || ep.status === 'paused') {
        await get().cancelQueuedEpisode(groupId, ep.index);
      }
    }
    // remove group
    set((s) => ({ queue: s.queue.filter((g) => g.groupId !== groupId) }));
    (get() as any).processQueue?.();
  },

  retryDownload: (groupId, episodeIndex) => {
    const queue = get().queue;
    const gIdx = queue.findIndex(g => g.groupId === groupId);
    if (gIdx === -1) return;
    const eIdx = queue[gIdx].episodes.findIndex(e => e.index === episodeIndex);
    if (eIdx === -1) return;

    const ep = queue[gIdx].episodes[eIdx];

    // 从已完成的片段数继续，不从头开始
    // completedCount 记录了已成功下载的 TS 片段数，用于断点续传
    const resumeCompletedCount = ep.completedCount || 0;

    const nextQueue = [...queue];
    nextQueue[gIdx].episodes[eIdx].status = 'pending';
    // 保留已完成的片段数，使 downloadQueuedEpisode 能从断点继续
    // progress 保持现有值以显示进度百分比
    nextQueue[gIdx].episodes[eIdx].progress = resumeCompletedCount > 0
      ? resumeCompletedCount / (nextQueue[gIdx].episodes.length || 1)
      : 0;
    nextQueue[gIdx].episodes[eIdx].completedCount = resumeCompletedCount;

    logger.info(`[retryDownload] 从断点继续: groupId=${groupId}, episodeIndex=${episodeIndex}, completedCount=${resumeCompletedCount}`);

    set({ queue: nextQueue });
    get().processQueue?.();
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
        downloadUri = await CacheService.downloadM3U8AsMp4(episodeUrl, fileUri, itemId, undefined, (p) => {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ currentDownloadId: null, downloadProgress: { ...(get().downloadProgress || {}) } });
      Toast.show({ type: "error", text1: "下载失败", text2: errorMessage });
    }
  },

  removeCacheItem: async (id) => {
    set({ loading: true, error: null });
    try {
      // 1. 处理已完成的项
      const existing = get().items.find((item) => item.id === id);
      if (existing) {
        await CacheService.deleteFile(existing.fileUri);
        await CacheService.remove(id);
        const nextItems = get().items.filter((item) => item.id !== id);
        set({ items: nextItems });
      }

      // 2. 处理队列中的项（如失败或取消的）
      const nextQueue = get().queue.map(group => ({
        ...group,
        episodes: group.episodes.filter(ep => {
          const epId = `${group.source}_${group.id}_${ep.index}`;
          return epId !== id;
        })
      })).filter(group => group.episodes.length > 0);

      const dp = { ...(get().downloadProgress || {}) };
      delete dp[id];

      set((state) => ({
        queue: nextQueue,
        loading: false,
        downloadProgress: dp
      }));
      await CacheService.saveQueue(nextQueue);

      Toast.show({ type: "success", text1: "已删除缓存记录" });
    } catch (error) {
      logger.warn("removeCacheItem failed", error);
      set({ loading: false, error: "删除失败" });
      Toast.show({ type: "error", text1: "删除失败" });
    }
  },

  removeSeries: async (title) => {
    set({ loading: true, error: null });
    try {
      // 1. 获取该系列的所有已下载项并删除文件
      const seriesItems = get().items.filter((it) => it.title === title);
      for (const item of seriesItems) {
        await CacheService.deleteFile(item.fileUri);
        await CacheService.remove(item.id);
      }

      // 2. 取消该系列的所有正在下载/排队的任务
      const seriesQueue = get().queue.filter((g) => g.title === title);
      for (const group of seriesQueue) {
        await (get() as any).cancelGroup(group.groupId);
      }

      // 3. 更新状态
      const nextItems = get().items.filter((it) => it.title !== title);
      const dp = { ...(get().downloadProgress || {}) };
      seriesItems.forEach(it => delete dp[it.id]);

      set((state) => ({
        items: nextItems,
        loading: false,
        downloadProgress: dp
      }));
      await CacheService.saveQueue(get().queue);

      Toast.show({ type: "success", text1: "已删除整部剧集缓存" });
    } catch (error) {
      logger.warn("removeSeries failed", error);
      set({ loading: false, error: "删除失败" });
      Toast.show({ type: "error", text1: "删除失败" });
    }
  },
  clearCache: async () => {
    set({ loading: true, error: null });
    try {
      await CacheService.clearAll();
      await AsyncStorage.removeItem("mytv_cache_queue");
      set({ items: [], queue: [], loading: false, downloadProgress: {} });
      Toast.show({ type: "success", text1: "缓存已清除" });
    } catch (error) {
      logger.warn("clearCache failed", error);
      set({ loading: false, error: "清除缓存失败" });
      Toast.show({ type: "error", text1: "清除缓存失败" });
    }
  },
  pauseAll: async () => {
    const currentQueue = get().queue;
    const downloadingEpisodes = currentQueue.flatMap(g =>
      g.episodes
        .filter(ep => ep.status === 'downloading')
        .map(ep => ({ groupId: g.groupId, index: ep.index }))
    );

    // 依次暂停所有正在下载的片段
    for (const item of downloadingEpisodes) {
      await get().pauseQueuedEpisode(item.groupId, item.index);
    }

    // 将所有排队中或等待中的任务也设为暂停
    set((state) => ({
      queue: state.queue.map(group => ({
        ...group,
        episodes: group.episodes.map(ep => {
          if (ep.status === 'queued' || ep.status === 'pending') {
            return { ...ep, status: 'paused' as const };
          }
          return ep;
        })
      }))
    }));

    await CacheService.saveQueue(get().queue);
  },
  resumeAll: async () => {
    const nextQueue = get().queue.map(group => ({
      ...group,
      episodes: group.episodes.map(ep => {
        if (ep.status === 'paused') {
          return { ...ep, status: 'pending' as const };
        }
        return ep;
      })
    }));
    set({ queue: nextQueue });
    await CacheService.saveQueue(nextQueue);
    (get() as any).processQueue?.();
  },
}));

export default useCacheStore;
