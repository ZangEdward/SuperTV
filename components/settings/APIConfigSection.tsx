import React, { useImperativeHandle, forwardRef } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ApiNodeSelectorUI } from "@/components/ApiNodeSelectorUI";
import { useSettingsStore } from "@/stores/settingsStore";

interface APIConfigSectionProps {
  onChanged: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onPress?: () => void;
  hideDescription?: boolean;
}

export interface APIConfigSectionRef {
  setInputValue: (value: string) => void;
}

export const APIConfigSection = forwardRef<APIConfigSectionRef, APIConfigSectionProps>(
  ({ onChanged, onFocus, onBlur, onPress, hideDescription = false }, ref) => {
    const { setApiBaseUrl } = useSettingsStore();

    useImperativeHandle(ref, () => ({
      setInputValue: (value: string) => {
        setApiBaseUrl(value);
        onChanged();
      },
    }));

    return (
      <SettingsSection
        focusable={false}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <View style={styles.container} onFocus={onFocus} onBlur={onBlur}>
          <ThemedText style={styles.title}>服务器节点</ThemedText>

          {!hideDescription && (
            <ThemedText style={styles.subtitle}>
              测速并自动选择最佳节点
            </ThemedText>
          )}

          {/* 节点列表展示 - 内部已经使用了 StyledButton，可直接遥控选择 */}
          <ApiNodeSelectorUI onFocus={onFocus} />
        </View>
      </SettingsSection>
    );
  }
);

APIConfigSection.displayName = "APIConfigSection";

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: Platform.isTV ? 22 : 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: Platform.isTV ? 16 : 14,
    color: "#888",
    marginBottom: 12,
  },
});
