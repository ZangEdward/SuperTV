import React, { useEffect, useRef, useCallback, memo, useMemo, useState } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  View,
  ScrollView,
  Text,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Video } from "expo-av";
import { activateKeepAwakeAsync, deactivateKeepAwakeAsync } from "expo-keep-awake";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { ThemedView } from "@/components/ThemedView";
import { PlayerControls } from "@/components/PlayerControls";
import { EpisodeSelectionModal } from "@/components/EpisodeSelectionModal";
import { SourceSelectionModal } from "@/components/SourceSelectionModal";
import { SpeedSelectionModal } from "@/components/SpeedSelectionModal";
import { CastModal } from "@/components/CastModal";
import { SeekingBar } from "@/components/SeekingBar";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import { ArrowLeft, Cast } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import useDetailStore from "@/stores/detailStore";
import { useTVRemoteHandler } from "@/hooks/useTVRemoteHandler";
import usePlayerStore, { selectCurrentEpisode } from "@/stores/playerStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useVideoHandlers } from "@/hooks/useVideoHandlers";
import { StyledButton } from "@/components/StyledButton";
import * as ScreenOrientation from "expo-screen-orientation";

const LoadingContainer = memo(({ style }: { style: any; currentEpisode: any }) => (
  <View style={style}>
    <VideoLoadingAnimation showProgressBar />
  </View>
));

export default function PlayScreen() {
  const videoRef = useRef<Video>(null);
  const router = useRouter();
  const { deviceType } = useResponsiveLayout();
  const isMobile = deviceType === "mobile";

  const params = useLocalSearchParams<{
    episodeIndex: string;
    position?: string;
    source?: string;
    id?: string;
    title?: string;
    fileUri?: string;
  }>();

  const initialEpIndex = parseInt(params.episodeIndex || "0", 10);
  const position = params.position ? parseInt(params.position, 10) : undefined;
  const isLocalFile = !!params.fileUri;

  // [FIX] 使用 zustand 选择器稳定获取每个状态，减少不必要的 re-render
  const detail = useDetailStore(state => state.detail);
  const searchResults = useDetailStore(state => state.searchResults);
  const setDetail = useDetailStore(state => state.setDetail);
  const detailError = useDetailStore(state => state.error);
  const detailLoading = useDetailStore(state => state.loading);

  const isDetailMatching = useMemo(() => {
    if (!detail) return false;
    if (isLocalFile) return true;
    return String(detail.id || "") === params.id && detail.source === params.source;
  }, [detail, params.id, params.source, isLocalFile]);

  const source = params.source || detail?.source;
  const id = params.id || detail?.id?.toString();
  const title = params.title || detail?.title;

  useTVRemoteHandler(); // 仅用于注册 TV 事件，移动端也会初始化但无负面影响

  // [FIX] 使用 zustand 选择器稳定获取每个状态和函数引用，避免解构导致每次渲染引用变化
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

  const panStartPos = useRef<number>(0);

  // 切换选集/切换源前安全卸载视频
  const safeUnload = async () => {
    try {
      await videoRef.current?.unloadAsync();
    } catch (e) {
      console.warn("safeUnload error:", e);
    }
  };

  const gesture = useMemo(() => {
    const hasTap = typeof Gesture?.Tap === "function";
    if (!hasTap) return null;

    try {
      // 单击手势：切换显示/隐藏控件
      const singleTap = Gesture.Tap()
        .maxDuration(250)
        .runOnJS(true)
        .onEnd(() => {
          const { showControls, setShowControls } = usePlayerStore.getState();
          setShowControls(!showControls);
        });

      return singleTap;
    } catch (err) {
      console.warn("gesture init failed:", err);
      return null;
    }
  }, []);

  // 后备点击（手势不可用时）
  const handleTapFallback = useCallback(() => {
    const { setShowControls, showControls } = usePlayerStore.getState();
    if (typeof setShowControls === 'function') {
      setShowControls(!showControls);
    }
  }, []);

  // ========== KeepAwake 安全调用 ==========
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

  const currentEpisode = usePlayerStore(selectCurrentEpisode);
  const [isReverse, setIsReverse] = useState(false);
  const [isInitFailed, setIsInitFailed] = useState(false);

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

  useEffect(() => {
    setVideoRef?.(videoRef);
    setShowCastModal?.(false);

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
  }, []);

  // ========== 清理时屏幕方向安全调用 ==========
  useEffect(() => {
    return () => {
      reset?.();
      if (isMobile && typeof ScreenOrientation?.lockAsync === 'function') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
      }
    };
  }, [isMobile]);

  useEffect(() => {
    if (!isLocalFile && !detail && !detailLoading && !detailError) {
      const timer = setTimeout(() => {
        if (!useDetailStore.getState().detail) setIsInitFailed(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else if (detail) {
      setIsInitFailed(false);
    }
  }, [detail, detailLoading, detailError, isLocalFile]);

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

  const episodes = useMemo(() => {
    if (!detail || !Array.isArray(detail.episodes)) return [];
    const list = detail.episodes.map((url: string, i: number) => ({ index: i, url }));
    return isReverse ? [...list].reverse() : list;
  }, [detail, isReverse]);

  const handleEpisodePress = async (idx: number) => {
    if (idx === currentEpisodeIndex || !source || !id || !title) return;
    await safeUnload();
    loadVideo?.({ source, id, episodeIndex: idx, title });
  };

  const handleSourcePress = async (item: any) => {
    if (item.source === source) return;
    await safeUnload();
    setDetail?.(item);
    loadVideo?.({
      source: item.source,
      id: item.id.toString(),
      episodeIndex: currentEpisodeIndex,
      title: item.title,
    });
  };

  // [FIX] 将所有 Hooks 移到任何 return 语句之前，确保渲染顺序一致
  // [FIX] 分离 Video 组件和 Loading 遮罩，避免 isLoading 变化导致 Video 重新挂载引发闪烁/无限循环
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

  // 移动端布局：使用手势
  const renderMobileLayout = () => (
    <View style={[styles.mobileContainer, isFullscreen && styles.fullscreenContainer]}>
      {!isFullscreen && (
        <View style={styles.customHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{detail?.title || title || "播放"}</Text>
          <TouchableOpacity style={styles.overlayIcon} onPress={() => setShowCastModal?.(true)}>
            <Cast size={20} color="white" />
          </TouchableOpacity>
        </View>
      )}

      <View style={isFullscreen ? styles.playerSectionFullscreen : [styles.playerSection, { marginTop: 10 }]}>
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
                style={[styles.mobileEpItem, ep.index === currentEpisodeIndex && styles.mobileEpItemActive]}
                onPress={() => handleEpisodePress(ep.index)}
              >
                <Text style={[styles.mobileEpText, ep.index === currentEpisodeIndex && styles.mobileEpTextActive]}>
                  {ep.index + 1}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sourceScroll}>
            {(searchResults || []).map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.mobileSourceItem, source === item.source && styles.mobileSourceItemActive]}
                onPress={() => handleSourcePress(item)}
              >
                <Text style={[styles.mobileSourceText, source === item.source && styles.mobileSourceTextActive]} numberOfLines={1}>
                  {item.source_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  // TV 端布局：不使用手势，仅依靠遥控器按键
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
    paddingTop: 40,
  },

  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "bold",
    color: "#00bb5e",
    marginHorizontal: 8,
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
    paddingTop: 8,
  },

  episodeScroll: { maxHeight: 40, marginBottom: 10 },

  mobileEpItem: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 6,
  },
  mobileEpItemActive: { backgroundColor: "#00bb5e" },

  mobileEpText: { color: "#999", fontSize: 13, fontWeight: "600" },
  mobileEpTextActive: { color: "#fff" },

  sourceScroll: { maxHeight: 38 },

  mobileSourceItem: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 6,
  },
  mobileSourceItemActive: {
    borderColor: "#00bb5e",
    borderWidth: 1,
    backgroundColor: "rgba(0,187,94,0.08)",
  },

  mobileSourceText: { color: "#bbb", fontSize: 12, maxWidth: 90 },
  mobileSourceTextActive: { color: "#00bb5e", fontWeight: "700" },

  fullscreenContainer: { paddingTop: 0, paddingHorizontal: 0 },
});