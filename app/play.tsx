import React, { useEffect, useRef, useCallback, memo, useMemo, useState } from "react";
import { StyleSheet, TouchableOpacity, BackHandler, View, ScrollView, Text, ActivityIndicator } from "react-native";
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

  const { detail, searchResults, setDetail, error: detailError, loading: detailLoading } = useDetailStore();

  const isDetailMatching = useMemo(() => {
    if (!detail) return false;
    if (isLocalFile) return true;
    return String(detail.id || "") === params.id && detail.source === params.source;
  }, [detail, params.id, params.source, isLocalFile]);

  const source = params.source || detail?.source;
  const id = params.id || detail?.id?.toString();
  const title = params.title || detail?.title;

  const playerStore = usePlayerStore();
  const tvRemoteHandler = useTVRemoteHandler();

  const {
    status: playbackStatus,
    isLoading,
    showControls,
    showCastModal,
    initialPosition,
    introEndTime,
    playbackRate,
    currentEpisodeIndex,
    setVideoRef,
    handlePlaybackStatusUpdate,
    setShowControls,
    setShowCastModal,
    reset,
    loadVideo,
    isFullscreen,
    setIsFullscreen,
    togglePlayPause,
    seekToPosition,
  } = playerStore;

  const panStartPos = useRef<number>(0);

  // ---------------------------
  // 切换选集/切换源前安全卸载视频
  // ---------------------------
  const safeUnload = async () => {
    try {
      await videoRef.current?.unloadAsync();
    } catch (e) {
      console.warn("safeUnload error:", e);
    }
  };

  // ---------------------------
  // 手势（只初始化一次）
  // ---------------------------
  const gesture = useMemo(() => {
    const hasTap = typeof Gesture?.Tap === "function";
    const hasPan = typeof Gesture?.Pan === "function";
    const hasExclusive = typeof Gesture?.Exclusive === "function";
    const hasRace = typeof Gesture?.Race === "function";

    if (!hasTap && !hasPan) return null;

    try {
      const singleTap = Gesture.Tap()
        .runOnJS(true)
        .onEnd(() => {
          const { showControls, setShowControls } = usePlayerStore.getState();
          setShowControls(!showControls);
        });

      const doubleTap = Gesture.Tap()
        .numberOfTaps(2)
        .runOnJS(true)
        .onEnd(() => {
          const { togglePlayPause } = usePlayerStore.getState();
          togglePlayPause();
        });

      const panGesture = Gesture.Pan()
        .runOnJS(true)
        .onStart(() => {
          const s = usePlayerStore.getState();
          panStartPos.current = s.status?.positionMillis || 0;
        })
        .onUpdate((e) => {
          const s = usePlayerStore.getState();
          if (!s.status?.durationMillis) return;

          const duration = s.status.durationMillis;
          const target = Math.max(
            0,
            Math.min(panStartPos.current + e.translationX * 200, duration)
          );

          s.seekToPosition(target / duration, false);
        })
        .onEnd(() => {
          const s = usePlayerStore.getState();
          if (!s.status?.durationMillis) return;

          const duration = s.status.durationMillis;
          const target = Math.max(0, Math.min(panStartPos.current, duration));

          s.seekToPosition(target / duration, true);
        });

      return Gesture.Race(
        panGesture,
        Gesture.Exclusive(doubleTap, singleTap)
      ).runOnJS(true);

    } catch (err) {
      console.warn("gesture init failed:", err);
      return null;
    }
  }, []); // ← 关键：只初始化一次
  const [gestureEnabled, setGestureEnabled] = useState(false);

  useEffect(() => {
    setGestureEnabled(!!gesture);
  }, [gesture]);

  useEffect(() => {
    try {
      if (playbackStatus?.isLoaded && playbackStatus?.isPlaying) {
        activateKeepAwakeAsync().catch(() => {});
      } else {
        deactivateKeepAwakeAsync().catch(() => {});
      }
    } catch (e) {}
    return () => deactivateKeepAwakeAsync().catch(() => {});
  }, [playbackStatus?.isLoaded, playbackStatus?.isPlaying]);

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

  useEffect(() => {
    return () => {
      reset?.();
      if (isMobile) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
      }
    };
  }, []);

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
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
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
  }, [showControls, showCastModal, isFullscreen]);

  const episodes = useMemo(() => {
    if (!detail || !Array.isArray(detail.episodes)) return [];
    const list = detail.episodes.map((url: string, i: number) => ({ index: i, url }));
    return isReverse ? [...list].reverse() : list;
  }, [detail, isReverse]);

  // ---------------------------
  // 切换选集（已修复崩溃）
  // ---------------------------
  const handleEpisodePress = async (idx: number) => {
    if (idx === currentEpisodeIndex || !source || !id || !title) return;
    await safeUnload();
    loadVideo?.({ source, id, episodeIndex: idx, title });
  };

  // ---------------------------
  // 切换源（已修复崩溃）
  // ---------------------------
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
        {gestureEnabled && gesture ? (
          <GestureDetector gesture={gesture}>
            <View style={styles.videoWrapper}>
              {currentEpisode?.url ? (
                <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} pointerEvents="none" />
              ) : (
                <LoadingContainer style={styles.loadingContainer} currentEpisode={currentEpisode} />
              )}
              <SeekingBar />
              {currentEpisode?.url && isLoading && (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator size="large" color="#00bb5e" />
                </View>
              )}
            </View>
          </GestureDetector>
        ) : (
          <View style={styles.videoWrapper}>
            {currentEpisode?.url ? (
              <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} pointerEvents="none" />
            ) : (
              <LoadingContainer style={styles.loadingContainer} currentEpisode={currentEpisode} />
            )}
            <SeekingBar />
            {currentEpisode?.url && isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#00bb5e" />
                </View>
              )}
            </View>
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

  const renderTVLayout = () => (
    <ThemedView focusable style={styles.tvContainer}>
      {gestureEnabled && gesture ? (
        <GestureDetector gesture={gesture}>
          <View style={styles.videoWrapper}>
            {currentEpisode?.url ? (
              <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} pointerEvents="none" />
            ) : (
              <LoadingContainer style={styles.loadingContainer} currentEpisode={currentEpisode} />
            )}
            <SeekingBar />
            {currentEpisode?.url && isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#00bb5e" />
              </View>
            )}
          </View>
        </GestureDetector>
      ) : (
        <View style={styles.videoWrapper}>
          {currentEpisode?.url ? (
            <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} pointerEvents="none" />
          ) : (
            <LoadingContainer style={styles.loadingContainer} currentEpisode={currentEpisode} />
          )}
          <SeekingBar />
          {currentEpisode?.url && isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#00bb5e" />
            </View>
          )}
        </View>
      )}
    </ThemedView>
  );

  return (
    <ThemedView style={{ flex: 1, backgroundColor: isFullscreen || deviceType === "tv" ? "black" : "#151718" }}>
      <StatusBar hidden={isFullscreen ? !showControls : false} animated={true} />
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