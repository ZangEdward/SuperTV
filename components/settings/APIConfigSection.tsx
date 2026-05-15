import React, { useState, useImperativeHandle, forwardRef, useRef, useEffect } from "react";
import { View, StyleSheet, Animated, Platform } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { StyledButton } from "@/components/StyledButton";
import { ApiNodeSelectorUI } from "@/components/ApiNodeSelectorUI";
import { useSettingsStore } from "@/stores/settingsStore";
import { useButtonAnimation } from "@/hooks/useAnimation";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

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

    const animationStyle = useButtonAnimation(isFocused, 1.02);

    // ⭐ 按钮引用（TV 自动聚焦用）
    const speedTestButtonRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      setInputValue: (value: string) => {
        setApiBaseUrl(value);
        onChanged();
      },
    }));

    // ⭐⭐⭐ TV 自动聚焦测速按钮（和 UpdateSection 一样）
    useEffect(() => {
      if (Platform.isTV && isFocused) {
        setTimeout(() => {
          speedTestButtonRef.current?.focus();
        }, 100);
      }
    }, [isFocused]);

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
      >
        <Animated.View style={[styles.container, animationStyle]}>
          <ThemedText style={styles.title}>服务器节点</ThemedText>

          {!hideDescription && (
            <ThemedText style={styles.subtitle}>
              测速并自动选择最佳节点
            </ThemedText>
          )}

          {/* 节点列表展示 */}
          <ApiNodeSelectorUI />

          {/* ⭐ 关键：像 UpdateSection 一样的按钮（TV 焦点落在这里） */}
          <StyledButton
            ref={speedTestButtonRef}
            text="测速并选择最佳节点"
            onPress={onPress}
            hasTVPreferredFocus={false}
            style={styles.button}
          />
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
  button: {
    marginTop: 16,
    width: "100%",
  },
});
