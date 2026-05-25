import React, { useState, useCallback, memo } from "react";
import { View, Text, StyleSheet, Pressable, TouchableOpacity, Platform, GestureResponderEvent } from "react-native";
import { Pause, Play, SkipForward, List, Tv, ArrowDownToDot, ArrowUpFromDot, Gauge, ArrowLeft, RotateCw, Minimize2, Maximize2, Cast } from "lucide-react-native";
import { useRouter } from "expo-router";
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { MediaButton } from "@/components/MediaButton";

import usePlayerStore from "@/stores/playerStore";
import useDetailStore from "@/stores/detailStore";
import { useSources } from "@/stores/sourceStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import Colors from "@/constants/Colors";

interface PlayerControlsProps {
  showControls: boolean;
  setShowControls: (show: boolean) => void;
}

// Safe function call helper - prevents "undefined is not a function" crashes
const safeCall = (fn: any, ...args: any[]) => {
  if (typeof fn === 'function') {
    return fn(...args);
  }
};

const formatTime = (milliseconds: number) => {
  if (!milliseconds) return "00:00";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

export const PlayerControls: React.FC<PlayerControlsProps> = memo(({ showControls, setShowControls }) => {
  const insets = useSafeAreaInsets();
  const { deviceType, isPortrait } = useResponsiveLayout();

  const {
    currentEpisodeIndex,
    episodes,
    status,
    isSeeking,
    seekPosition,
    progressPosition,
    playbackRate,
    togglePlayPause,
    playEpisode,
    setShowEpisodeModal,
    setShowSourceModal,
    setShowSpeedModal,
    setShowCastModal,
    setIntroEndTime,
    setOutroStartTime,
    introEndTime,
    outroStartTime,
    isFullscreen,
    setIsFullscreen,
    seekToPosition,
  } = usePlayerStore();

  const { detail } = useDetailStore();
  const resources = useSources();

  const videoTitle = detail?.title || "";
  const currentEpisode = (episodes && Array.isArray(episodes)) ? episodes[currentEpisodeIndex] : null;
  const currentEpisodeTitle = currentEpisode?.title;
  const currentSourceName = resources?.find((r) => r.source === detail?.source)?.source_name;
  const hasNextEpisode = currentEpisodeIndex < (episodes?.length || 0) - 1;

  const onPlayNextEpisode = () => {
    if (hasNextEpisode) {
      safeCall(playEpisode, currentEpisodeIndex + 1);
    }
  };

  const [barWidth, setBarWidth] = useState(0);

  const handleProgressTouch = (e: GestureResponderEvent) => {
    if (barWidth > 0 && e.nativeEvent) {
      const touchX = e.nativeEvent.locationX;
      const ratio = Math.max(0, Math.min(touchX / barWidth, 1));
      const touches = e.nativeEvent.touches || [];
      const isFinalize = touches.length === 0;
      safeCall(seekToPosition, ratio, isFinalize);
    }
  };

  const toggleOrientation = async () => {
    try {
      if (isPortrait) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        setIsFullscreen(true);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
      }
    } catch (e) {}
  };

  const enterFullscreen = async () => {
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      setIsFullscreen(true);
    } catch (e) {}
  };

  const exitFullscreen = async () => {
    try {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
      setIsFullscreen(false);
    } catch (e) {}
  };

  // 渲染全屏布局 (横屏/竖屏全屏)
  if (isFullscreen) {
    return (
      <Pressable onPress={() => setShowControls(false)} style={styles.fullscreenClickArea}>
        <View style={[styles.controlsOverlay, { paddingLeft: Math.max(insets.left, 20), paddingRight: Math.max(insets.right, 20) }]}>
          {/* 顶部栏 */}
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.mobileTopBar}>
            <TouchableOpacity onPress={exitFullscreen} style={styles.iconBtn}>
              <ArrowLeft color="white" size={24} />
            </TouchableOpacity>
            <Text style={styles.mobileTitle} numberOfLines={1}>
              {videoTitle} {currentEpisodeTitle ? ` - ${currentEpisodeTitle}` : ` - 第${currentEpisodeIndex + 1}集`}
            </Text>
            <TouchableOpacity onPress={() => safeCall(setShowCastModal, true)} style={styles.iconBtn}>
              <Cast color="white" size={22} />
            </TouchableOpacity>
          </Pressable>

          {/* 中间播放按钮 (仅在竖屏全屏下显示大的，防止按钮过小) */}
          {isPortrait && (
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.centerControlArea}>
              <TouchableOpacity onPress={() => safeCall(togglePlayPause)} style={styles.centerPlayBtnBig}>
                {status?.isLoaded && status.isPlaying ? <Pause color="white" size={40} /> : <Play color="white" size={40} />}
              </TouchableOpacity>
            </Pressable>
          )}

          {/* 底部控制区 */}
          <Pressable onPress={(e) => e.stopPropagation()} style={[styles.mobileBottomSection, { paddingBottom: Math.max(insets.bottom, 15) }]}>
            {/* 进度条 */}
            <View
              style={styles.progressBarContainer}
              onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={handleProgressTouch}
              onResponderMove={handleProgressTouch}
              onResponderRelease={handleProgressTouch}
            >
              <View style={styles.progressBarBackground} />
              <View style={[styles.progressBarFilled, { width: `${(isSeeking ? seekPosition : progressPosition) * 100}%` }]} />
            </View>

            {/* 控制按钮行 */}
            <View style={styles.mobileBottomRow}>
              <View style={styles.mobileBottomLeft}>
                {!isPortrait && (
                  <TouchableOpacity onPress={() => safeCall(togglePlayPause)} style={styles.mobileMediaBtn}>
                    {status?.isLoaded && status.isPlaying ? <Pause color="white" size={24} /> : <Play color="white" size={24} />}
                  </TouchableOpacity>
                )}

                <TouchableOpacity onPress={onPlayNextEpisode} disabled={!hasNextEpisode} style={styles.mobileMediaBtn}>
                  <SkipForward color={hasNextEpisode ? "white" : "#666"} size={24} />
                </TouchableOpacity>

                <ThemedText style={styles.timeText}>
                  {status?.isLoaded ? `${formatTime(status.positionMillis)} / ${formatTime(status.durationMillis || 0)}` : "00:00 / 00:00"}
                </ThemedText>
              </View>

              <View style={styles.mobileBottomRight}>
                <TouchableOpacity onPress={() => safeCall(setShowEpisodeModal, true)} style={styles.mobileIconBtn}>
                  <List color="white" size={22} />
                </TouchableOpacity>

                {/* 仅在横屏时显示换源按钮 */}
                {!isPortrait && (
                  <TouchableOpacity onPress={() => safeCall(setShowSourceModal, true)} style={styles.mobileIconBtn}>
                    <Tv color="white" size={22} />
                  </TouchableOpacity>
                )}

                {/* 始终显示旋转按钮，方便竖屏切换 */}
                <TouchableOpacity onPress={toggleOrientation} style={styles.mobileIconBtn}>
                  <RotateCw color="white" size={22} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.mobileTextBtn} onPress={() => safeCall(setShowSpeedModal, true)}>
                  <Text style={styles.mobileTextBtnLabel}>{playbackRate}X</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={exitFullscreen} style={styles.mobileIconBtn}>
                  <Minimize2 color="white" size={22} />
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </View>
      </Pressable>
    );
  }

  // 渲染普通竖屏布局 (非全屏)
  if (deviceType === 'mobile' && isPortrait) {
    return (
      <Pressable onPress={() => setShowControls(false)} style={styles.fullscreenClickArea}>
        <View style={styles.controlsOverlay}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.centerControlArea}>
             <TouchableOpacity onPress={() => safeCall(togglePlayPause)} style={styles.centerPlayBtnSmall}>
              {status?.isLoaded && status.isPlaying ? <Pause color="white" size={24} /> : <Play color="white" size={24} />}
            </TouchableOpacity>
          </Pressable>

          <Pressable onPress={(e) => e.stopPropagation()} style={[styles.mobileBottomSection, { paddingBottom: 10 }]}>
            <View
              style={styles.progressBarContainerSmall}
              onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={handleProgressTouch}
              onResponderMove={handleProgressTouch}
              onResponderRelease={handleProgressTouch}
            >
              <View style={styles.progressBarBackgroundSmall} />
              <View style={[styles.progressBarFilledSmall, { width: `${(isSeeking ? seekPosition : progressPosition) * 100}%` }]} />
            </View>

            <View style={styles.mobileNonFullscreenBottomRow}>
               <ThemedText style={styles.timeTextSmall}>
                  {status?.isLoaded ? `${formatTime(status.positionMillis)} / ${formatTime(status.durationMillis || 0)}` : "00:00 / 00:00"}
                </ThemedText>
              <TouchableOpacity onPress={enterFullscreen} style={styles.iconBtnSmall}>
                <Maximize2 color="white" size={20} />
              </TouchableOpacity>
            </View>
          </Pressable>
        </View>
      </Pressable>
    );
  }

  // TV / 其他默认布局
  return (
    <Pressable onPress={() => setShowControls(false)} style={styles.fullscreenClickArea}>
      <View style={styles.controlsOverlay}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.topControls}>
          <Text style={styles.controlTitle}>
            {videoTitle} {currentEpisodeTitle ? `- ${currentEpisodeTitle}` : ""}{" "}
            {currentSourceName ? `(${currentSourceName})` : ""}
          </Text>
        </Pressable>

        <Pressable onPress={(e) => e.stopPropagation()} style={styles.bottomControlsContainer}>
          <View
            style={styles.progressBarContainer}
            onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => deviceType !== 'tv'}
            onMoveShouldSetResponder={() => deviceType !== 'tv'}
            onResponderGrant={handleProgressTouch}
            onResponderMove={handleProgressTouch}
            onResponderRelease={handleProgressTouch}
          >
            <View style={styles.progressBarBackground} />
            <View style={[styles.progressBarFilled, { width: `${(isSeeking ? seekPosition : progressPosition) * 100}%` }]} />
          </View>

          <ThemedText style={{ color: "white", marginTop: 5 }}>
            {status?.isLoaded ? `${formatTime(status.positionMillis)} / ${formatTime(status.durationMillis || 0)}` : "00:00 / 00:00"}
          </ThemedText>

          <View style={styles.bottomControls}>
            <MediaButton onPress={() => safeCall(setIntroEndTime)} timeLabel={introEndTime ? formatTime(introEndTime) : undefined}>
              <ArrowDownToDot color="white" size={24} />
            </MediaButton>
            <MediaButton onPress={() => safeCall(togglePlayPause)} hasTVPreferredFocus={showControls}>
              {status?.isLoaded && status.isPlaying ? <Pause color="white" size={24} /> : <Play color="white" size={24} />}
            </MediaButton>
            <MediaButton onPress={onPlayNextEpisode} disabled={!hasNextEpisode}>
              <SkipForward color={hasNextEpisode ? "white" : "#666"} size={24} />
            </MediaButton>
            <MediaButton onPress={() => safeCall(setOutroStartTime)} timeLabel={outroStartTime ? formatTime(outroStartTime) : undefined}>
              <ArrowUpFromDot color="white" size={24} />
            </MediaButton>
            <MediaButton onPress={() => safeCall(setShowEpisodeModal, true)}>
              <List color="white" size={24} />
            </MediaButton>
            <MediaButton onPress={() => safeCall(setShowSpeedModal, true)} timeLabel={playbackRate !== 1.0 ? `${playbackRate}x` : undefined}>
              <Gauge color="white" size={24} />
            </MediaButton>
            <MediaButton onPress={() => safeCall(setShowSourceModal, true)}>
              <Tv color="white" size={24} />
            </MediaButton>
          </View>
        </Pressable>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  fullscreenClickArea: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  controlsOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "space-between",
    padding: 20,
  },
  topControls: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  controlTitle: { color: "white", fontSize: 16, fontWeight: "bold", flex: 1, textAlign: "center", marginHorizontal: 10 },
  bottomControlsContainer: { width: "100%", alignItems: "center" },
  bottomControls: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 15 },
  progressBarContainer: { width: "100%", height: 30, position: "relative", marginTop: 5, justifyContent: 'center' },
  progressBarBackground: { position: "absolute", left: 0, right: 0, height: 4, backgroundColor: "rgba(255, 255, 255, 0.2)", borderRadius: 2 },
  progressBarFilled: { position: "absolute", left: 0, height: 4, backgroundColor: "#00bb5e", borderRadius: 2 },
  mobileTopBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 10 },
  iconBtn: { padding: 10 },
  mobileTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', marginLeft: 10, flex: 1 },
  mobileBottomSection: { width: '100%' },
  mobileBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  mobileBottomLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mobileBottomRight: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  mobileMediaBtn: { padding: 8 },
  mobileIconBtn: { padding: 8 },
  timeText: { color: 'white', fontSize: 12, marginLeft: 2 },
  timeTextSmall: { color: 'white', fontSize: 11, opacity: 0.8 },
  mobileTextBtn: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  mobileTextBtnLabel: { color: 'white', fontSize: 11, fontWeight: '600' },
  centerControlArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerPlayBtnBig: { backgroundColor: 'rgba(0, 0, 0, 0.4)', padding: 20, borderRadius: 50 },
  centerPlayBtnSmall: { backgroundColor: 'rgba(0, 0, 0, 0.4)', padding: 12, borderRadius: 30 },
  progressBarContainerSmall: { width: "100%", height: 16, position: "relative", justifyContent: 'center' },
  progressBarBackgroundSmall: { position: "absolute", left: 0, right: 0, height: 3, backgroundColor: "rgba(255, 255, 255, 0.2)", borderRadius: 1.5 },
  progressBarFilledSmall: { position: "absolute", left: 0, height: 3, backgroundColor: "#00bb5e", borderRadius: 1.5 },
  mobileNonFullscreenBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, paddingHorizontal: 4 },
  iconBtnSmall: { padding: 8 },
});
