import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Switch, Platform, ActivityIndicator } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { StyledButton } from "@/components/StyledButton";
import { useSettingsStore } from "@/stores/settingsStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";
import { Colors } from "@/constants/Colors";

export default function SourceManagementScreen() {
  const {
    allSources,
    videoSource,
    sourceLatencies,
    isLoadingSources,
    fetchAllSources,
    testSourceSpeeds,
    toggleSource,
    saveSettings
  } = useSettingsStore();

  const [isTesting, setIsTesting] = useState(false);
  const { spacing } = useResponsiveLayout();

  useEffect(() => {
    fetchAllSources();
  }, [fetchAllSources]);

  const handlePrefer = async () => {
    setIsTesting(true);
    await testSourceSpeeds();
    setIsTesting(false);
  };

  const handleToggle = (key: string, value: boolean) => {
    toggleSource(key, value);
    saveSettings(); // Auto save when toggled
  };

  const getLatencyText = (key: string) => {
    const lat = sourceLatencies[key];
    if (lat === undefined) return "";
    if (lat === Infinity) return "（超时）";
    return `（${lat}ms）`;
  };

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader
        title="播放源管理"
        showBackButton
        rightElement={
          <StyledButton
            text={isTesting ? "优化中..." : "一键优化"}
            onPress={handlePrefer}
            disabled={isTesting}
            style={styles.preferButton}
            textStyle={styles.preferButtonText}
          />
        }
      />
      <ThemedView style={styles.container}>
        {isLoadingSources ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={[styles.list, { padding: spacing }]}>
            <View style={styles.grid}>
              {allSources.map((source) => (
                <View key={source.key} style={styles.sourceItem}>
                  <View style={styles.sourceInfo}>
                    <ThemedText style={styles.sourceName}>{source.name}</ThemedText>
                    <ThemedText style={styles.latencyText}>{getLatencyText(source.key)}</ThemedText>
                  </View>
                  <Switch
                    value={videoSource.enabledAll || !!videoSource.sources[source.key]}
                    onValueChange={(v) => handleToggle(source.key, v)}
                    trackColor={{ false: "#333", true: Colors.dark.primary }}
                    thumbColor={Platform.OS === 'ios' ? undefined : '#fff'}
                  />
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </ThemedView>
    </ResponsiveNavigation>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  preferButton: {
    minWidth: 60,
    height: 32,
    backgroundColor: 'rgba(0, 187, 94, 0.15)',
    paddingHorizontal: 12,
  },
  preferButtonText: {
    fontSize: 13,
    color: '#00bb5e',
    fontWeight: 'bold',
  },
  list: {
    paddingBottom: 40,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sourceItem: {
    width: Platform.OS === 'web' ? '23%' : '48%',
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#333',
  },
  sourceInfo: {
    flex: 1,
    marginRight: 8,
  },
  sourceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  latencyText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
});
