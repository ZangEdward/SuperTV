import React, { useEffect, useRef, useCallback, memo, useMemo, useState } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  View,
  ScrollView,
  Text,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Video } from "expo-av";
import { activateKeepAwakeAsync, deactivateKeepAwakeAsync } from "expo-keep-awake";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedView } from "@/components/ThemedView";
import { PlayerControls } from "@/components/PlayerControls";
import { EpisodeSelectionModal } from "@/components/EpisodeSelectionModal";
import { SourceSelectionModal } from "@/components/SourceSelectionModal";
import { SpeedSelectionModal } from "@/components/SpeedSelectionModal";
import { CastModal } from "@/components/CastModal";
import { SeekingBar } from "@/components/SeekingBar";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import { ArrowLeft, Cast, Download } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import useDetailStore from "@/stores/detailStore";
import { useTVRemoteHandler } from "@/hooks/useTVRemoteHandler";
import usePlayerStore, { selectCurrentEpisode } from "@/stores/playerStore";
import useCacheStore from "@/stores/cacheStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useVideoHandlers } from "@/hooks/useVideoHandlers";
import { StyledButton } from "@/components/StyledButton";
import { parseEpisode } from "@/utils/episode";
import * as ScreenOrientation from "expo-screen-orientation";

const LoadingContainer = memo(({ style }: { style: any; currentEpisode: any }) => (
  <View style={style}>
    <VideoLoadingAnimation showProgressBar />
  </View>
));

export default function PlayScreen() {
  // 1. 基本 Hooks
  const videoRef = useRef<Video>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deviceType, screenWidth } = useResponsiveLayout();
  const isMobile = deviceType === "mobile";
  const isTV = deviceType === "tv";
  const params = useLocalSearchParams<{
    episodeIndex: string;
    position?: string;
    source?: string;
    id?: string;
    title?: string;
    fileUri?: string;
  }>();

  // 2. 状态 Hooks
  const [isReverse, setIsReverse] = useState(false);
  const [isInitFailed, setIsInitFailed] = useState(false);

  // 3. Store 选择器 Hooks
  const detail = useDetailStore(state => state.detail);
  const searchResults = useDetailStore(state => state.searchResults);
  const setDetail = useDetailStore(state => state.setDetail);
  const detailError = useDetailStore(state => state.error);
  const detailLoading = useDetailStore(state => state.loading);
  const optimizeSources = useDetailStore(state => state.optimizeSources);

  const status = usePlayerStore(state => state.status);
  const isLoading = usePlayerStore(state => state.isLoading);
  const showControls = usePlayerStore(state => state.showControls);
  const showCastModal = usePlayerStore(state => state.showCastModal);
  const initialPosition = usePlayerStore(state => state.initialPosition);
  const introEndTime = usePlayerStore(state => state.introEndTime);
  const playbackRate = usePlayerStore(state => state.playbackRate);
  const currentEpisodeIndex = usePlayerStore(state => state.currentEpisodeIndex);
  const isFullscreen = usePlayerStore(state => state.isFullscreen);
  const setVideoRef = usePlayerStore(state => state.setVideoRef);
  const handlePlaybackStatusUpdate = usePlayerStore(state => state.handlePlaybackStatusUpdate);
  const setShowControls = usePlayerStore(state => state.setShowControls);
  const setShowCastModal = usePlayerStore(state => state.setShowCastModal);
  const reset = usePlayerStore(state => state.reset);
  const loadVideo = usePlayerStore(state => state.loadVideo);
  const setIsFullscreen = usePlayerStore(state => state.setIsFullscreen);
  const togglePlayPause = usePlayerStore(state => state.togglePlayPause);
  const seekToPosition = usePlayerStore(state => state.seekToPosition);
  const currentEpisode = usePlayerStore(selectCurrentEpisode);

  const downloadEpisode = useCacheStore(state => state.downloadEpisode);

  // 4. 自定义 Logic Hooks
  useTVRemoteHandler();

  const { videoProps } = useVideoHandlers({
    videoRef,
    currentEpisode,
    initialPosition,
    introEndTime,
    playbackRate,
    handlePlaybackStatusUpdate,
    deviceType,
    detail: detail || undefined,
  });

  // 5. 衍生状态和 Memo Hooks
  const isDetailMatching = useMemo(() => {
    if (!detail) return false;
    if (!!params.fileUri) return true;
    return String(detail.id || "") === params.id && detail.source === params.source;
  }, [detail, params.id, params.source, params.fileUri]);

  const episodes = useMemo(() => {
    if (!detail || !Array.isArray(detail.episodes)) return [];
    const list = detail.episodes.map((raw, i) => ({ ...parseEpisode(raw, i), index: i }));
    return isReverse ? [...list].reverse() : list;
  }, [detail, isReverse]);

  const panStartPos = useRef<number>(0);

  const gesture = useMemo(() => {
    const hasTap = typeof Gesture?.Tap === "function";
    if (!hasTap) return null;

    try {
      // 单击手势：切换显示/隐藏控件
      return Gesture.Tap()
        .maxDuration(250)
        .runOnJS(true)
        .onEnd(() => {
          const { showControls, setShowControls } = usePlayerStore.getState();
          setShowControls(!showControls);
        });
    } catch (err) {
      console.warn("gesture init failed:", err);
      return null;
    }
  }, []);

  const videoElement = useMemo(() => (
    currentEpisode?.url ? (
      <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} />
    ) : (
      <LoadingContainer style={styles.loadingContainer} currentEpisode={currentEpisode} />
    )
  ), [currentEpisode?.url, videoProps]);

  const videoContent = useMemo(() => (
    <View style={styles.videoWrapper}>
      {videoElement}
      <SeekingBar />
      {currentEpisode?.url && isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#00bb5e" />
        </View>
      )}
    </View>
  ), [videoElement, currentEpisode?.url, isLoading]);

  // 6. 回调 Hooks
  const handleDownloadPress = useCallback(() => {
    const source = params.source || detail?.source;
    const id = params.id || detail?.id?.toString();
    const title = params.title || detail?.title;
    if (!currentEpisode?.url || !source || !id || !title) return;
    downloadEpisode({
      source,
      source_name: detail?.source_name || source,
      title: detail?.title || title,
      poster: detail?.poster || "",
      id,
      episodeIndex: currentEpisodeIndex,
      episodeTitle: currentEpisode.title,
      episodeUrl: currentEpisode.url,
      totalEpisodes: episodes.length,
    });
  }, [currentEpisode, currentEpisodeIndex, episodes.length, params, detail, downloadEpisode]);

  const handleTapFallback = useCallback(() => {
    const { setShowControls, showControls } = usePlayerStore.getState();
    if (typeof setShowControls === 'function') {
      setShowControls(!showControls);
    }
  }, []);

  const safeUnload = useCallback(async () => {
    try {
      await videoRef.current?.unloadAsync();
    } catch (e) {
      console.warn("safeUnload error:", e);
    }
  }, []);

  const handleEpisodePress = useCallback(async (idx: number) => {
    const source = params.source || detail?.source;
    const id = params.id || detail?.id?.toString();
    const title = params.title || detail?.title;
    if (idx === currentEpisodeIndex || !source || !id || !title) return;
    await safeUnload();
    loadVideo?.({ source, id, episodeIndex: idx, title });
  }, [currentEpisodeIndex, params, detail, loadVideo, safeUnload]);

  const handleSourcePress = useCallback(async (item: any) => {
    const source = params.source || detail?.source;
    if (item.source === source) return;

    // 切换源时保留当前播放进度
    const currentPos = status?.isLoaded ? status.positionMillis : undefined;

    await safeUnload();
    setDetail?.(item);
    loadVideo?.({
      source: item.source,
      id: item.id.toString(),
      episodeIndex: currentEpisodeIndex,
      title: item.title,
      position: currentPos, // 传递进度实现无缝切换
    });
  }, [detail, params.source, safeUnload, setDetail, loadVideo, currentEpisodeIndex, status]);

  // 7. 副作用 Hooks
  useEffect(() => {
    const doKeepAwake = async () => {
      try {
        if (status?.isLoaded && status?.isPlaying) {
          if (typeof activateKeepAwakeAsync === 'function') {
            await activateKeepAwakeAsync();
          }
        } else {
          if (typeof deactivateKeepAwakeAsync === 'function') {
            await deactivateKeepAwakeAsync();
          }
        }
      } catch (e) {}
    };
    doKeepAwake();
    return () => {
      if (typeof deactivateKeepAwakeAsync === 'function') {
        deactivateKeepAwakeAsync().catch(() => {});
      }
    };
  }, [status?.isLoaded, status?.isPlaying]);

  useEffect(() => {
    setVideoRef?.(videoRef);
    setShowCastModal?.(false);
    const initialEpIndex = parseInt(params.episodeIndex || "0", 10);
    const position = params.position ? parseInt(params.position, 10) : undefined;

    if (params.fileUri) {
      loadVideo?.({
        source: params.source || "local",
        id: params.id || "local",
        episodeIndex: initialEpIndex,
        position,
        title: params.title || "离线播放",
        fileUri: params.fileUri,
      });
    } else if (params.source && params.id && params.title) {
      loadVideo?.({
        source: params.source,
        id: params.id,
        episodeIndex: initialEpIndex,
        position,
        title: params.title,
      });
    }

    // [逻辑升级] 进入播放页后，自动在后台启动测速优化，方便用户快速换源
    if (!isTV) {
      setTimeout(() => optimizeSources(), 1000);
    }
  }, []);

  useEffect(() => {
    return () => {
      reset?.();
      if (isMobile && typeof ScreenOrientation?.lockAsync === 'function') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
      }
    };
  }, [isMobile, reset]);

  useEffect(() => {
    const isLocalFile = !!params.fileUri;
    if (!isLocalFile && !detail && !detailLoading && !detailError) {
      const timer = setTimeout(() => {
        if (!useDetailStore.getState().detail) setIsInitFailed(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else if (detail) {
      setIsInitFailed(false);
    }
  }, [detail, detailLoading, detailError, params.fileUri]);

  useEffect(() => {
    const backAction = () => {
      if (showCastModal) {
        setShowCastModal?.(false);
        return true;
      }
      if (isFullscreen) {
        if (typeof ScreenOrientation?.lockAsync === 'function') {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
        }
        setIsFullscreen?.(false);
        return true;
      }
      if (showControls && deviceType === "tv") {
        setShowControls?.(false);
        return true;
      }
      router.back();
      return true;
    };
    BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => BackHandler.removeEventListener("hardwareBackPress", backAction);
  }, [showControls, showCastModal, isFullscreen, deviceType, router, setShowCastModal, setIsFullscreen, setShowControls]);

  // 8. 提前返回语句
  const isLocalFile = !!params.fileUri;
  if (!isLocalFile && !detail && isInitFailed) {
    return (
      <ThemedView style={[styles.tvContainer, { justifyContent: "center", alignItems: "center", backgroundColor: deviceType === "tv" ? "black" : "#151718" }]}>
        <View style={{ alignItems: "center", paddingHorizontal: 20 }}>
          <Text style={{ color: "#ff4444", fontSize: 18, marginBottom: 12 }}>无法加载播放源</Text>
          <StyledButton text="返回" onPress={() => router.back()} variant="ghost" />
        </View>
      </ThemedView>
    );
  }

  if (!isLocalFile && (!detail || !isDetailMatching)) {
    return (
      <ThemedView style={[styles.tvContainer, { backgroundColor: deviceType === "tv" ? "black" : "#151718", justifyContent: "center", alignItems: "center" }]}>
        <VideoLoadingAnimation showProgressBar />
      </ThemedView>
    );
  }

  // 9. 渲染函数
  const source = params.source || detail?.source;
  const title = params.title || detail?.title;

  const renderMobileLayout = () => (
    <View style={[styles.mobileContainer, isFullscreen && styles.fullscreenContainer]}>
      {!isFullscreen && (
        <View style={[styles.customHeader, { paddingTop: Math.max(insets.top, 10) }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{detail?.title || title || "播放"}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.overlayIcon} onPress={handleDownloadPress}>
              <Download size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.overlayIcon, { marginLeft: 8 }]} onPress={() => setShowCastModal?.(true)}>
              <Cast size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={isFullscreen ? styles.playerSectionFullscreen : [styles.playerSection, { marginTop: 0 }]}>
        {gesture ? (
          <GestureDetector gesture={gesture}>
            <View style={{ flex: 1 }}>
              {videoContent}
            </View>
          </GestureDetector>
        ) : (
          <TouchableOpacity activeOpacity={1} onPress={handleTapFallback} style={{ flex: 1 }}>
            {videoContent}
          </TouchableOpacity>
        )}
        {showControls && <PlayerControls showControls={showControls} setShowControls={setShowControls} />}
      </View>

      {!isFullscreen && (
        <View style={styles.mobileBottomBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.episodeScroll}>
            {episodes.map((ep) => (
              <TouchableOpacity
                key={ep.index}
                style={[
                  styles.mobileEpItem,
                  ep.index === currentEpisodeIndex && styles.mobileEpItemActive,
                  ep.title.length > 2 && { minWidth: 60 }
                ]}
                onPress={() => handleEpisodePress(ep.index)}
              >
                <Text style={[styles.mobileEpText, ep.index === currentEpisodeIndex && styles.mobileEpTextActive]}>
                  {ep.title}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sourceScroll}>
            {(searchResults || []).map((item, idx) => {
              const isSelected = source === item.source;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.mobileSourceItem, isSelected && styles.mobileSourceItemActive]}
                  onPress={() => handleSourcePress(item)}
                >
                  <View style={{ alignItems: 'center' }}>
                    <Text style={[styles.mobileSourceText, isSelected && styles.mobileSourceTextActive]} numberOfLines={1}>
                      {item.source_name}
                    </Text>
                    {item.speed !== undefined && item.speed > 0 && (
                      <Text style={{ fontSize: 9, color: item.speed > 1 ? '#00bb5e' : '#888', marginTop: 2 }}>
                        {SpeedTestService.formatSpeed(item.speed)}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );

  const renderTVLayout = () => (
    <ThemedView focusable style={styles.tvContainer}>
      <View style={styles.videoWrapper}>
        <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} />
        <SeekingBar />
      </View>
      {showControls && <PlayerControls showControls={showControls} setShowControls={setShowControls} />}
    </ThemedView>
  );

  return (
    <ThemedView style={{ flex: 1, backgroundColor: isFullscreen || deviceType === "tv" ? "black" : "#151718" }}>
      <StatusBar hidden={isFullscreen} translucent={isFullscreen} style="light" animated={true} />
      {deviceType === "tv" ? renderTVLayout() : renderMobileLayout()}
      <EpisodeSelectionModal />
      <SourceSelectionModal />
      <SpeedSelectionModal />
      {deviceType !== "tv" && <CastModal />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tvContainer: { flex: 1 },
  mobileContainer: { flex: 1 },
  customHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "bold",
    color: "#00bb5e",
    marginHorizontal: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  overlayIcon: {
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
  },
  playerSection: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "transparent",
  },
  playerSectionFullscreen: {
    flex: 1,
    backgroundColor: "#000",
  },
  videoWrapper: { flex: 1 },
  videoPlayer: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(21, 23, 24, 0.7)",
  },
  mobileBottomBar: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 12,
  },
  episodeScroll: { maxHeight: 42, marginBottom: 12 },
  mobileEpItem: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 8,
    justifyContent: 'center',
  },
  mobileEpItemActive: { backgroundColor: "#00bb5e" },
  mobileEpText: { color: "#999", fontSize: 13, fontWeight: "600" },
  mobileEpTextActive: { color: "#fff" },
  sourceScroll: { maxHeight: 50 },
  mobileSourceItem: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    minWidth: 80,
    justifyContent: 'center',
  },
  mobileSourceItemActive: {
    borderColor: "#00bb5e",
    borderWidth: 1,
    backgroundColor: "rgba(0,187,94,0.08)",
  },
  mobileSourceText: { color: "#bbb", fontSize: 12, maxWidth: 100 },
  mobileSourceTextActive: { color: "#00bb5e", fontWeight: "700" },
  fullscreenContainer: { paddingTop: 0, paddingHorizontal: 0 },
});
