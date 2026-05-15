import React from "react";
import { View } from "react-native";
import { useSettingsStore } from "@/stores/settingsStore";
import { API_NODES } from "@/services/apiNodes";
import { StyledButton } from "./StyledButton";
import { ThemedText } from "./ThemedText";

export function ApiNodeSelectorUI({ onFocus }: { onFocus?: () => void }) {
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const nodeLatencies = useSettingsStore((s) => s.nodeLatencies || {});
  const setApiBaseUrl = useSettingsStore((s) => s.setApiBaseUrl);
  const autoSelectFastestApi = useSettingsStore((s) => s.autoSelectFastestApi);

  const getLatencyText = (url: string) => {
    const ms = nodeLatencies[url];
    if (ms === undefined) return "测速中...";
    if (ms === Infinity) return "超时";
    return `${ms} ms`;
  };

  return (
    <View style={{ marginTop: 10 }}>
      <ThemedText style={{ fontSize: 16, marginBottom: 8, fontWeight: 'bold' }}>
        选择服务器节点
      </ThemedText>

      {API_NODES.map((node) => {
        const isSelected = apiBaseUrl === node.url;

        return (
          <StyledButton
            key={node.key}
            onPress={() => setApiBaseUrl(node.url)}
            onFocus={onFocus}
            isSelected={isSelected}
            text={`${node.label} (${getLatencyText(node.url)})`}
            style={{ marginBottom: 8 }}
            textStyle={{ fontSize: 14 }}
          />
        );
      })}

      <StyledButton
        onPress={autoSelectFastestApi}
        onFocus={onFocus}
        text="重新测速并选择最快节点"
        variant="primary"
        style={{ marginTop: 12 }}
      />
    </View>
  );
}
