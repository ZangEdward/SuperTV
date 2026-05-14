import React, { useState, useImperativeHandle, forwardRef } from "react";
import { View, StyleSheet, Animated, Platform } from "react-native";
import { useTVEventHandler } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { SettingsSection } from "./SettingsSection";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRemoteControlStore } from "@/stores/remoteControlStore";
import { useButtonAnimation } from "@/hooks/useAnimation";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { ApiNodeSelectorUI } from "@/components/ApiNodeSelectorUI";

interface APIConfigSectionProps {
  onChanged: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onPress?: () => void; // ⭐ TV/手机按 OK → 执行测速
  hideDescription?: boolean;
}

export interface APIConfigSectionRef {
  setInputValue: (value: string) => void;
}

export const APIConfigSection = forwardRef<APIConfigSectionRef, APIConfigSectionProps>(
  ({ onChanged, onFocus, onBlur, onPress, hideDescription = false }, ref) => {
    const { apiBaseUrl, setApiBaseUrl } = useSettingsStore();
    const { remoteInputEnabled, serverUrl } = useRemoteControlStore();

    const [isSectionFocused, setIsSectionFocused] = useState(false);
    const deviceType = useResponsiveLayout().deviceType;
    const animationStyle = useButtonAnimation(isSectionFocused, 1.02);

    // 外部可设置 API 地址
    useImperativeHandle(ref, () => ({
      setInputValue: (value: string) => {
        setApiBaseUrl(value);
        onChanged();
      },
    }));

    const handleSectionFocus = () => {
      setIsSectionFocused(true);
      onFocus?.();
    };

    const handleSectionBlur = () => {
      setIsSectionFocused(false);
      onBlur?.();
    };

    // ⭐ TV 遥控器 OK → 执行测速
    const handleTVEvent = React.useCallback(
      (event: any) => {
        if (isSectionFocused && event.eventType === "select") {
          onPress?.();
        }
      },
      [isSectionFocused, onPress]
    );

    useTVEventHandler(handleTVEvent);

    // ⭐ 手机端点击
    const handlePress = () => {
      if (!Platform.isTV) {
        onPress?.();
      }
    };

    return (
      <SettingsSection
        focusable
        onFocus={handleSectionFocus}
        onBlur={handleSectionBlur}
        onPress={Platform.isTV ? undefined : handlePress} // ⭐ TV 禁用 onPress，避免冲突
      >
        <Animated.View style={[styles.container, animationStyle]}>
          <ThemedText style={styles.title}>服务器节点</ThemedText>

          {!hideDescription && (
            <ThemedText style={styles.subtitle}>
              测速并自动选择最佳节点
            </ThemedText>
          )}

          {/* ⭐ 节点列表 UI */}
          <ApiNodeSelectorUI />
        </Animated.View>
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
