import React, { useState } from "react";
import { View, StyleSheet, Switch, Platform, Pressable } from "react-native";
import { ThemedText } from "../ThemedText";
import { SettingsSection } from "./SettingsSection";
import { useSettingsStore } from "@/stores/settingsStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import Colors from "@/constants/Colors";

/** TV端可独立聚焦的开关行 */
function FocusableRow({
  label,
  subtitle,
  value,
  onToggle,
}: {
  label: string;
  subtitle: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  const { deviceType } = useResponsiveLayout();
  const isTV = deviceType === 'tv';
  const [focused, setFocused] = useState(false);

  const content = (
    <View style={[styles.row, focused && styles.rowFocused]}>
      <View style={styles.info}>
        <ThemedText style={styles.label}>{label}</ThemedText>
        <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: "#333", true: Colors.dark.primary }}
        thumbColor={Platform.OS === 'ios' ? undefined : (value ? "#fff" : "#f4f3f4")}
      />
    </View>
  );

  if (!isTV) return content;

  return (
    <Pressable
      style={{ marginTop: 12 }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={() => onToggle(!value)}
    >
      {content}
    </Pressable>
  );
}

interface PlayerSettingsSectionProps {
  onChanged?: () => void;
  onFocus?: () => void;
}

export function PlayerSettingsSection({ onChanged, onFocus }: PlayerSettingsSectionProps) {
  const { adFilterEnabled, downloadAdFilterEnabled, setAdFilterEnabled, setDownloadAdFilterEnabled } = useSettingsStore();

  return (
    <SettingsSection onFocus={onFocus}>
      <View style={styles.container}>
        <ThemedText style={styles.title}>播放器设置</ThemedText>

        <FocusableRow
          label="M3U8 广告过滤"
          subtitle="自动识别并移除视频流中的广告片段。若设备 CPU 较低出现卡顿建议关闭。"
          value={adFilterEnabled}
          onToggle={(v) => { setAdFilterEnabled(v); onChanged?.(); }}
        />

        <FocusableRow
          label="下载时过滤广告"
          subtitle="在视频下载/缓存过程中尝试移除广告。由于较耗 CPU，默认关闭。"
          value={downloadAdFilterEnabled}
          onToggle={(v) => { setDownloadAdFilterEnabled(v); onChanged?.(); }}
        />
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
