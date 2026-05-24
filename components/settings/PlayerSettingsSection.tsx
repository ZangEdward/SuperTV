import React from "react";
import { View, StyleSheet, Switch, Platform } from "react-native";
import { ThemedText } from "../ThemedText";
import { SettingsSection } from "./SettingsSection";
import { useSettingsStore } from "@/stores/settingsStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import Colors from "@/constants/Colors";

interface PlayerSettingsSectionProps {
  onChanged?: () => void;
  onFocus?: () => void;
}

export function PlayerSettingsSection({ onChanged, onFocus }: PlayerSettingsSectionProps) {
  const { adFilterEnabled, downloadAdFilterEnabled, setAdFilterEnabled, setDownloadAdFilterEnabled } = useSettingsStore();
  const { deviceType } = useResponsiveLayout();
  const isTV = deviceType === 'tv';

  const toggleAdFilter = (value: boolean) => {
    setAdFilterEnabled(value);
    onChanged?.();
  };

  const toggleDownloadAdFilter = (value: boolean) => {
    setDownloadAdFilterEnabled(value);
    onChanged?.();
  };

  return (
    <SettingsSection focusable={isTV} onFocus={onFocus}>
      <View style={styles.container}>
        <ThemedText style={styles.title}>播放器设置</ThemedText>

        <View style={styles.row}>
          <View style={styles.info}>
            <ThemedText style={styles.label}>M3U8 广告过滤</ThemedText>
            <ThemedText style={styles.subtitle}>自动识别并移除视频流中的广告片段。若设备 CPU 较低出现卡顿建议关闭。</ThemedText>
          </View>
          <Switch
            value={adFilterEnabled}
            onValueChange={toggleAdFilter}
            trackColor={{ false: "#333", true: Colors.dark.primary }}
            thumbColor={Platform.OS === 'ios' ? undefined : (adFilterEnabled ? "#fff" : "#f4f3f4")}
          />
        </View>

        <View style={[styles.row, { marginTop: 12 }]}>
          <View style={styles.info}>
            <ThemedText style={styles.label}>下载时过滤广告</ThemedText>
            <ThemedText style={styles.subtitle}>在视频下载/缓存过程中尝试移除广告。由于较耗 CPU，默认关闭。</ThemedText>
          </View>
          <Switch
            value={downloadAdFilterEnabled}
            onValueChange={toggleDownloadAdFilter}
            trackColor={{ false: "#333", true: Colors.dark.primary }}
            thumbColor={Platform.OS === 'ios' ? undefined : (downloadAdFilterEnabled ? "#fff" : "#f4f3f4")}
          />
        </View>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    color: 'white',
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    borderRadius: 8,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
  },
  subtitle: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
  },
});
