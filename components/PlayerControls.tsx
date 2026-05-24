import React from "react";
import { StyleSheet, View, Text, TouchableOpacity, Platform } from "react-native";
import usePlayerStore from "@/stores/playerStore";

interface PlayerControlsProps {
  showControls: boolean;
  setShowControls: (show: boolean) => void;
}

export function PlayerControls({ showControls, setShowControls }: PlayerControlsProps) {
  const {
    status: playbackStatus,
    togglePlayPause,
    seekToPosition,
    isFullscreen,
    setIsFullscreen,
  } = usePlayerStore();

  const isPlaying = playbackStatus?.isLoaded
    ? (playbackStatus as any)?.isPlaying ?? false
    : false;

  const handleTogglePlayPause = () => {
    togglePlayPause?.();
  };

  const handleToggleFullscreen = () => {
    setIsFullscreen?.(!isFullscreen);
  };

  // 快退10秒
  const handleRewind = () => {
    const state = usePlayerStore.getState();
    if (state.status?.isLoaded && state.status.positionMillis) {
      const newPos = Math.max(0, state.status.positionMillis - 10000);
      const ratio = newPos / (state.status.durationMillis || 1);
      seekToPosition?.(ratio, false);
      seekToPosition?.(ratio, true);
    }
  };

  // 快进10秒
  const handleForward = () => {
    const state = usePlayerStore.getState();
    if (state.status?.isLoaded && state.status.positionMillis && state.status.durationMillis) {
      const newPos = Math.min(state.status.durationMillis, state.status.positionMillis + 10000);
      const ratio = newPos / state.status.durationMillis;
      seekToPosition?.(ratio, false);
      seekToPosition?.(ratio, true);
    }
  };

  return (
    <View style={styles.container}>
      {/* 快退 */}
      <TouchableOpacity
        style={styles.button}
        onPress={handleRewind}
        activeOpacity={0.7}
      >
        <Text style={styles.iconText}>⏪</Text>
        <Text style={styles.iconLabel}>10</Text>
      </TouchableOpacity>

      {/* 播放/暂停 */}
      <TouchableOpacity
        style={[styles.button, styles.playButton]}
        onPress={handleTogglePlayPause}
        activeOpacity={0.7}
      >
        <Text style={[styles.iconText, styles.playIcon]}>
          {isPlaying ? "⏸" : "▶️"}
        </Text>
      </TouchableOpacity>

      {/* 快进 */}
      <TouchableOpacity
        style={styles.button}
        onPress={handleForward}
        activeOpacity={0.7}
      >
        <Text style={styles.iconText}>⏩</Text>
        <Text style={styles.iconLabel}>10</Text>
      </TouchableOpacity>

      {/* 全屏切换 */}
      <TouchableOpacity
        style={styles.button}
        onPress={handleToggleFullscreen}
        activeOpacity={0.7}
      >
        <Text style={styles.iconText}>{isFullscreen ? "🔽" : "🔼"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    backdropFilter: Platform.OS === "web" ? "blur(10px)" : undefined, // 仅 web 支持，移动端可通过背景半透明模拟
    borderRadius: 50,
    paddingVertical: 8,
    paddingHorizontal: 12,
    // 阴影
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 64,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginHorizontal: 4,
  },
  playButton: {
    backgroundColor: "#00bb5e",
    minWidth: 80,
    shadowColor: "#00bb5e",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  iconText: {
    fontSize: 28,
    color: "#fff",
    textAlign: "center",
  },
  playIcon: {
    fontSize: 32,
  },
  iconLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
});