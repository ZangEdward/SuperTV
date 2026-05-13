import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSettingsStore } from "@/stores/settingsStore";
import { API_NODES } from "@/services/apiNodes"; // 你之前创建的节点列表

export function ApiNodeSelectorUI() {
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
      <Text style={{ color: "#fff", fontSize: 16, marginBottom: 8 }}>
        选择服务器节点
      </Text>

      {API_NODES.map((node) => {
        const isSelected = apiBaseUrl === node.url;

        return (
          <TouchableOpacity
            key={node.key}
            onPress={() => setApiBaseUrl(node.url)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderRadius: 8,
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: isSelected ? "#2ecc71" : "#222",
            }}
          >
            <Text style={{ color: "#fff" }}>
              {node.label}（{getLatencyText(node.url)}）
            </Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        onPress={autoSelectFastestApi}
        style={{
          marginTop: 12,
          paddingVertical: 10,
          borderRadius: 8,
          backgroundColor: "#444",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff" }}>重新测速并选择最快节点</Text>
      </TouchableOpacity>
    </View>
  );
}
