import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, TouchableOpacity, Platform } from "react-native";
import { Pause, Play, SkipForward, List, Tv, ArrowDownToDot, ArrowUpFromDot, Gauge, ArrowLeft, RotateCw, Minimize2, Maximize2 } from "lucide-react-native";
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
  console.warn('[PlayerControls] Attempted to call undefined function:', fn?.name || 'anonymous');
};

export const PlayerControls: React.FC<PlayerControlsProps> = ({ showControls, setShowControls }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deviceType, isPortrait } = useResponsiveLayout();
  const isMobileLandscape = deviceType === 'mobile' && !isPortrait;

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
  } = usePlayerStore();

  const { detail } = useDetailStore();
  const resources = useSources();

  const videoTitle = detail?.title || "";
  const currentEpisode = (episodes && Array.isArray(episodes)) ? episodes[currentEpisodeIndex] : null;
  const currentEpisodeTitle = currentEpisode?.title;
  const currentSource = (resources && Array.isArray(resources)) ? resources.find((r) => r.source === detail?.source) : null;
  const currentSourceName = currentSource?.source_name;
  const hasNextEpisode = currentEpisodeIndex < (episodes?.length || 0) - 1;

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

  const onPlayNextEpisode = () => {
    if (hasNextEpisode && typeof playEpisode === 'function') {
      safeCall(playEpisode, currentEpisodeIndex + 1);
    } else if (!hasNextEpisode) {
      console.warn('[PlayerControls] No next episode available');
    } else {
      console.warn('[PlayerControls] playEpisode is not a function');
    }
  };

  const toggleOrientation = async () => {
    try {
      if (typeof ScreenOrientation?.lockAsync === 'function') {
        if (isPortrait) {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
          setIsFullscreen(true);
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
          // If we were already in fullscreen, we might want to stay in fullscreen but portrait
          // The user said "切换播放器横竖屏", so we stay in "fullscreen mode" but change orientation
        }
      } else {
        console.warn('[PlayerControls] ScreenOrientation.lockAsync is not available');
      }
    } catch (e) {
      console.warn("Failed to toggle orientation:", e);
    }
  };

  const enterFullscreen = async () => {
    try {
      if (typeof ScreenOrientation?.lockAsync === 'function') {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        setIsFullscreen(true);
      }
    } catch (e) {
      console.warn("Failed to enter fullscreen:", e);
    }
  };

  const exitFullscreen = async () => {
    try {
      if (typeof ScreenOrientation?.lockAsync === 'function') {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
        setIsFullscreen(false);
      } else {
        console.warn('[PlayerControls] ScreenOrientation.lockAsync is not available');
      }
    } catch (e) {
      console.warn("Failed to exit fullscreen:", e);
    }
  };

  if (isFullscreen) {
    return (
      <View style={[styles.controlsOverlay, { paddingLeft: Math.max(insets.left, 20), paddingRight: Math.max(insets.right, 20) }]}>
        <View style={styles.mobileTopBar}>
          <TouchableOpacity onPress={exitFullscreen} style={styles.iconBtn}>
            <ArrowLeft color="white" size={24} />
          </TouchableOpacity>
          <Text style={styles.mobileTitle} numberOfLines={1}>
            {videoTitle} {currentEpisodeTitle ? ` - ${currentEpisodeTitle}` : ` - 第${currentEpisodeIndex + 1}集`}
          </Text>
        </View>

        <View style={styles.mobileMiddleRight}>
          <TouchableOpacity onPress={toggleOrientation} style={styles.sideBtn}>
            <RotateCw color="white" size={24} />
            <Text style={styles.sideBtnText}>横竖屏</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mobileBottomSection}>
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground} />
            <View
              style={[
                styles.progressBarFilled,
                { width: `${(isSeeking ? seekPosition : progressPosition) * 100}%` },
              ]}
            />
          </View>

          <View style={styles.mobileBottomRow}>
            <View style={styles.mobileBottomLeft}>
              <MediaButton onPress={() => safeCall(togglePlayPause)} style={styles.mobileMediaBtn}>
                {status?.isLoaded && status.isPlaying ? (
                  <Pause color="white" size={24} />
                ) : (
                  <Play color="white" size={24} />
                )}
              </MediaButton>

              <MediaButton onPress={onPlayNextEpisode} disabled={!hasNextEpisode} style={styles.mobileMediaBtn}>
                <SkipForward color={hasNextEpisode ? "white" : "#666"} size={24} />
              </MediaButton>

              <TouchableOpacity onPress={() => safeCall(setShowEpisodeModal, true)} style={styles.mobileIconBtn}>
                <List color="white" size={22} />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => safeCall(setShowSourceModal, true)} style={styles.mobileIconBtn}>
                <Tv color="white" size={22} />
              </TouchableOpacity>

              <ThemedText style={styles.timeText}>
                {status?.isLoaded
                  ? `${formatTime(status.positionMillis)} / ${formatTime(status.durationMillis || 0)}`
                  : "00:00 / 00:00"}
              </ThemedText>
            </View>

            <View style={styles.mobileBottomRight}>
              <TouchableOpacity style={styles.mobileTextBtn} onPress={() => safeCall(setShowSpeedModal, true)}>
                <Text style={styles.mobileTextBtnLabel}>{playbackRate}X</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.mobileTextBtn} onPress={exitFullscreen}>
                <Minimize2 color="white" size={20} />
                <Text style={styles.mobileTextBtnLabel}>退出全屏</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (deviceType === 'mobile' && isPortrait) {
    return (
      <View style={styles.controlsOverlay}>
        <TouchableOpacity onPress={() => safeCall(togglePlayPause)} style={[styles.centerPlayBtn, { padding: 10, borderRadius: 30 }]}>
          {status?.isLoaded && status.isPlaying ? (
            <Pause color="white" size={32} />
          ) : (
            <Play color="white" size={32} />
          )}
        </TouchableOpacity>

        <View style={styles.mobileBottomSection}>
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground} />
            <View
              style={[styles.progressBarFilled, { width: `${(isSeeking ? seekPosition : progressPosition) * 100}%` }]}
            />
          </View>
          <View style={styles.mobileBottomRow}>
            <ThemedText style={[styles.timeText, { fontSize: 10 }]}>
              {status?.isLoaded
                ? `${formatTime(status.positionMillis)} / ${formatTime(status.durationMillis || 0)}`
                : "00:00 / 00:00"}
            </ThemedText>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity style={[styles.mobileTextBtn, { paddingHorizontal: 8, paddingVertical: 4 }]} onPress={() => safeCall(setShowSpeedModal, true)}>
                <Text style={[styles.mobileTextBtnLabel, { fontSize: 11 }]}>{playbackRate}X</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={enterFullscreen} style={[styles.iconBtn, { padding: 5 }]}>
                <Maximize2 color="white" size={20} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.controlsOverlay}>
      <View style={styles.topControls}>
        <Text style={styles.controlTitle}>
          {videoTitle} {currentEpisodeTitle ? `- ${currentEpisodeTitle}` : ""}{" "}
          {currentSourceName ? `(${currentSourceName})` : ""}
        </Text>
      </View>

      <View style={styles.bottomControlsContainer}>
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarBackground} />
          <View
            style={[styles.progressBarFilled, { width: `${(isSeeking ? seekPosition : progressPosition) * 100}%` }]}
          />
          <Pressable style={styles.progressBarTouchable} />
        </View>

        <ThemedText style={{ color: "white", marginTop: 5 }}>
          {status?.isLoaded
            ? `${formatTime(status.positionMillis)} / ${formatTime(status.durationMillis || 0)}`
            : "00:00 / 00:00"}
        </ThemedText>

        <View style={styles.bottomControls}>
          <MediaButton onPress={() => safeCall(setIntroEndTime)} timeLabel={introEndTime ? formatTime(introEndTime) : undefined}>
            <ArrowDownToDot color="white" size={24} />
          </MediaButton>

          <MediaButton onPress={() => safeCall(togglePlayPause)} hasTVPreferredFocus={showControls}>
            {status?.isLoaded && status.isPlaying ? (
              <Pause color="white" size={24} />
            ) : (
              <Play color="white" size={24} />
            )}
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
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "space-between",
    padding: 20,
  },
  topControls: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  controlTitle: { color: "white", fontSize: 16, fontWeight: "bold", flex: 1, textAlign: "center", marginHorizontal: 10 },
  bottomControlsContainer: { width: "100%", alignItems: "center" },
  bottomControls: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 15 },
  progressBarContainer: { width: "100%", height: 8, position: "relative", marginTop: 10 },
  progressBarBackground: { position: "absolute", left: 0, right: 0, height: 8, backgroundColor: "rgba(255, 255, 255, 0.3)", borderRadius: 4 },
  progressBarFilled: { position: "absolute", left: 0, height: 8, backgroundColor: "#fff", borderRadius: 4 },
  progressBarTouchable: { position: "absolute", left: 0, right: 0, height: 30, top: -10, zIndex: 10 },
  controlButton: { padding: 10, flexDirection: "row", alignItems: "center" },
  topRightContainer: { padding: 10, alignItems: "center", justifyContent: "center", minWidth: 44 },
  resolutionText: { color: "white", fontSize: 16, fontWeight: "bold", backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  mobileTopBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 10 },
  iconBtn: { padding: 10 },
  mobileTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginLeft: 10, flex: 1 },
  mobileMiddleRight: { position: 'absolute', right: 20, top: '50%', marginTop: -30, alignItems: 'center', zIndex: 100 },
  sideBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', width: 50, height: 50, borderRadius: 25 },
  sideBtnText: { color: 'white', fontSize: 9, marginTop: 2 },
  mobileBottomSection: { width: '100%', paddingBottom: 10 },
  mobileBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingHorizontal: 10 },
  mobileBottomLeft: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  mobileBottomRight: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  mobileMediaBtn: { minWidth: 44, padding: 8 },
  mobileIconBtn: { padding: 8 },
  timeText: { color: 'white', fontSize: 12, marginLeft: 5 },
  mobileTextBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  mobileTextBtnLabel: { color: 'white', fontSize: 13, fontWeight: '600' },
  centerPlayBtn: { position: 'absolute', top: '40%', left: '45%', backgroundColor: 'rgba(0,0,0,0.5)', padding: 15, borderRadius: 40 },
});
