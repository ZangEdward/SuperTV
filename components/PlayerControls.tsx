import React from "react";
import { StyleSheet, View, Text, TouchableOpacity } from "react-native";
import usePlayerStore from "@/stores/playerStore";

interface PlayerControlsProps {
  showControls: boolean;
  setShowControls: (show: boolean) => void;
}

export default function PlayerControls({ showControls, setShowControls }: PlayerControlsProps) {
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

  return (
    <View style={styles.container}>
      {/* 播放/暂停按钮 */}
      <TouchableOpacity style={styles.button} onPress={handleTogglePlayPause}>
        <Text style={styles.icon}>{isPlaying ? "⏸" : "▶️"}</Text>
      </TouchableOpacity>

      {/* 快退按钮 */}
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          const state = usePlayerStore.getState();
          if (state.status?.isLoaded && state.status.positionMillis) {
            const newPos = Math.max(0, state.status.positionMillis - 10000);
            const ratio = newPos / (state.status.durationMillis || 1);
            seekToPosition?.(ratio, false);
            seekToPosition?.(ratio, true);
          }
        }}
      >
        <Text style={styles.icon}>⏪</Text>
      </TouchableOpacity>

      {/* 快进按钮 */}
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          const state = usePlayerStore.getState();
          if (state.status?.isLoaded && state.status.positionMillis && state.status.durationMillis) {
            const newPos = Math.min(state.status.durationMillis, state.status.positionMillis + 10000);
            const ratio = newPos / state.status.durationMillis;
            seekToPosition?.(ratio, false);
            seekToPosition?.(ratio, true);
          }
        }}
      >
        <Text style={styles.icon}>⏩</Text>
      </TouchableOpacity>

      {/* 全屏切换 */}
      <TouchableOpacity style={styles.button} onPress={handleToggleFullscreen}>
        <Text style={styles.icon}>{isFullscreen ? "🔽" : "🔼"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    marginHorizontal: 40,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  icon: {
    fontSize: 24,
    color: "white",
  },
});