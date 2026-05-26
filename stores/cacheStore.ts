import { create } from "zustand";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Toast from "react-native-toast-message";
import { CacheService, CachedVideoItem } from "@/services/cacheService";
import { useSettingsStore } from "@/stores/settingsStore";
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
  enqueueSeries: (series: Omit<GroupedDownload, 'groupId' | 'episodes'> & { episodes: { index: number; url: string; title: string }[] }) => void;
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
  title: string; // 新增：保存剧集标题
  status: 'pending' | 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled' | 'paused';
  progress?: number;
  completedCount?: number; // 新增：已完成的分片数量，用于断点续传
  id?: string; // constructed id string
  wasDownloading?: boolean; // 标记暂停前是否正在下载中，用于 resumeAll 区分
  resumeData?: string; // 新增：用于 MP4 下载的断点续传数据
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
  concurrency: 5, // 默认同时下载 5 集
  activeCount: 0,

  setConcurrency: (value) => {
    const nextValue = Math.max(1, Math.min(10, value));
    set({ concurrency: nextValue });
    (get() as any).processQueue?.();
  },

  processQueue: () => {
    const state = get();
    // 重新计算真实的 activeCount 以防泄漏
    const activeTasks = state.queue.reduce(
      (acc, group) => acc + group.episodes.filter(ep => ep.status === 'downloading').length,
      0
    );

    set({ activeCount: activeTasks });

    if (activeTasks >= state.concurrency) return;

    // 找到所有待下载的任务
    const pendingItems = state.queue.flatMap(group =>
      group.episodes
        .filter(ep => ep.status === 'pending' || ep.status === 'queued')
        .map(ep => ({ groupId: group.groupId, index: ep.index }))
    );

    // 按顺序启动任务直到达到并发上限
    for (let i = 0; i < Math.min(pendingItems.length, state.concurrency - activeTasks); i++) {
      const next = pendingItems[i];
      get().downloadQueuedEpisode(next.groupId, next.index);
    }
  },

  loadCache: async () => {
      const state = get();
      set({ loading: true, error: null });
      try {
        await CacheService.ensureDownloadDirectory();
        const items = await CacheService.getAll();
        const queue = await CacheService.getQueue();

        set({ items, queue, loading: false });
      } catch (error) {
        logger.warn("loadCache failed", error);
        set({ loading: false, error: "加载缓存失败" });
      }
    },

  enqueueSeries: (series) => {
    // 检查是否已经存在该剧集的该集下载
    const currentQueue = get().queue;
    const items = get().items;

    const newEpisodes = series.episodes.filter(ep => {
      // 检查是否已在已完成列表中
      const isCompleted = items.some(it =>
        it.title === series.title && it.episodeIndex === ep.index
      );
      if (isCompleted) return false;

      // 检查是否已在队列中
      const isQueued = currentQueue.some(group =>
        group.title === series.title && group.episodes.some(qEp => qEp.index === ep.index && qEp.status !== 'failed' && qEp.status !== 'cancelled')
      );
      return !isQueued;
    });

    if (newEpisodes.length === 0) {
      Toast.show({ type: "info", text1: "提示", text2: "所选集数已在缓存中或队列中" });
      return;
    }

    const groupId = `${series.source}_${series.id}_${Date.now()}`;
    const episodes: QueuedEpisode[] = newEpisodes.map((ep) => ({
      index: ep.index,
      url: ep.url,
      title: ep.title, // 使用传入的标题
      status: 'pending' as const,
      progress: 0,
      completedCount: 0,
      id: `${series.source}_${series.id}_${ep.index}`
    }));
    const group: GroupedDownload = {
      groupId,
      source: series.source,
      title: series.title,
      poster: series.poster,
      id: series.id,
      episodes,
    };

    // 强制同步保存状态和磁盘，防止异步导致的状态冲突
    const nextQueue = [...currentQueue, group];
    set({ queue: nextQueue });
    CacheService.saveQueue(nextQueue);

    // 稍作延迟触发调度，确保原生层已准备就绪
    setTimeout(() => {
      (get() as any).processQueue?.();
    }, 1000);

    Toast.show({ type: "success", text1: "已加入下载队列", text2: `已成功添加 ${newEpisodes.length} 个任务` });
  },

  // start download for a queued episode respecting concurrency
  downloadQueuedEpisode: async (groupId, episodeIndex) => {
    const state = get();
    const groupIndex = state.queue.findIndex((g) => g.groupId === groupId);
    if (groupIndex === -1) return;

    const ep = state.queue[groupIndex].episodes.find((e) => e.index === episodeIndex);
    if (!ep || ep.status === 'downloading') return;

    const itemId = `${state.queue[groupIndex].source}_${state.queue[groupIndex].id}_${ep.index}`;

    // [关键防重]：利用本地 Set 防止并发竞态导致的双重下载
    if (!(get() as any)._activeTaskIds) (get() as any)._activeTaskIds = new Set();
    const activeTaskIds = (get() as any)._activeTaskIds;

    if (activeTaskIds.has(itemId)) {
      logger.info(`Task ${itemId} already actively downloading, skipping.`);
      return;
    }
    activeTaskIds.add(itemId);

    // 严格并发限制
    if (state.activeCount >= state.concurrency) {
      activeTaskIds.delete(itemId);
      set({
        queue: state.queue.map(g => g.groupId === groupId ? {
          ...g, episodes: g.episodes.map(e => e.index === episodeIndex ? { ...e, status: 'queued' as const } : e)
        } : g)
      });
      return;
    }

    // 同步控制器
    const abortController = new AbortController();
    if (!(get() as any)._controllers) (get() as any)._controllers = {};
    (get() as any)._controllers[itemId] = abortController;

    // 标记开始
    set((s) => ({
      activeCount: s.activeCount + 1,
      queue: s.queue.map(g => g.groupId === groupId ? {
        ...g, episodes: g.episodes.map(e => e.index === episodeIndex ? { ...e, status: 'downloading' as const } : e)
      } : g)
    }));

    try {
      await CacheService.ensureDownloadDirectory();
      const fileName = CacheService.buildFileName(state.queue[groupIndex].source, state.queue[groupIndex].id, ep.index, ep.url);
      const fileUri = `${CacheService.getDownloadDirectory()}${fileName}`;

      let downloadUri = fileUri;

      if (ep.url.toLowerCase().includes('.m3u8')) {
        const { downloadAdFilterEnabled } = useSettingsStore.getState();
        downloadUri = await CacheService.downloadM3U8AsMp4(
          ep.url, fileUri, itemId, abortController.signal,
          (p, cc) => {
            // [严格进度检查]：仅在任务未暂停/未取消时更新进度，解决“进度乱跳”
            const currentStore = get();
            const currentGroup = currentStore.queue.find(g => g.groupId === groupId);
            const currentEp = currentGroup?.episodes.find(e => e.index === episodeIndex);

            if (!currentEp || currentEp.status !== 'downloading') return;

            set(st => ({
              downloadProgress: { ...st.downloadProgress, [itemId]: p },
              queue: st.queue.map(g => g.groupId === groupId ? {
                ...g, episodes: g.episodes.map(e => e.index === episodeIndex ? { ...e, progress: p, completedCount: cc } : e)
              } : g)
            }));
          },
          { adFilter: downloadAdFilterEnabled }
        );
      } else {
        const resumable = FileSystem.createDownloadResumable(
          ep.url, fileUri, {},
          (p) => {
            const pr = p.totalBytesWritten / p.totalBytesExpectedToWrite;
            const currentStore = get();
            const currentGroup = currentStore.queue.find(g => g.groupId === groupId);
            const currentEp = currentGroup?.episodes.find(e => e.index === episodeIndex);
            if (!currentEp || currentEp.status !== 'downloading') return;

            set(st => ({
              downloadProgress: { ...st.downloadProgress, [itemId]: pr },
              queue: st.queue.map(g => g.groupId === groupId ? {
                ...g, episodes: g.episodes.map(e => e.index === episodeIndex ? { ...e, progress: pr } : e)
              } : g)
            }));
          },
          ep.resumeData
        );
        (get() as any)._controllers[itemId] = resumable;
        const res = await resumable.downloadAsync();
        if (!res) throw new Error("DL_FAIL");
        downloadUri = res.uri;
      }

      // 成功处理 (检查是否已被用户中途暂停)
      const checkState = get();
      const checkEp = checkState.queue.find(g => g.groupId === groupId)?.episodes.find(e => e.index === episodeIndex);
      if (checkEp?.status !== 'downloading') {
        logger.info(`Task ${itemId} finished but status is ${checkEp?.status}, cleanup only.`);
        return;
      }

      const cachedItem: CachedVideoItem = {
        id: itemId,
        source: state.queue[groupIndex].source,
        source_name: state.queue[groupIndex].source_name || state.queue[groupIndex].title,
        title: state.queue[groupIndex].title,
        poster: state.queue[groupIndex].poster,
        episodeIndex: ep.index,
        episodeTitle: ep.title || `第 ${ep.index + 1} 集`,
        fileUri: downloadUri,
        totalEpisodes: state.queue[groupIndex].episodes.length,
        downloadedAt: Date.now(),
      };
      await CacheService.add(cachedItem);

      set(s => ({
        items: [cachedItem, ...s.items],
        activeCount: Math.max(0, s.activeCount - 1),
        queue: s.queue.map(g => g.groupId === groupId ? {
          ...g, episodes: g.episodes.map(e => e.index === episodeIndex ? { ...e, status: 'completed' as const, progress: 1 } : e)
        } : g)
      }));
      await CacheService.saveQueue(get().queue);

    } catch (err: any) {
      const isUserCancel = err.message === 'CANCELLED' || abortController.signal.aborted;
      if (!isUserCancel) {
        logger.error("Download Error:", err);
        set(s => ({
          activeCount: Math.max(0, s.activeCount - 1),
          queue: s.queue.map(g => g.groupId === groupId ? {
            ...g, episodes: g.episodes.map(e => e.index === episodeIndex ? { ...e, status: 'failed' as const } : e)
          } : g)
        }));
      }
    } finally {
      delete (get() as any)._controllers[itemId];
      (get() as any)._activeTaskIds?.delete(itemId);
      get().processQueue?.();
    }
  },

  /** 暂停下载任务 */
  pauseQueuedEpisode: async (groupId, episodeIndex) => {
    const state = get();
    const group = state.queue.find((g) => g.groupId === groupId);
    if (!group) return;
    const ep = group.episodes.find((e) => e.index === episodeIndex);
    if (!ep || ep.status !== 'downloading') return;
    const itemId = `${group.source}_${group.id}_${ep.index}`;

    // 1. 同步更新状态，防止回调干扰
    const nextQueue = state.queue.map(g => g.groupId === groupId ? {
      ...g,
      episodes: g.episodes.map(e => e.index === episodeIndex ? { ...e, status: 'paused' as const, wasDownloading: true } : e)
    } : g);

    set({ queue: nextQueue, activeCount: Math.max(0, state.activeCount - 1) });
    CacheService.saveQueue(nextQueue);

    // 2. 物理中断
    const controllers = (get() as any)._controllers || {};
    const ctrl = controllers[itemId];
    if (ctrl) {
      if (typeof ctrl.abort === 'function') ctrl.abort();
      if (typeof ctrl.pauseAsync === 'function') {
        const res = await ctrl.pauseAsync();
        // 更新 resumeData
        set({
          queue: get().queue.map(g => g.groupId === groupId ? {
            ...g,
            episodes: g.episodes.map(e => e.index === episodeIndex ? { ...e, resumeData: res.resumeData } : e)
          } : g)
        });
      }
    }
  },

  /** 继续下载任务 */
  resumeQueuedEpisode: async (groupId, episodeIndex) => {
    const state = get();
    const group = state.queue.find((g) => g.groupId === groupId);
    if (!group) return;
    const ep = group.episodes.find((e) => e.index === episodeIndex);
    if (!ep) return;

    // 恢复为 queued 状态，由调度器统一启动
    const nextQueue = state.queue.map(g => g.groupId === groupId ? {
      ...g,
      episodes: g.episodes.map(e => e.index === episodeIndex ? { ...e, status: 'queued' as const, wasDownloading: false } : e)
    } : g);

    set({ queue: nextQueue });
    CacheService.saveQueue(nextQueue);
    get().processQueue?.();
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

  downloadEpisode: async (options) => {
      try {
        const {
          source,
          title,
          poster,
          id,
          episodeIndex,
          episodeUrl,
        } = options;

        if (!episodeUrl) {
          Toast.show({ type: "error", text1: "下载失败", text2: "无效的播放链接" });
          return;
        }

        // 将单集下载加入队列，使用统一的队列管理系统
        get().enqueueSeries({
          source,
          title,
          poster,
          id,
          episodes: [{ index: episodeIndex, url: episodeUrl, title: options.episodeTitle }]
        });

        // 提示用户已加入队列
        Toast.show({ type: "info", text1: "已加入下载队列", text2: `${title} ${options.episodeTitle}` });
      } catch (e) {
        logger.error("[downloadEpisode] Unexpected error:", e);
        Toast.show({ type: "error", text1: "下载失败", text2: String(e) });
      }
    },

  removeCacheItem: async (id) => {
    set({ loading: true, error: null });
    try {
      // 1. 处理正在下载或队列中的项
      const controllers = (get() as any)._controllers || {};
      const ctrl = controllers[id];

      // 触发物理停止
      if (ctrl && typeof ctrl.abort === 'function') {
        ctrl.abort();
      }

      // 调用原生模块停止（双重保险）
      CacheService.cancelM3U8Task(id);

      // 2. 处理已完成的项
      const existing = get().items.find((item) => item.id === id);
      if (existing) {
        await CacheService.deleteFile(existing.fileUri);
        await CacheService.remove(id);
        const nextItems = get().items.filter((item) => item.id !== id);
        set({ items: nextItems });
      }

      // 3. 更新队列状态
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
        downloadProgress: dp,
        activeCount: Math.max(0, state.activeCount - (ctrl ? 1 : 0))
      }));

      await CacheService.saveQueue(nextQueue);
      (get() as any).processQueue?.();

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
      // 1. 获取该系列的所有正在下载/排队的任务并停止
      const seriesQueue = get().queue.filter((g) => g.title === title);
      for (const group of seriesQueue) {
        // 停止该组所有剧集的下载
        for (const ep of group.episodes) {
          const itemId = `${group.source}_${group.id}_${ep.index}`;
          const controllers = (get() as any)._controllers || {};
          const ctrl = controllers[itemId];
          if (ctrl && typeof ctrl.abort === 'function') ctrl.abort();
          CacheService.pauseTask(itemId);
        }
      }

      // 2. 获取该系列的所有已下载项并删除文件
      const seriesItems = get().items.filter((it) => it.title === title);
      for (const item of seriesItems) {
        await CacheService.deleteFile(item.fileUri);
        await CacheService.remove(item.id);
      }

      // 3. 更新状态
      const nextItems = get().items.filter((it) => it.title !== title);
      const nextQueue = get().queue.filter((g) => g.title !== title);
      const dp = { ...(get().downloadProgress || {}) };
      seriesItems.forEach(it => delete dp[it.id]);

      set((state) => ({
        items: nextItems,
        queue: nextQueue,
        loading: false,
        downloadProgress: dp,
        activeCount: Math.max(0, state.activeCount - seriesQueue.length)
      }));

      await CacheService.saveQueue(get().queue);
      (get() as any).processQueue?.();

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
      // 1. 强力停止所有活跃任务
      const controllers = (get() as any)._controllers || {};
      Object.values(controllers).forEach((ctrl: any) => {
        if (ctrl && typeof ctrl.abort === 'function') ctrl.abort();
      });

      // 2. 物理级掐断原生请求
      CacheService.pauseTask(""); // 内部调用 stopAllCalls()

      // 3. 清理文件和状态
      await CacheService.clearAll();
      await AsyncStorage.removeItem("mytv_cache_queue");
      set({ items: [], queue: [], loading: false, downloadProgress: {}, activeCount: 0 });

      Toast.show({ type: "success", text1: "缓存已清除" });
    } catch (error) {
      logger.warn("clearCache failed", error);
      set({ loading: false, error: "清除缓存失败" });
      Toast.show({ type: "error", text1: "清除缓存失败" });
    }
  },
  pauseAll: async () => {
    const state = get();
    const downloadingEpisodes = state.queue.flatMap(g =>
      g.episodes
        .filter(ep => ep.status === 'downloading')
        .map(ep => ({
          groupId: g.groupId,
          index: ep.index,
          itemId: `${g.source}_${g.id}_${ep.index}`
        }))
    );

    // 1. 【原子化更新】一次性将所有状态设为暂停，解决进度条反复重连问题
    set((s) => ({
      activeCount: 0,
      queue: s.queue.map(group => ({
        ...group,
        episodes: group.episodes.map(ep => {
          if (ep.status === 'downloading' || ep.status === 'queued' || ep.status === 'pending') {
            return { ...ep, status: 'paused' as const, wasDownloading: ep.status === 'downloading' };
          }
          return ep;
        })
      }))
    }));

    // 2. 【物理级掐断】遍历所有活跃控制器触发中止
    const controllers = (get() as any)._controllers || {};
    for (const item of downloadingEpisodes) {
      const ctrl = controllers[item.itemId];
      if (ctrl) {
        if (typeof ctrl.abort === 'function') ctrl.abort();
        if (typeof ctrl.pauseAsync === 'function') await ctrl.pauseAsync();
      }
      (get() as any)._activeTaskIds?.delete(item.itemId);
    }

    await CacheService.saveQueue(get().queue);
  },
  resumeAll: async () => {
    // 1. 【原子化更新】将所有暂停任务恢复为待下载状态
    set((s) => ({
      queue: s.queue.map(group => ({
        ...group,
        episodes: group.episodes.map(ep => {
          if (ep.status === 'paused') {
            return { ...ep, status: 'pending' as const, wasDownloading: false };
          }
          return ep;
        })
      }))
    }));

    await CacheService.saveQueue(get().queue);

    // 2. 统一触发调度器
    get().processQueue?.();
  },
}));

export default useCacheStore;
