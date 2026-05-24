import React from "react";
import { View, StyleSheet, Text } from "react-native";
import usePlayerStore from "@/stores/playerStore";

const formatTime = (milliseconds: number) => {
  if (isNaN(milliseconds) || milliseconds < 0) {
    return "00:00";
  }
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

export const SeekingBar = () => {
  const { isSeeking, seekPosition, status } = usePlayerStore();

  if (!isSeeking || !status?.isLoaded) {
    return null;
  }

  const durationMillis = status.durationMillis || 0;
  const currentPositionMillis = seekPosition * durationMillis;

  return (
    <View style={styles.seekingContainer} pointerEvents="none">
      <Text style={styles.timeText}>
        {formatTime(currentPositionMillis)} / {formatTime(durationMillis)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  seekingContainer: {
    position: "absolute",
    top: '45%',
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 200,
  },
  timeText: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    backgroundColor: "rgba(21, 23, 24, 0.8)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
});
