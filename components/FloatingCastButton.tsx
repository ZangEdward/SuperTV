import React from "react";
import { TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Cast } from "lucide-react-native";
import usePlayerStore from "@/stores/playerStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * 投屏悬浮按钮：投屏中时显示，点击跳转投屏控制页
 */
export default function FloatingCastButton() {
  const isCasting = usePlayerStore((s) => s.isCasting);
  const castingDevice = usePlayerStore((s) => s.castingDevice);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (!isCasting || !castingDevice) return null;

  return (
    <TouchableOpacity
      style={[styles.floatingBtn, { bottom: insets.bottom + 80 }]}
      activeOpacity={0.7}
      onPress={() => router.push("/cast-control")}
    >
      <Cast size={20} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  floatingBtn: {
    position: "absolute",
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#00bb5e",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});
