import React, { useImperativeHandle, forwardRef, useState } from "react";
import { View, StyleSheet, Platform, TextInput } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { StyledButton } from "@/components/StyledButton";
import { ApiNodeSelectorUI } from "@/components/ApiNodeSelectorUI";
import { useSettingsStore, __allowNodeTestOnce } from "@/stores/settingsStore";
import { HAS_PRESET_NODES } from "@/services/apiNodes";
import { Colors } from "@/constants/Colors";

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
    const { apiBaseUrl, setApiBaseUrl, autoSelectFastestApi } = useSettingsStore();
    const [isInputFocused, setIsInputFocused] = useState(false);

    useImperativeHandle(ref, () => ({
      setInputValue: (value: string) => {
        setApiBaseUrl(value);
        onChanged();
      },
    }));

    const handleOptimize = async () => {
      __allowNodeTestOnce(); // 解锁，允许本次测速
      await autoSelectFastestApi();
    };

    const handleInputChange = (text: string) => {
      setApiBaseUrl(text);
      onChanged();
    };

    return (
      <SettingsSection
        focusable={false}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <View style={styles.container} onFocus={onFocus} onBlur={onBlur}>
          <View style={styles.headerRow}>
            <ThemedText style={styles.title}>服务器配置</ThemedText>
            {HAS_PRESET_NODES && (
              <StyledButton
                onPress={handleOptimize}
                onFocus={onFocus}
                style={styles.preferButton}
              >
                <ThemedText style={styles.preferButtonText}>节点优选</ThemedText>
              </StyledButton>
            )}
          </View>

          {!hideDescription && (
            <ThemedText style={styles.subtitle}>
              {HAS_PRESET_NODES
                ? "手动切换服务器节点，点击【节点优选】自动测试并切换到最快节点"
                : "请在下方输入您的自定义服务器地址（需包含 http:// 或 https://）"}
            </ThemedText>
          )}

          {/* 如果没有预设变量，显示输入框 */}
          {!HAS_PRESET_NODES ? (
            <View style={[
              styles.inputWrapper,
              isInputFocused && { borderColor: Colors.dark.primary }
            ]}>
              <TextInput
                style={styles.input}
                value={apiBaseUrl}
                onChangeText={handleInputChange}
                onFocus={() => {
                  setIsInputFocused(true);
                  onFocus?.();
                }}
                onBlur={() => {
                  setIsInputFocused(false);
                  onBlur?.();
                }}
                placeholder="https://api.example.com"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
          ) : (
            /* 否则显示节点列表选择器 */
            <ApiNodeSelectorUI onFocus={onFocus} onSelect={onChanged} />
          )}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  title: {
    fontSize: Platform.isTV ? 22 : 18,
    fontWeight: "bold",
  },
  preferButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    minHeight: 32,
    backgroundColor: 'rgba(0, 187, 94, 0.1)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 187, 94, 0.3)',
  },
  preferButtonText: {
    fontSize: 13,
    color: '#00bb5e',
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: Platform.isTV ? 16 : 14,
    color: "#888",
    marginBottom: 12,
  },
  inputWrapper: {
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#333',
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 4,
  },
  input: {
    color: 'white',
    fontSize: 16,
    height: '100%',
  },
});
