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
    marginTop: 0,
  },
  headerText: {
    display: 'none', // 隐藏重复标题
  },
  nodeList: {
    flexDirection: 'column', // 改为单列，对标检查更新按钮
    width: '100%',
    alignItems: 'center',
  },
  nodeButton: {
    width: '90%', // 对标检查更新按钮的宽度
    marginBottom: 12,
  },
  selectedNodeButton: {
    backgroundColor: Colors.dark.primary,
  },
  nodeButtonText: {
    color: "#ffffff",
    fontSize: Platform.isTV ? 16 : 14, // 对标检查更新按钮的字号
    fontWeight: "500",
    textAlign: 'center',
  },
  speedTestContainer: {
    marginTop: 10,
    alignItems: "center",
    width: '100%',
  },
  speedTestButton: {
    width: "90%", // 对标检查更新按钮的宽度
  },
  speedTestButtonText: {
    color: "#00bb5e", // 显眼的绿色
    fontSize: Platform.isTV ? 16 : 14,
    fontWeight: "bold",
    textAlign: 'center',
  },
});
