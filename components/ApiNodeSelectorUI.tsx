import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { useSettingsStore } from "@/stores/settingsStore";
import { API_NODES } from "@/services/apiNodes";
import { StyledButton } from "./StyledButton";
import { ThemedText } from "./ThemedText";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { Colors } from "@/constants/Colors";

export function ApiNodeSelectorUI({ onFocus }: { onFocus?: () => void }) {
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const nodeLatencies = useSettingsStore((s) => s.nodeLatencies || {});
  const setApiBaseUrl = useSettingsStore((s) => s.setApiBaseUrl);
  const autoSelectFastestApi = useSettingsStore((s) => s.autoSelectFastestApi);

  const { deviceType } = useResponsiveLayout();

  const getLatencyText = (url: string) => {
    const ms = nodeLatencies[url];
    if (ms === undefined) return "测速中...";
    if (ms === Infinity) return "超时";
    return `${ms}ms`;
  };

  return (
    <View style={styles.container}>
      <ThemedText style={styles.headerText}>选择服务器节点</ThemedText>

      <View style={styles.nodeList}>
        {API_NODES.map((node) => {
          const isSelected = apiBaseUrl === node.url;

          return (
            <StyledButton
              key={node.key}
              onPress={() => setApiBaseUrl(node.url)}
              onFocus={onFocus}
              isSelected={isSelected}
              text={`${node.label}（${getLatencyText(node.url)}）`}
              style={[
                styles.nodeButton,
                isSelected && styles.selectedNodeButton
              ]}
              textStyle={styles.nodeButtonText}
            />
          );
        })}
      </View>

      <View style={styles.speedTestContainer}>
        <StyledButton
          onPress={autoSelectFastestApi}
          onFocus={onFocus}
          style={styles.speedTestButton}
        >
          <ThemedText style={styles.speedTestButtonText}>重新测速并选择最快节点</ThemedText>
        </StyledButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 15,
  },
  headerText: {
    fontSize: 16,
    marginBottom: 12,
    fontWeight: 'bold',
  },
  nodeList: {
    width: '100%',
  },
  nodeButton: {
    backgroundColor: "#222",
    borderRadius: 8,
    marginBottom: 8,
    width: '100%',
    borderWidth: 0,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedNodeButton: {
    backgroundColor: Colors.dark.primary,
  },
  nodeButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "500",
  },
  speedTestContainer: {
    flexDirection: "row",
    marginTop: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  speedTestButton: {
    width: "90%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 8,
    paddingVertical: 12,
    ...(Platform.isTV && {
      borderWidth: 2,
      borderColor: "transparent",
    }),
  },
  speedTestButtonText: {
    color: "#ffffff",
    fontSize: Platform.isTV ? 16 : 14,
    fontWeight: "500",
    textAlign: 'center',
  },
});
