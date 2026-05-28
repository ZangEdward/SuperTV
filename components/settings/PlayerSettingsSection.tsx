import React, { useCallback } from "react";
import { View, StyleSheet, Switch, Platform, Pressable } from "react-native";
import { ThemedText } from "../ThemedText";
import { useSettingsStore } from "@/stores/settingsStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import Colors from "@/constants/Colors";

interface PlayerSettingsSectionProps {
  onChanged?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onPress?: () => void;
}

export function PlayerSettingsSection({ onChanged, onFocus, onBlur, onPress }: PlayerSettingsSectionProps) {
  const { adFilterEnabled, setAdFilterEnabled } = useSettingsStore();
  const { deviceType } = useResponsiveLayout();
  const isTV = deviceType === 'tv';
  const [isFocused, setIsFocused] = React.useState(false);

  const handleToggle = useCallback((value: boolean) => {
    setAdFilterEnabled(value);
    onChanged?.();
  }, [setAdFilterEnabled, onChanged]);

  const handlePress = useCallback(() => {
    handleToggle(!adFilterEnabled);
  }, [adFilterEnabled, handleToggle]);

  const content = (
    <View style={[styles.container, isTV && isFocused && styles.containerFocused]}>
      <View style={styles.headerRow}>
        <View style={styles.info}>
          <ThemedText style={styles.title}>播放器设置</ThemedText>
          <ThemedText style={styles.subtitle}>M3U8 广告过滤：自动识别并移除视频流中的广告片段</ThemedText>
        </View>
        <Switch
          value={adFilterEnabled}
          onValueChange={handleToggle}
          trackColor={{ false: "#333", true: Colors.dark.primary }}
          thumbColor={Platform.OS === 'ios' ? undefined : (adFilterEnabled ? "#fff" : "#f4f3f4")}
        />
      </View>
    </View>
  );

  if (!isTV) {
    return (
      <View style={[styles.section, styles.sectionPadding]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.section, isFocused && styles.sectionFocused]}
      onFocus={() => { setIsFocused(true); onFocus?.(); }}
      onBlur={() => { setIsFocused(false); onBlur?.(); }}
      onPress={handlePress}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 16,
  },
  sectionPadding: {
    padding: 20,
  },
  sectionFocused: {
    borderColor: Colors.dark.primary,
  },
  container: {
    padding: 20,
    borderRadius: 12,
  },
  containerFocused: {
    backgroundColor: "#007AFF10",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  info: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: "#888",
  },
});
