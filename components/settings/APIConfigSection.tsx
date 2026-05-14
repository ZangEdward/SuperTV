import React, { useState, useRef, useImperativeHandle, forwardRef } from "react";
import { View, StyleSheet, Animated, Platform } from "react-native";
import { useTVEventHandler } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { SettingsSection } from "./SettingsSection";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRemoteControlStore } from "@/stores/remoteControlStore";
import { useButtonAnimation } from "@/hooks/useAnimation";
import { Colors } from "@/constants/Colors";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

// ⭐ 必须补上这个 import，否则闪退
import { ApiNodeSelectorUI } from "@/components/ApiNodeSelectorUI";

interface APIConfigSectionProps {
  onChanged: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onPress?: () => void; // ⭐ 这里会传入“测速并自动选择最佳节点”
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
    const inputAnimationStyle = useButtonAnimation(isSectionFocused, 1.01);
    const deviceType = useResponsiveLayout().deviceType;

    // 允许外部设置 API 地址
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

    // ⭐ TV 遥控器事件处理：按 OK 时触发“测速并自动选择最佳节点”
    const handleTVEvent = React.useCallback(
      (event: any) => {
        if (isSectionFocused && event.eventType === "select") {
          onPress?.(); // ⭐ TV 端按 OK → 执行节点测速 + 自动选择
        }
      },
      [isSectionFocused, onPress]
    );

    useTVEventHandler(handleTVEvent);

    // ⭐ 手机端点击：保持原来的行为
    const handlePress = () => {
      if (!Platform.isTV) {
        onPress?.(); // 手机点击 → 执行原来的逻辑
      }
    };

    return (
      <SettingsSection
        focusable
        onFocus={handleSectionFocus}
        onBlur={handleSectionBlur}
        onPress={Platform.isTV ? undefined : handlePress} // ⭐ TV 禁用 onPress，避免冲突
      >
        <View style={styles.inputContainer}>
          <View style={styles.titleContainer}>
            <ThemedText style={styles.sectionTitle}>API 地址</ThemedText>

            {/* ⭐ 修改后的提示文字 */}
            {!hideDescription && (
              <ThemedText style={styles.subtitle}>
                测速并自动选择最佳节点
              </ThemedText>
            )}
          </View>

          <Animated.View style={inputAnimationStyle}>
            {/* ⭐ TV 无法选中内部按钮，但 UI 保留 */}
            <ApiNodeSelectorUI />
          </Animated.View>
        </View>
      </SettingsSection>
    );
  }
);

APIConfigSection.displayName = "APIConfigSection";

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginRight: 12,
  },
  subtitle: {
    fontSize: 12,
    color: "#888",
    fontStyle: "italic",
  },
  inputContainer: {
    marginBottom: 12,
  },
});
