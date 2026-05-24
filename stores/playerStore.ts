import { create } from "zustand";
import Toast from "react-native-toast-message";
import { AVPlaybackStatus, Video } from "expo-av";
import { RefObject } from "react";
import { PlayRecord, PlayRecordManager, PlayerSettingsManager } from "@/services/storage";
import useDetailStore, { episodesSelectorBySource } from "./detailStore";
import { dlnaService, DLNADevice } from "@/services/dlnaService";
import Logger from '@/utils/Logger';

const logger = Logger.withTag('PlayerStore');

interface Episode {
  url: string;
  title: string;
}

interface PlayerState {
  videoRef: RefObject<Video> | null;
  currentEpisodeIndex: number;
  episodes: Episode[];
  status: AVPlaybackStatus | null;
  isLoading: boolean;
  showControls: boolean;
  showEpisodeModal: boolean;
  showSourceModal: boolean;
  showSpeedModal: boolean;
  showNextEpisodeOverlay: boolean;
  isSeeking: boolean;
  seekPosition: number;
  progressPosition: number;
  showCastModal: boolean;
  isFullscreen: boolean;
  initialPosition: number;
  playbackRate: number;
  introEndTime?: number;
  outroStartTime?: number;

  // 投屏相关状态
  castingDevice: DLNADevice | null;
  isCasting: boolean;
  _castSyncTimer?: NodeJS.Timeout;

  setVideoRef: (ref: RefObject<Video>) => void;
  setIsFullscreen: (full: boolean) => void;
  loadVideo: (options: {
    source: string;
    id: string;
    title: string;
    episodeIndex: number;
    position?: number;
    fileUri?: string;
  }) => Promise<void>;
  playEpisode: (index: number) => void;
  pause: () => Promise<void>;
  togglePlayPause: () => void;
  seek: (duration: number) => void;
  seekToPosition: (ratio: number, finalize?: boolean) => void;
  handlePlaybackStatusUpdate: (newStatus: AVPlaybackStatus) => void;
  setLoading: (loading: boolean) => void;
  setShowControls: (show: boolean) => void;
  setShowEpisodeModal: (show: boolean) => void;
  setShowSourceModal: (show: boolean) => void;
  setShowSpeedModal: (show: boolean) => void;
  setShowCastModal: (show: boolean) => void;
  setShowNextEpisodeOverlay: (show: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  setIntroEndTime: () => void;
  setOutroStartTime: () => void;
  reset: () => void;
  _seekTimeout?: NodeJS.Timeout;
  _isRecordSaveThrottled: boolean;

  // 投屏动作
  setCastingDevice: (device: DLNADevice | null) => void;
  syncCastProgress: () => Promise<void>;
  stopCast: () => Promise<void>;

  // Internal helper
  _savePlayRecord: (updates?: Partial<PlayRecord>, options?: { immediate?: boolean }) => void;
  handleVideoError: (errorType: 'ssl' | 'network' | 'other', failedUrl: string) => Promise<void>;
}

const usePlayerStore = create<PlayerState>((set, get) => ({
  videoRef: null,
  episodes: [],
  currentEpisodeIndex: -1,
  status: null,
  isLoading: true,
  showControls: false,
  showEpisodeModal: false,
  showSourceModal: false,
  showSpeedModal: false,
  showCastModal: false,
  isFullscreen: false,
  showNextEpisodeOverlay: false,
  isSeeking: false,
  seekPosition: 0,
  progressPosition: 0,
  initialPosition: 0,
  playbackRate: 1.0,
  introEndTime: undefined,
  outroStartTime: undefined,
  _seekTimeout: undefined,
  _isRecordSaveThrottled: false,

  castingDevice: null,
  isCasting: false,
  _castSyncTimer: undefined,

  setVideoRef: (ref) => set({ videoRef: ref }),
  setIsFullscreen: (full) => set({ isFullscreen: full }),

  setCastingDevice: (device) => {
    const prevTimer = get()._castSyncTimer;
    if (prevTimer) clearInterval(prevTimer);

    if (device) {
      set({ castingDevice: device, isCasting: true });
      // 启动同步定时器
      const timer = setInterval(() => {
        get().syncCastProgress();
      }, 3000);
      set({ _castSyncTimer: timer });
    } else {
      set({ castingDevice: null, isCasting: false, _castSyncTimer: undefined });
    }
  },

  syncCastProgress: async () => {
    const { castingDevice, isCasting, currentEpisodeIndex, episodes, playEpisode } = get();
    if (!isCasting || !castingDevice) return;

    try {
      const posInfo = await dlnaService.getPositionInfo(castingDevice);
      const transportState = await dlnaService.getTransportInfo(castingDevice);

      if (posInfo && posInfo.duration > 0) {
        const progress = posInfo.relTime / posInfo.duration;
        const isPlaying = transportState === 'PLAYING';

        // 更新状态，模拟本地 AVPlaybackStatus
        set({
          status: {
            isLoaded: true,
            isPlaying: isPlaying,
            positionMillis: posInfo.relTime * 1000,
            durationMillis: posInfo.duration * 1000,
            shouldPlay: true,
            rate: 1,
            volume: 1,
            isMuted: false,
            isLooping: false,
            didJustFinish: false,
          } as any,
          progressPosition: progress,
        });

        // 自动换集逻辑
        if (posInfo.duration > 0 && posInfo.duration - posInfo.relTime < 10) {
           // 剩余不足10秒且未显示过下一集提示
           if (currentEpisodeIndex < episodes.length - 1 && !get().showNextEpisodeOverlay) {
             set({ showNextEpisodeOverlay: true });
           }
        }

        if (transportState === 'STOPPED' || (posInfo.duration > 0 && posInfo.relTime >= posInfo.duration - 1)) {
           // 播放结束，自动下一集
           if (currentEpisodeIndex < episodes.length - 1) {
             playEpisode(currentEpisodeIndex + 1);
           }
        }

        get()._savePlayRecord();
      }
    } catch (e) {
      logger.warn('[CastSync] Failed:', e);
    }
  },

  stopCast: async () => {
    const { castingDevice } = get();
    if (castingDevice) {
      try {
        await dlnaService.stopCast(castingDevice);
      } catch (e) {}
    }
    get().setCastingDevice(null);
  },

  loadVideo: async ({ source, id, episodeIndex, position, title, fileUri }) => {
    // 关键修复：开始加载新视频前，先重置当前播放状态，防止旧视频残留导致崩溃
    set({
      isLoading: true,
      episodes: [],
      currentEpisodeIndex: -1,
      status: null
    });

    // 短暂延迟，确保渲染状态已同步，避免 native 崩溃
    await new Promise(r => setTimeout(r, 50));

    const perfStart = performance.now();
    logger.info(`[PERF] PlayerStore.loadVideo START - source: ${source}, id: ${id}, title: ${title}`);

    let detail = useDetailStore.getState().detail;
    let episodes: string[] = [];

    if (fileUri) {
      logger.info(`[INFO] Playing local cached file ${fileUri}`);

      // 直接使用 file:// URI 播放本地缓存文件
      // expo-av Video 组件原生支持 file:// URI

      // 验证文件是否存在且非空
      try {
        const RNFetchBlob = require('react-native-blob-util');
        const exists = await RNFetchBlob.fs.exists(fileUri);
        if (!exists) {
          logger.error(`[ERROR] Cached file not found: ${fileUri}`);
          Toast.show({ type: 'error', text1: '文件不存在', text2: '缓存文件已被删除或损坏' });
          set({
            isLoading: false,
            currentEpisodeIndex: 0,
            initialPosition: 0,
            playbackRate: 1.0,
            episodes: [{ url: '', title: title || '离线视频（文件不存在）' }],
          });
          return;
        }

        // 检查文件是否非空（空文件会触发 expo-av 的 error 状态）
        const stat = await RNFetchBlob.fs.stat(fileUri);
        if (stat.size === 0) {
          logger.error(`[ERROR] Cached file is empty: ${fileUri}`);
          Toast.show({ type: 'error', text1: '文件损坏', text2: '缓存文件为空，请重新下载' });
          set({
            isLoading: false,
            episodes: [{ url: '', title: title || '离线视频（文件损坏）' }],
          });
          return;
        }
        logger.info(`[SUCCESS] Cached file valid: ${(stat.size / (1024*1024)).toFixed(2)}MB`);
      } catch (e) {
        // 如果 require('react-native-blob-util') 失败（如 web 环境），回退到 FileSystem
        try {
          const FileSystem = require('expo-file-system');
          const info = await FileSystem.getInfoAsync(fileUri);
          if (!info.exists) {
            logger.error(`[FALLBACK] File not found via FileSystem: ${fileUri}`);
            set({ isLoading: false, episodes: [{ url: '', title: title || '文件不存在' }] });
            return;
          }
        } catch (fallbackErr) {
          logger.warn('[WARN] File existence check both failed, proceeding:', fallbackErr);
        }
      }

      // 创建一个包含到当前集数为止的列表，以确保 UI 显示正确的集数
      const mappedEpisodes = Array(episodeIndex + 1).fill(null).map((_, i) => ({
        url: i === episodeIndex ? fileUri : '',
        title: `第 ${i + 1} 集${i === episodeIndex ? ' (已缓存)' : ''}`,
      }));

      set({
        isLoading: false,
        currentEpisodeIndex: episodeIndex,
        initialPosition: position || 0,
        playbackRate: 1.0,
        episodes: mappedEpisodes,
      });
      return;
    }

    // 如果有detail，使用detail的source获取episodes；否则使用传入的source
    if (detail && detail.source) {
      logger.info(`[INFO] Using existing detail source "${detail.source}" to get episodes`);
      episodes = episodesSelectorBySource(detail.source)(useDetailStore.getState());
    } else {
      logger.info(`[INFO] No existing detail, using provided source "${source}" to get episodes`);
      episodes = episodesSelectorBySource(source)(useDetailStore.getState());
    }

    const needsDetailInit = !detail || !episodes || episodes.length === 0 || detail.title !== title;
    logger.info(`[PERF] Detail check - needsInit: ${needsDetailInit}, hasDetail: ${!!detail}, episodesCount: ${episodes?.length || 0}`);

    if (needsDetailInit) {
      const detailInitStart = performance.now();
      logger.info(`[PERF] DetailStore.init START - ${title}`);

      await useDetailStore.getState().init(title, source, id);

      const detailInitEnd = performance.now();
      logger.info(`[PERF] DetailStore.init END - took ${(detailInitEnd - detailInitStart).toFixed(2)}ms`);

      detail = useDetailStore.getState().detail;

      if (!detail) {
        logger.error(`[ERROR] Detail not found after initialization for "${title}" (source: ${source}, id: ${id})`);
        set({ isLoading: false });
        return;
      }

      // 使用DetailStore找到的实际source来获取episodes，而不是原始的preferredSource
      logger.info(`[INFO] Using actual source "${detail.source}" instead of preferred source "${source}"`);
      episodes = episodesSelectorBySource(detail.source)(useDetailStore.getState());

      if (!episodes || episodes.length === 0) {
        logger.error(`[ERROR] No episodes found for "${title}" from source "${detail.source}" (${detail.source_name})`);

        // 尝试从searchResults中直接获取episodes
        const detailStoreState = useDetailStore.getState();
        logger.info(`[INFO] Available sources in searchResults: ${detailStoreState.searchResults.map(r => `${r.source}(${r.episodes?.length || 0} episodes)`).join(', ')}`);

        // 如果当前source没有episodes，尝试使用第一个有episodes的source
        const sourceWithEpisodes = detailStoreState.searchResults.find(r => r.episodes && r.episodes.length > 0);
        if (sourceWithEpisodes) {
          logger.info(`[FALLBACK] Using alternative source "${sourceWithEpisodes.source}" with ${sourceWithEpisodes.episodes.length} episodes`);
          episodes = sourceWithEpisodes.episodes;
          // 更新detail为有episodes的source
          detail = sourceWithEpisodes;
        } else {
          logger.error(`[ERROR] No source with episodes found in searchResults`);
          set({ isLoading: false });
          return;
        }
      }

      logger.info(`[SUCCESS] Detail and episodes loaded - source: ${detail.source_name}, episodes: ${episodes.length}`);
    } else {
      logger.info(`[PERF] Skipping DetailStore.init - using cached data`);

      // 即使是缓存的数据，也要确保使用正确的source获取episodes
      if (detail && detail.source && detail.source !== source) {
        logger.info(`[INFO] Cached detail source "${detail.source}" differs from provided source "${source}", updating episodes`);
        episodes = episodesSelectorBySource(detail.source)(useDetailStore.getState());

        if (!episodes || episodes.length === 0) {
          logger.warn(`[WARN] Cached detail source "${detail.source}" has no episodes, trying provided source "${source}"`);
          episodes = episodesSelectorBySource(source)(useDetailStore.getState());
        }
      }
    }

    // 最终验证：确保我们有有效的detail和episodes数据
    if (!detail) {
      logger.error(`[ERROR] Final check failed: detail is null`);
      set({ isLoading: false });
      return;
    }

    if (!episodes || episodes.length === 0) {
      logger.error(`[ERROR] Final check failed: no episodes available for source "${detail.source}" (${detail.source_name})`);
      set({ isLoading: false });
      return;
    }

    logger.info(`[SUCCESS] Final validation passed - detail: ${detail.source_name}, episodes: ${episodes.length}`);

    try {
      const storageStart = performance.now();
      logger.info(`[PERF] Storage operations START`);

      const playRecord = await PlayRecordManager.get(detail!.source, detail!.id.toString());
      const storagePlayRecordEnd = performance.now();
      logger.info(`[PERF] PlayRecordManager.get took ${(storagePlayRecordEnd - storageStart).toFixed(2)}ms`);

      const playerSettings = await PlayerSettingsManager.get(detail!.source, detail!.id.toString());
      const storageEnd = performance.now();
      logger.info(`[PERF] PlayerSettingsManager.get took ${(storageEnd - storagePlayRecordEnd).toFixed(2)}ms`);
      logger.info(`[PERF] Total storage operations took ${(storageEnd - storageStart).toFixed(2)}ms`);

      const initialPositionFromRecord = playRecord?.play_time ? playRecord.play_time * 1000 : 0;
      const savedPlaybackRate = playerSettings?.playbackRate || 1.0;

      const episodesMappingStart = performance.now();
      const mappedEpisodes = (episodes || []).map((ep, index) => ({
        url: ep,
        title: `第 ${index + 1} 集`,
      }));
      const episodesMappingEnd = performance.now();
      logger.info(`[PERF] Episodes mapping (${episodes.length} episodes) took ${(episodesMappingEnd - episodesMappingStart).toFixed(2)}ms`);

      set({
        isLoading: false,
        currentEpisodeIndex: episodeIndex,
        initialPosition: position || initialPositionFromRecord,
        playbackRate: savedPlaybackRate,
        episodes: mappedEpisodes,
        introEndTime: playRecord?.introEndTime || playerSettings?.introEndTime,
        outroStartTime: playRecord?.outroStartTime || playerSettings?.outroStartTime,
      });

      // 如果正在投屏，同步下发投屏指令给电视
      const { isCasting, castingDevice } = get();
      if (isCasting && castingDevice) {
        const episode = mappedEpisodes[episodeIndex];
        if (episode) {
          dlnaService.castVideo(castingDevice, episode.url, episode.title).catch(err => {
            logger.error('[Cast] Initial load cast failed:', err);
          });
        }
      }

      const perfEnd = performance.now();
      logger.info(`[PERF] PlayerStore.loadVideo COMPLETE - total time: ${(perfEnd - perfStart).toFixed(2)}ms`);

    } catch (error) {
      logger.debug("Failed to load play record", error);
      set({ isLoading: false });

      const perfEnd = performance.now();
      logger.info(`[PERF] PlayerStore.loadVideo ERROR - total time: ${(perfEnd - perfStart).toFixed(2)}ms`);
    }
  },

  playEpisode: async (index) => {
    const { episodes, videoRef, isCasting, castingDevice } = get();
    if (index >= 0 && index < episodes.length) {
      const episode = episodes[index];

      set({
        currentEpisodeIndex: index,
        showNextEpisodeOverlay: false,
        initialPosition: 0,
        progressPosition: 0,
        seekPosition: 0,
      });

      if (isCasting && castingDevice) {
        try {
          await dlnaService.castVideo(castingDevice, episode.url, episode.title);
          return;
        } catch (error) {
          logger.error("Failed to cast next episode:", error);
          Toast.show({ type: "error", text1: "投屏换集失败" });
        }
      }

      try {
        await videoRef?.current?.replayAsync();
      } catch (error) {
        logger.debug("Failed to replay video:", error);
        Toast.show({ type: "error", text1: "播放失败" });
      }
    }
  },

  pause: async () => {
    const { status, videoRef, isCasting, castingDevice } = get();

    if (isCasting && castingDevice) {
      try {
        await dlnaService.pauseCast(castingDevice);
        return;
      } catch (e) {}
    }

    if (status?.isLoaded && status.isPlaying) {
      try {
        await videoRef?.current?.pauseAsync();
      } catch (error) {
        logger.debug("Failed to pause video:", error);
      }
    }
  },

  togglePlayPause: async () => {
    const { status, videoRef, isCasting, castingDevice } = get();

    if (isCasting && castingDevice) {
      try {
        if (status?.isLoaded && status.isPlaying) {
          await dlnaService.pauseCast(castingDevice);
        } else {
          await dlnaService.playCast(castingDevice);
        }
        return;
      } catch (e) {
        logger.error("Failed to toggle cast play/pause:", e);
      }
    }

    if (status?.isLoaded) {
      try {
        if (status.isPlaying) {
          await videoRef?.current?.pauseAsync();
        } else {
          await videoRef?.current?.playAsync();
        }
      } catch (error) {
        logger.debug("Failed to toggle play/pause:", error);
        Toast.show({ type: "error", text1: "操作失败" });
      }
    }
  },

  seek: async (duration) => {
    const { status, videoRef, isCasting, castingDevice } = get();
    if (!status?.isLoaded || !status.durationMillis) return;

    const newPosition = Math.max(0, Math.min(status.positionMillis + duration, status.durationMillis));

    if (isCasting && castingDevice) {
      try {
        await dlnaService.seekCast(castingDevice, newPosition / 1000);
        return;
      } catch (e) {}
    }

    try {
      await videoRef?.current?.setPositionAsync(newPosition);
    } catch (error) {
      logger.debug("Failed to seek video:", error);
      Toast.show({ type: "error", text1: "快进/快退失败" });
    }

    set({
      isSeeking: true,
      seekPosition: newPosition / status.durationMillis,
    });

    if (get()._seekTimeout) {
      clearTimeout(get()._seekTimeout);
    }
    const timeoutId = setTimeout(() => set({ isSeeking: false }), 1000);
    set({ _seekTimeout: timeoutId });
  },

  seekToPosition: async (ratio, finalize = true) => {
    const { status, videoRef, isCasting, castingDevice } = get();
    if (!status?.isLoaded || !status.durationMillis) return;

    set({
      isSeeking: true,
      seekPosition: ratio,
    });

    if (finalize) {
      const newPosition = Math.max(0, Math.min(ratio * status.durationMillis, status.durationMillis));

      if (isCasting && castingDevice) {
        try {
          await dlnaService.seekCast(castingDevice, newPosition / 1000);
          set({ isSeeking: false });
          return;
        } catch (e) {}
      }

      try {
        await videoRef?.current?.setPositionAsync(newPosition);
      } catch (error) {
        logger.debug("Failed to seek to position:", error);
      }

      if (get()._seekTimeout) {
        clearTimeout(get()._seekTimeout);
      }
      const timeoutId = setTimeout(() => set({ isSeeking: false }), 1500);
      set({ _seekTimeout: timeoutId });
    }
  },

  setIntroEndTime: () => {
    const { status, introEndTime: existingIntroEndTime } = get();
    const detail = useDetailStore.getState().detail;
    if (!status?.isLoaded || !detail) return;

    if (existingIntroEndTime) {
      // Clear the time
      set({ introEndTime: undefined });
      get()._savePlayRecord({ introEndTime: undefined }, { immediate: true });
      Toast.show({
        type: "info",
        text1: "已清除片头时间",
      });
    } else {
      // Set the time
      const newIntroEndTime = status.positionMillis;
      set({ introEndTime: newIntroEndTime });
      get()._savePlayRecord({ introEndTime: newIntroEndTime }, { immediate: true });
      Toast.show({
        type: "success",
        text1: "设置成功",
        text2: "片头时间已记录。",
      });
    }
  },

  setOutroStartTime: () => {
    const { status, outroStartTime: existingOutroStartTime } = get();
    const detail = useDetailStore.getState().detail;
    if (!status?.isLoaded || !detail) return;

    if (existingOutroStartTime) {
      // Clear the time
      set({ outroStartTime: undefined });
      get()._savePlayRecord({ outroStartTime: undefined }, { immediate: true });
      Toast.show({
        type: "info",
        text1: "已清除片尾时间",
      });
    } else {
      // Set the time
      if (!status.durationMillis) return;
      const newOutroStartTime = status.durationMillis - status.positionMillis;
      set({ outroStartTime: newOutroStartTime });
      get()._savePlayRecord({ outroStartTime: newOutroStartTime }, { immediate: true });
      Toast.show({
        type: "success",
        text1: "设置成功",
        text2: "片尾时间已记录。",
      });
    }
  },

  _savePlayRecord: (updates = {}, options = {}) => {
    const { immediate = false } = options;
    if (!immediate) {
      if (get()._isRecordSaveThrottled) {
        return;
      }
      set({ _isRecordSaveThrottled: true });
      setTimeout(() => {
        set({ _isRecordSaveThrottled: false });
      }, 10000); // 10 seconds
    }

    const { detail } = useDetailStore.getState();
    const { currentEpisodeIndex, episodes, status, introEndTime, outroStartTime } = get();
    if (detail && status?.isLoaded) {
      const existingRecord = {
        introEndTime,
        outroStartTime,
      };
      PlayRecordManager.save(detail.source, detail.id.toString(), {
        title: detail.title,
        cover: detail.poster || "",
        index: currentEpisodeIndex + 1,
        total_episodes: episodes.length,
        play_time: Math.floor(status.positionMillis / 1000),
        total_time: status.durationMillis ? Math.floor(status.durationMillis / 1000) : 0,
        source_name: detail.source_name,
        year: detail.year || "",
        ...existingRecord,
        ...updates,
      });
    }
  },

  handlePlaybackStatusUpdate: (newStatus) => {
    if (!newStatus.isLoaded) {
      if (newStatus.error) {
        logger.debug(`Playback Error: ${newStatus.error}`);
      }
      set({ status: newStatus });
      return;
    }

    const { currentEpisodeIndex, episodes, outroStartTime, playEpisode } = get();
    const detail = useDetailStore.getState().detail;

    if (
      outroStartTime &&
      newStatus.durationMillis &&
      newStatus.positionMillis >= newStatus.durationMillis - outroStartTime
    ) {
      if (currentEpisodeIndex < episodes.length - 1) {
        playEpisode(currentEpisodeIndex + 1);
        return; // Stop further processing for this update
      }
    }

    if (detail && newStatus.durationMillis) {
      get()._savePlayRecord();

      const isNearEnd = newStatus.positionMillis / newStatus.durationMillis > 0.95;
      if (isNearEnd && currentEpisodeIndex < episodes.length - 1 && !outroStartTime) {
        set({ showNextEpisodeOverlay: true });
      } else {
        set({ showNextEpisodeOverlay: false });
      }
    }

    if (newStatus.didJustFinish) {
      if (currentEpisodeIndex < episodes.length - 1) {
        playEpisode(currentEpisodeIndex + 1);
      }
    }

    const progressPosition = newStatus.durationMillis ? newStatus.positionMillis / newStatus.durationMillis : 0;
    set({ status: newStatus, progressPosition });
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setShowControls: (show) => set({ showControls: show }),
  setShowEpisodeModal: (show) => set({ showEpisodeModal: show }),
  setShowSourceModal: (show) => set({ showSourceModal: show }),
  setShowSpeedModal: (show) => set({ showSpeedModal: show }),
  setShowCastModal: (show) => set({ showCastModal: show }),
  setShowNextEpisodeOverlay: (show) => set({ showNextEpisodeOverlay: show }),

  setPlaybackRate: async (rate) => {
    const { videoRef } = get();
    const detail = useDetailStore.getState().detail;

    try {
      await videoRef?.current?.setRateAsync(rate, true);
      set({ playbackRate: rate });

      // Save the playback rate preference
      if (detail) {
        await PlayerSettingsManager.save(detail.source, detail.id.toString(), { playbackRate: rate });
      }
    } catch (error) {
      logger.debug("Failed to set playback rate:", error);
    }
  },

  reset: () => {
    set({
      episodes: [],
      currentEpisodeIndex: 0,
      status: null,
      isLoading: true,
      showControls: false,
      showEpisodeModal: false,
      showSourceModal: false,
      showSpeedModal: false,
      showNextEpisodeOverlay: false,
      isFullscreen: false,
      initialPosition: 0,
      playbackRate: 1.0,
      introEndTime: undefined,
      outroStartTime: undefined,
    });
  },

  handleVideoError: async (errorType: 'ssl' | 'network' | 'other', failedUrl: string) => {
    const perfStart = performance.now();
    logger.error(`[VIDEO_ERROR] Handling ${errorType} error for URL: ${failedUrl}`);

    const detailStoreState = useDetailStore.getState();
    const { detail } = detailStoreState;
    const { currentEpisodeIndex } = get();

    if (!detail) {
      logger.error(`[VIDEO_ERROR] Cannot fallback - no detail available`);
      set({ isLoading: false });
      return;
    }

    // 标记当前source为失败
    const currentSource = detail.source;
    const errorReason = `${errorType} error: ${failedUrl.substring(0, 100)}...`;
    useDetailStore.getState().markSourceAsFailed(currentSource, errorReason);

    // 获取下一个可用的source
    const fallbackSource = useDetailStore.getState().getNextAvailableSource(currentSource, currentEpisodeIndex);

    if (!fallbackSource) {
      logger.error(`[VIDEO_ERROR] No fallback sources available for episode ${currentEpisodeIndex + 1}`);
      Toast.show({
        type: "error",
        text1: "播放失败",
        text2: "所有播放源都不可用，请稍后重试"
      });
      set({ isLoading: false });
      return;
    }

    logger.info(`[VIDEO_ERROR] Switching to fallback source: ${fallbackSource.source} (${fallbackSource.source_name})`);

    try {
      // 更新DetailStore的当前detail为fallback source
      await useDetailStore.getState().setDetail(fallbackSource);

      // 重新加载当前集数的episodes
      const newEpisodes = fallbackSource.episodes || [];
      if (newEpisodes.length > currentEpisodeIndex) {
        const mappedEpisodes = newEpisodes.map((ep, index) => ({
          url: ep,
          title: `第 ${index + 1} 集`,
        }));

        set({
          episodes: mappedEpisodes,
          isLoading: false, // 让Video组件重新渲染
        });

        const perfEnd = performance.now();
        logger.info(`[VIDEO_ERROR] Successfully switched to fallback source in ${(perfEnd - perfStart).toFixed(2)}ms`);
        logger.info(`[VIDEO_ERROR] New episode URL: ${newEpisodes[currentEpisodeIndex].substring(0, 100)}...`);

        Toast.show({
          type: "success",
          text1: "已切换播放源",
          text2: `正在使用 ${fallbackSource.source_name}`
        });
      } else {
        logger.error(`[VIDEO_ERROR] Fallback source doesn't have episode ${currentEpisodeIndex + 1}`);
        set({ isLoading: false });
      }
    } catch (error) {
      logger.error(`[VIDEO_ERROR] Failed to switch to fallback source:`, error);
      set({ isLoading: false });
    }
  },
}));

export default usePlayerStore;

export const selectCurrentEpisode = (state: PlayerState) => {
  // 增强数据安全性检查
  if (
    state.episodes &&
    Array.isArray(state.episodes) &&
    state.episodes.length > 0 &&
    state.currentEpisodeIndex >= 0 &&
    state.currentEpisodeIndex < state.episodes.length
  ) {
    const episode = state.episodes[state.currentEpisodeIndex];
    // 确保episode有有效的URL
    if (episode && episode.url && episode.url.trim() !== "") {
      return episode;
    } else {
      // 仅在调试模式下打印
      if (__DEV__) {
        logger.debug(`[PERF] selectCurrentEpisode - episode found but invalid URL: ${episode?.url}`);
      }
    }
  } else {
    // 仅在调试模式下打印
    if (__DEV__) {
      logger.debug(`[PERF] selectCurrentEpisode - no valid episode: episodes.length=${state.episodes?.length}, currentIndex=${state.currentEpisodeIndex}`);
    }
  }
  return undefined;
};
