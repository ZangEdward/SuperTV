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
          <View style={styles.headerRow}>
            <ThemedText style={styles.title}>服务器节点</ThemedText>
            <StyledButton
              text="优选"
              onPress={() => useSettingsStore.getState().autoSelectFastestApi()}
              style={styles.preferButton}
              textStyle={styles.preferButtonText}
              variant="ghost"
            />
          </View>

          {!hideDescription && (
            <ThemedText style={styles.subtitle}>
              手动切换或点击优选自动测速
            </ThemedText>
          )}

          {/* 节点列表展示 */}
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
});
