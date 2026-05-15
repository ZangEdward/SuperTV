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
    marginTop: 10,
  },
  headerText: {
    fontSize: 16,
    marginBottom: 12,
    fontWeight: 'bold',
    color: '#ccc',
  },
  nodeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  nodeButton: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 6,
    width: Platform.isTV ? '32%' : '48%', // TV 3列，手机 2列
    marginBottom: 10,
    minHeight: 44,
    borderWidth: 0,
    paddingVertical: 4, // 减小内边距使按钮更小
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedNodeButton: {
    backgroundColor: Colors.dark.primary,
  },
  nodeButtonText: {
    color: "#ffffff",
    fontSize: 13, // 减小字体
    fontWeight: "500",
    textAlign: 'center',
  },
  speedTestContainer: {
    marginTop: 10,
    alignItems: "center",
  },
  speedTestButton: {
    width: Platform.isTV ? "60%" : "100%",
    backgroundColor: "rgba(0, 187, 94, 0.1)", // 淡淡的绿色背景
    borderRadius: 8,
    paddingVertical: 10,
  },
  speedTestButtonText: {
    color: "#00bb5e", // 显眼的绿色
    fontSize: 14,
    fontWeight: "bold",
    textAlign: 'center',
  },
});
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
    marginTop: 10,
  },
  headerText: {
    fontSize: 16,
    marginBottom: 12,
    fontWeight: 'bold',
    color: '#ccc',
  },
  nodeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  nodeButton: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 6,
    width: Platform.isTV ? '32%' : '48%', // TV 3列，手机 2列
    marginBottom: 10,
    minHeight: 44,
    borderWidth: 0,
    paddingVertical: 4, // 减小内边距使按钮更小
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedNodeButton: {
    backgroundColor: Colors.dark.primary,
  },
  nodeButtonText: {
    color: "#ffffff",
    fontSize: 13, // 减小字体
    fontWeight: "500",
    textAlign: 'center',
  },
  speedTestContainer: {
    marginTop: 10,
    alignItems: "center",
  },
  speedTestButton: {
    width: Platform.isTV ? "60%" : "100%",
    backgroundColor: "rgba(0, 187, 94, 0.1)", // 淡淡的绿色背景
    borderRadius: 8,
    paddingVertical: 10,
  },
  speedTestButtonText: {
    color: "#00bb5e", // 显眼的绿色
    fontSize: 14,
    fontWeight: "bold",
    textAlign: 'center',
  },
});
