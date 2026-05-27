import { create } from "zustand";
import Toast from "react-native-toast-message";
import { AVPlaybackStatus, Video } from "expo-av";
import { RefObject } from "react";
import { PlayRecord, PlayRecordManager, PlayerSettingsManager } from "@/services/storage";
import useDetailStore, { episodesSelectorBySource, calculateSourceScore, SearchResultWithResolution } from "./detailStore";
import { api, SearchResult } from "@/services/api";
import { SpeedTestService } from "@/services/speedTestService";
import { dlnaService, DLNADevice } from "@/services/dlnaService";
import { castNotificationService } from "@/services/castNotificationService";
import { parseEpisode } from "@/utils/episode";
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

  // 多线程下载相关 (内部)
  _downloadSegments: (url: string, dest: string, totalSize: number, onProgress: any) => Promise<void>;
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
      // 启动同步定时器，缩短为 2 秒，增强同步感
      const timer = setInterval(() => {
        get().syncCastProgress();
      }, 2000);
      set({ _castSyncTimer: timer });
      // 立即触发一次同步
      get().syncCastProgress();

      // 启动前台通知
      const detail = useDetailStore.getState().detail;
      const episodes = get().episodes;
      const episodeIndex = get().currentEpisodeIndex;
      const currentEpisode = episodes[episodeIndex];
      const title = detail?.title || "正在投屏";
      const episodeLabel = currentEpisode?.title || (episodeIndex >= 0 ? `第 ${episodeIndex + 1} 集` : "");
      castNotificationService.start(title, episodeLabel, device.name);
    } else {
      set({ castingDevice: null, isCasting: false, _castSyncTimer: undefined });
    }
  },

  syncCastProgress: async () => {
    const { castingDevice, isCasting, currentEpisodeIndex, episodes, playEpisode, isSeeking } = get();
    if (!isCasting || !castingDevice || isSeeking) return;

    try {
      const [posInfo, transportState] = await Promise.all([
        dlnaService.getPositionInfo(castingDevice),
        dlnaService.getTransportInfo(castingDevice)
      ]);

      if (posInfo && (posInfo.duration > 0 || posInfo.relTime > 0)) {
        const progress = posInfo.duration > 0 ? posInfo.relTime / posInfo.duration : 0;
        const isPlaying = transportState === 'PLAYING' || transportState === 'TRANSITIONING';

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

        // 自动换集逻辑：剩余不足 10 秒
        if (posInfo.duration > 0 && posInfo.duration - posInfo.relTime < 10) {
           if (currentEpisodeIndex < episodes.length - 1 && !get().showNextEpisodeOverlay) {
             set({ showNextEpisodeOverlay: true });
           }
        }

        // 播放结束判定
        if (transportState === 'STOPPED' || (posInfo.duration > 0 && posInfo.relTime >= posInfo.duration - 1)) {
           if (currentEpisodeIndex < episodes.length - 1 && !get().isSeeking) {
             playEpisode(currentEpisodeIndex + 1);
           }
        }

        get()._savePlayRecord();
      }
    } catch (e) {
      // logger.warn('[CastSync] Failed:', e);
    }
  },

  stopCast: async () => {
    const { castingDevice, status } = get();
    if (castingDevice) {
      try {
        await dlnaService.stopCast(castingDevice);
      } catch (e) {}
    }

    // 停止前台通知
    castNotificationService.stop();

    // 清除同步定时器并重置投屏状态
    const prevTimer = get()._castSyncTimer;
    if (prevTimer) clearInterval(prevTimer);

    // 关键：在退出投屏时，保留当前进度，以便本地播放器从同一位置继续
    const currentPosition = status?.positionMillis || 0;

    set({
      castingDevice: null,
      isCasting: false,
      _castSyncTimer: undefined,
      initialPosition: currentPosition, // 让本地播放器从投屏位置继续
      status: null, // 重置 status 让 Video 组件重新初始化
      isLoading: true
    });
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
      const mappedEpisodes = Array(episodeIndex + 1).fill(null).map((_, i) => {
        const titlePrefix = `第 ${i + 1} 集`;
        return {
          url: i === episodeIndex ? fileUri : '',
          title: i === episodeIndex ? (title || titlePrefix) : titlePrefix,
        };
      });

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

      // [安全超时] init 最多等待 30 秒，防止网络挂起导致永久卡加载
      await Promise.race([
        useDetailStore.getState().init(title, source, id),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('INIT_TIMEOUT')), 30000)
        )
      ]).catch(async (error) => {
        if (error.message === 'INIT_TIMEOUT') {
          logger.error(`[TIMEOUT] DetailStore.init timed out after 30s for "${title}"`);
          // 超时后尝试直接搜索所有源作为最终兜底
          try {
            const { results } = await api.searchVideos(title);
            if (results && results.length > 0) {
              const searchTitle = (title || "").replace(/\s+/g, '').toLowerCase();
              const matched = results.filter(r => {
                const targetTitle = (r.title || "").replace(/\s+/g, '').toLowerCase();
                return targetTitle.includes(searchTitle) || searchTitle.includes(targetTitle);
              });
              if (matched.length > 0) {
                const detailStore = useDetailStore.getState();
                detailStore.setDetail(matched[0] as any);
              }
            }
          } catch (fallbackErr) {
            logger.error(`[TIMEOUT] Fallback search also failed:`, fallbackErr);
          }
        } else {
          logger.error(`[ERROR] DetailStore.init error:`, error);
        }
      });

      const detailInitEnd = performance.now();
      logger.info(`[PERF] DetailStore.init END - took ${(detailInitEnd - detailInitStart).toFixed(2)}ms`);

      detail = useDetailStore.getState().detail;

      if (!detail) {
        logger.warn(`[FALLBACK] Preferred source "${source}" returned no detail after init`);

        // 检查 DetailStore 的错误状态
        const detailStoreState = useDetailStore.getState();
        if (detailStoreState.error) {
          logger.error(`[ERROR] DetailStore error: ${detailStoreState.error}`);
          Toast.show({ type: "error", text1: "播放失败", text2: detailStoreState.error });
          set({ isLoading: false });
          return;
        }

        // 尝试从 searchResults 中找有 episodes 的源
        const searchResults = detailStoreState.searchResults;
        logger.info(`[FALLBACK] ${searchResults.length} sources available in searchResults`);

        const sourceWithEpisodes = searchResults.find(r => r.episodes && r.episodes.length > 0);
        if (sourceWithEpisodes) {
          logger.info(`[FALLBACK] Using source with episodes: ${sourceWithEpisodes.source_name} (${sourceWithEpisodes.source})`);
          detail = sourceWithEpisodes;
          episodes = sourceWithEpisodes.episodes;
        } else if (searchResults.length > 0) {
          // 有搜索结果但没有 episodes，尝试主动获取剧集
          for (const candidate of searchResults) {
            logger.info(`[FALLBACK] Fetching episodes for "${candidate.source_name}"...`);
            try {
              await useDetailStore.getState().setDetail(candidate);
              const updatedDetail = useDetailStore.getState().detail;
              if (updatedDetail && updatedDetail.episodes && updatedDetail.episodes.length > 0) {
                detail = updatedDetail;
                episodes = updatedDetail.episodes;
                logger.info(`[FALLBACK] "${candidate.source_name}" has ${episodes.length} episodes`);
                break;
              }
            } catch (fetchErr) {
              logger.warn(`[FALLBACK] "${candidate.source_name}" failed:`, fetchErr);
            }
          }
        }

        if (!detail) {
          logger.error(`[ERROR] No detail found after init and fallback for "${title}"`);
          Toast.show({ type: "error", text1: "播放失败", text2: "未找到可用的播放源" });
          set({ isLoading: false });
          return;
        }
      }

      // 使用DetailStore找到的实际source来获取episodes，而不是原始的preferredSource
      // (但如果上面 fallback 时已赋值 episodes，则跳过)
      if (!episodes || episodes.length === 0) {
        logger.info(`[INFO] Using actual source "${detail.source}" instead of preferred source "${source}"`);
        episodes = episodesSelectorBySource(detail.source)(useDetailStore.getState());
      }

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

    // [优选源] 如果已有测速评分结果，自动选择评分最高的播放源
    const allScoredSources = useDetailStore.getState().searchResults
      .filter(r => r.speed !== undefined && r.latency !== undefined && r.episodes?.length > episodeIndex)
      .sort((a, b) => calculateSourceScore(b) - calculateSourceScore(a));

    if (allScoredSources.length > 0 && detail) {
      const bestScored = allScoredSources[0];
      if (bestScored.source !== detail.source && bestScored.episodes?.length > episodeIndex) {
        logger.info(`[OPTIMIZE] Auto-selecting best scored source: ${bestScored.source_name} (score: ${calculateSourceScore(bestScored).toFixed(1)}, speed: ${bestScored.speed} MB/s) over ${detail.source_name}`);
        detail = bestScored;
        episodes = bestScored.episodes || [];
        // 同步更新 detailStore 的 detail 为最优源
        useDetailStore.getState().setDetail(bestScored);
      } else {
        logger.info(`[OPTIMIZE] Current source "${detail.source_name}" is already the best scored source`);
      }
    } else {
      logger.info(`[OPTIMIZE] No speed test results available, using default source`);
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
      const mappedEpisodes = (episodes || []).map((ep, index) =>
        parseEpisode(ep, index, detail?.episodes_titles?.[index])
      );
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

          // 更新通知栏显示新剧集
          const detail = useDetailStore.getState().detail;
          const title = detail?.title || "正在投屏";
          const episodeLabel = episode?.title || `第 ${index + 1} 集`;
          castNotificationService.update(title, episodeLabel, castingDevice.name);

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
        // 关键：立即同步状态，反馈 UI
        setTimeout(() => get().syncCastProgress(), 500);
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
        // 立即同步反馈进度
        setTimeout(() => get().syncCastProgress(), 800);
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

    // 滑动期间只做轻量状态更新
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
          // 立即同步反馈进度
          setTimeout(() => get().syncCastProgress(), 800);
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
      const timeoutId = setTimeout(() => set({ isSeeking: false }), 800);
      set({ _seekTimeout: timeoutId });

      // 停止滑动后延迟保存一次记录
      get()._savePlayRecord({ immediate: true });
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
      
      // [增强] 即使没有 detail，尝试从 searchResults 中找到可用源
      const searchResults = useDetailStore.getState().searchResults;
      const fallbackFromSearch = searchResults.find(r => r.episodes && r.episodes.length > currentEpisodeIndex);
      if (fallbackFromSearch) {
        logger.info(`[VIDEO_ERROR] Found fallback from searchResults: ${fallbackFromSearch.source_name}`);
        await useDetailStore.getState().setDetail(fallbackFromSearch);
        const newEpisodes = fallbackFromSearch.episodes || [];
        const mappedEpisodes = (newEpisodes).map((ep, index) =>
          parseEpisode(ep, index, fallbackFromSearch?.episodes_titles?.[index])
        );
        set({ episodes: mappedEpisodes, isLoading: false });
        return;
      }
      
      set({ isLoading: false });
      Toast.show({ type: "error", text1: "播放失败", text2: "无法获取视频详情" });
      return;
    }

    // 标记当前 source 为失败
    const currentSource = detail.source;
    const errorReason = `${errorType} error: ${failedUrl.substring(0, 100)}...`;
    useDetailStore.getState().markSourceAsFailed(currentSource, errorReason);

    // [快速回退] 优先从 1 秒内获取到的源中挑选，进行 2 秒快速评分
    let fallbackSource = null;
    const quickCandidates = useDetailStore.getState().getQuickFallbackSources(currentSource, currentEpisodeIndex, 1000);

    if (quickCandidates.length > 0) {
      logger.info(`[QUICK] ${quickCandidates.length} sources available within 1s window, running 2s quick speed test...`);

      // 对候选源做 2 秒快速测速（并发测所有，总预算 2 秒）
      const QUICK_TEST_TIMEOUT = 2000;
      const speedTestController = new AbortController();
      const speedTestTimeout = setTimeout(() => speedTestController.abort(), QUICK_TEST_TIMEOUT);

      try {
        const testResults = await Promise.all(
          quickCandidates.map(async (candidate) => {
            const episodeUrl = candidate.episodes?.[currentEpisodeIndex] || candidate.episodes?.[0];
            if (!episodeUrl) return { source: candidate.source, latency: Infinity, speed: 0 };

            const result = await SpeedTestService.testM3U8Speed(episodeUrl, speedTestController.signal);
            return { source: candidate.source, ...result };
          })
        );
        clearTimeout(speedTestTimeout);

        // 将测速结果写回 detailStore 并评分排序
        const sourceScores = new Map<string, { speed: number; latency: number }>();
        for (const r of testResults) {
          sourceScores.set(r.source, { speed: r.speed, latency: r.latency });
        }

        // 用测速数据重新评分，选最优
        const scoredCandidates = quickCandidates
          .map(c => {
            const testData = sourceScores.get(c.source);
            const scored = {
              ...c,
              speed: testData?.speed ?? c.speed,
              latency: testData?.latency ?? c.latency,
            };
            return { source: c.source, score: calculateSourceScore(scored), data: scored };
          })
          .sort((a, b) => b.score - a.score);

        // 同时把测速结果写回 detailStore 的 searchResults
        const detailState = useDetailStore.getState();
        const updatedResults = detailState.searchResults.map(r => {
          const testData = sourceScores.get(r.source);
          return testData ? { ...r, speed: testData.speed, latency: testData.latency } : r;
        });
        useDetailStore.setState({
          searchResults: updatedResults.sort((a, b) => calculateSourceScore(b) - calculateSourceScore(a)),
        });

        if (scoredCandidates.length > 0) {
          const best = scoredCandidates[0];
          fallbackSource = quickCandidates.find(c => c.source === best.source);
          logger.info(`[QUICK] Best fallback by speed test: ${best.source} (score: ${best.score.toFixed(1)}, speed: ${best.data.speed} MB/s)`);

          // 如果测速最优源不是当前 detail（可能在搜索列表中但未设为 detail），保障找到
          if (!fallbackSource) {
            fallbackSource = useDetailStore.getState().searchResults.find(r => r.source === best.source) || null;
          }
        }
      } catch (e) {
        clearTimeout(speedTestTimeout);
        logger.warn(`[QUICK] Speed test interrupted:`, e);
      }
    }

    // 如果没有快速候选源或测速失败，降级到普通 available 源
    if (!fallbackSource) {
      fallbackSource = useDetailStore.getState().getNextAvailableSource(currentSource, currentEpisodeIndex);
      if (fallbackSource) {
        logger.info(`[FALLBACK] Using standard fallback source: ${fallbackSource.source} (${fallbackSource.source_name})`);
      }
    }

    // [全新搜索+测速] 无现成回退源时，发起 1s 快速搜索 + 2s 测速评分
    if (!fallbackSource) {
      logger.info(`[FRESH_SEARCH] No existing fallback sources - initiating fresh 1s search + 2s speed test`);

      // [修复] 等待搜索完成，不设超时限制，确保能找到有效播放源
      let searchResponse: { results: SearchResult[] } | null = null;
      try {
        searchResponse = await api.searchVideos(detail.title);
      } catch (e) {
        logger.warn(`[FRESH_SEARCH] Search failed:`, e);
      }

      if (searchResponse && searchResponse.results && searchResponse.results.length > 0) {
        // 过滤出有当前剧集且不是已失败源的源
        const freshCandidates = searchResponse.results
          .filter(r => r.episodes?.length > currentEpisodeIndex && r.source !== currentSource)
          .map(r => ({ ...r })) as SearchResultWithResolution[];

        if (freshCandidates.length > 0) {
          logger.info(`[FRESH_SEARCH] Found ${freshCandidates.length} candidates, running 2s speed test...`);

          // 2s 并发测速
          const speedTestController = new AbortController();
          const speedTestTimeout = setTimeout(() => speedTestController.abort(), 2000);

          const speedResults = await Promise.all(
            freshCandidates.map(async (candidate) => {
              const episodeUrl = candidate.episodes![currentEpisodeIndex] || candidate.episodes![0];
              if (!episodeUrl) return null;
              const metrics = await SpeedTestService.testM3U8Speed(episodeUrl, speedTestController.signal);
              return { source: candidate.source, ...metrics, data: candidate };
            })
          );
          clearTimeout(speedTestTimeout);

          // 评分排序取最优
          const validResults = speedResults
            .filter((r): r is NonNullable<typeof r> => r !== null && r.speed > 0)
            .sort((a, b) => {
              const scoreA = calculateSourceScore({ ...a.data, speed: a.speed, latency: a.latency } as SearchResultWithResolution);
              const scoreB = calculateSourceScore({ ...b.data, speed: b.speed, latency: b.latency } as SearchResultWithResolution);
              return scoreB - scoreA;
            });

          if (validResults.length > 0) {
            const best = validResults[0];
            fallbackSource = freshCandidates.find(c => c.source === best.source) || null;
            logger.info(`[FRESH_SEARCH] Best fresh source: ${best.source} (speed: ${best.speed} MB/s, latency: ${best.latency}ms)`);

            // 将测速结果写回 detailStore
            const detailState = useDetailStore.getState();
            const updatedResults = [...detailState.searchResults];
            for (const r of speedResults) {
              if (r && r.speed > 0) {
                const idx = updatedResults.findIndex(u => u.source === r!.source);
                const merged = { ...(idx >= 0 ? updatedResults[idx] : r.data), speed: r.speed, latency: r.latency };
                if (idx >= 0) {
                  updatedResults[idx] = merged;
                } else {
                  updatedResults.push(merged);
                }
              }
            }
            useDetailStore.setState({
              searchResults: updatedResults.sort((a, b) => calculateSourceScore(b) - calculateSourceScore(a)),
            });
          } else {
            logger.warn(`[FRESH_SEARCH] All fresh candidates timed out or failed speed test`);
          }
        }
      } else {
        logger.warn(`[FRESH_SEARCH] No results from fresh search (timed out or empty)`);
      }
    }

    if (!fallbackSource) {
      logger.error(`[VIDEO_ERROR] No fallback sources available for episode ${currentEpisodeIndex + 1}`);
      set({ isLoading: false });
      Toast.show({
        type: "error",
        text1: "播放失败",
        text2: "所有播放源都不可用，请稍后重试",
      });
      return;
    }

    logger.info(`[VIDEO_ERROR] Switching to fallback source: ${fallbackSource.source} (${fallbackSource.source_name})`);

    try {
      // 更新 DetailStore 的当前 detail 为 fallback source
      await useDetailStore.getState().setDetail(fallbackSource);

      // 重新加载当前集数的 episodes（使用 parseEpisode 保留自定义剧集标题）
      const newEpisodes = fallbackSource.episodes || [];
      if (newEpisodes.length > currentEpisodeIndex) {
        const mappedEpisodes = (newEpisodes || []).map((ep, index) =>
          parseEpisode(ep, index, fallbackSource?.episodes_titles?.[index])
        );

        set({
          episodes: mappedEpisodes,
          isLoading: false, // 让 Video 组件重新渲染
        });

        const perfEnd = performance.now();
        logger.info(`[VIDEO_ERROR] Successfully switched to fallback source in ${(perfEnd - perfStart).toFixed(2)}ms`);
        logger.info(`[VIDEO_ERROR] New episode URL: ${newEpisodes[currentEpisodeIndex].substring(0, 100)}...`);

        Toast.show({
          type: "success",
          text1: "已切换播放源",
          text2: `正在使用 ${fallbackSource.source_name}`,
        });
      } else {
        logger.error(`[VIDEO_ERROR] Fallback source doesn't have episode ${currentEpisodeIndex + 1}`);
        set({ isLoading: false });
        Toast.show({
          type: "error",
          text1: "播放失败",
          text2: "备用源没有当前剧集，请尝试手动切换",
        });
      }
    } catch (error) {
      logger.error(`[VIDEO_ERROR] Failed to switch to fallback source:`, error);
      set({ isLoading: false });
      Toast.show({
        type: "error",
        text1: "切换播放源失败",
        text2: "请尝试手动切换播放源",
      });
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
