import React from "react";
import { View, StyleSheet } from "react-native";
import { useSettingsStore } from "@/stores/settingsStore";
import { API_NODES } from "@/services/apiNodes";
import { StyledButton } from "./StyledButton";
import { ThemedText } from "./ThemedText";
import { Zap, Activity } from "lucide-react-native";
import { Colors } from "@/constants/Colors";

export function ApiNodeSelectorUI({ onFocus }: { onFocus?: () => void }) {
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const nodeLatencies = useSettingsStore((s) => s.nodeLatencies || {});
  const setApiBaseUrl = useSettingsStore((s) => s.setApiBaseUrl);
  const autoSelectFastestApi = useSettingsStore((s) => s.autoSelectFastestApi);

  const getLatencyText = (url: string) => {
    const ms = nodeLatencies[url];
    if (ms === undefined) return "测速中...";
    if (ms === Infinity) return "超时";
    return `${ms}ms`;
  };

  const getLatencyColor = (url: string) => {
    const ms = nodeLatencies[url];
    if (ms === undefined) return "#888";
    if (ms === Infinity) return "#ff4d4f";
    if (ms < 100) return "#52c41a";
    if (ms < 300) return "#faad14";
    return "#ff4d4f";
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Activity size={20} color={Colors.dark.primary} />
        <ThemedText style={styles.headerText}>选择服务器节点</ThemedText>
      </View>

      <View style={styles.nodeList}>
        {API_NODES.map((node) => {
          const isSelected = apiBaseUrl === node.url;
          const latencyColor = getLatencyColor(node.url);

          return (
            <StyledButton
              key={node.key}
              onPress={() => setApiBaseUrl(node.url)}
              onFocus={onFocus}
              isSelected={isSelected}
              style={[
                styles.nodeButton,
                isSelected && styles.selectedNode
              ]}
            >
              <View style={styles.nodeContent}>
                <ThemedText style={[styles.nodeLabel, isSelected && styles.selectedText]}>
                  {node.label}
                </ThemedText>
                <View style={[styles.latencyBadge, { backgroundColor: latencyColor + '20', borderColor: latencyColor }]}>
                  <ThemedText style={[styles.latencyText, { color: latencyColor }]}>
                    {getLatencyText(node.url)}
                  </ThemedText>
                </View>
              </View>
            </StyledButton>
          );
        })}
      </View>

      <StyledButton
        onPress={autoSelectFastestApi}
        onFocus={onFocus}
        variant="primary"
        style={styles.speedTestButton}
      >
        <View style={styles.speedTestContent}>
          <Zap size={18} color="#fff" fill="#fff" />
          <ThemedText style={styles.speedTestText}>重新测速并选择最快节点</ThemedText>
        </View>
      </StyledButton>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 15,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  headerText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  nodeList: {
    gap: 8,
  },
  nodeButton: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  selectedNode: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '15',
  },
  nodeContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 4,
  },
  nodeLabel: {
    fontSize: 15,
  },
  selectedText: {
    color: Colors.dark.primary,
    fontWeight: 'bold',
  },
  latencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  latencyText: {
    fontSize: 12,
    fontWeight: '600',
  },
  speedTestButton: {
    marginTop: 12,
    backgroundColor: Colors.dark.primary,
    height: 50,
    borderRadius: 25,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  speedTestContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  speedTestText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
