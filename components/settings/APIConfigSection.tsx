import React, { useState, useImperativeHandle, forwardRef } from "react";
import { View, StyleSheet, Animated, Platform } from "react-native";
import { useTVEventHandler } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useSettingsStore } from "@/stores/settingsStore";
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
    const [isFocused, setIsFocused] = useState(false);
    const deviceType = useResponsiveLayout().deviceType;

    // 放大动画（和 UpdateSection 一样）
    const animationStyle = useButtonAnimation(isFocused, 1.02);

    // 外部可设置 API 地址
    useImperativeHandle(ref, () => ({
      setInputValue: (value: string) => {
        setApiBaseUrl(value);
        onChanged();
      },
    }));

    // ⭐ TV 遥控器 OK → 执行 onPress
    const handleTVEvent = React.useCallback(
      (event: any) => {
        if (deviceType !== "tv") return;

        if (isFocused && event.eventType === "select") {
          onPress?.();
        }
      },
      [isFocused, onPress, deviceType]
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
        onFocus={() => {
          setIsFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setIsFocused(false);
          onBlur?.();
        }}
        onPress={Platform.isTV ? undefined : handlePress} // ⭐ TV 禁用 onPress，避免冲突
      >
        <Animated.View style={[styles.container, animationStyle]}>
          <ThemedText style={styles.title}>服务器节点</ThemedText>

          {!hideDescription && (
            <ThemedText style={styles.subtitle}>
              测速并自动选择最佳节点
            </ThemedText>
          )}

          {/* ⭐ 节点列表 UI（展示用，不参与焦点） */}
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

