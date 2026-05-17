import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { useSettingsStore } from "@/stores/settingsStore";
import { API_NODES } from "@/services/apiNodes";
import { StyledButton } from "./StyledButton";
import { ThemedText } from "./ThemedText";
import { Colors } from "@/constants/Colors";

export function ApiNodeSelectorUI({ onFocus }: { onFocus?: () => void }) {
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const nodeLatencies = useSettingsStore((s) => s.nodeLatencies || {});
  const setApiBaseUrl = useSettingsStore((s) => s.setApiBaseUrl);

  const getLatencyText = (url: string) => {
    const ms = nodeLatencies[url];
    if (ms === undefined) return "（测速中）";
    if (ms === Infinity) return "（超时）";
    return `（${ms}ms）`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.nodeGrid}>
        {API_NODES.map((node) => {
          const isSelected = apiBaseUrl === node.url;

          return (
            <StyledButton
              key={node.key}
              onPress={() => setApiBaseUrl(node.url)}
              onFocus={onFocus}
              isSelected={isSelected}
              style={[
                styles.nodeButton,
                isSelected && styles.selectedNodeButton
              ]}
            >
              <View style={styles.buttonContent}>
                <ThemedText style={styles.nodeLabel}>{node.label}</ThemedText>
                <ThemedText style={styles.latencyText}>{getLatencyText(node.url)}</ThemedText>
              </View>
            </StyledButton>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  nodeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  nodeButton: {
    width: '48%',
    marginBottom: 0,
    minHeight: 56,
    paddingVertical: 8,
  },
  selectedNodeButton: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  buttonContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeLabel: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: 'center',
  },
  latencyText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
});
