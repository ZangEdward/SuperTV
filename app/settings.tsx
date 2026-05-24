import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, Alert, Platform } from "react-native";
import { useTVEventHandler } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "../components/ThemedText";
import { ThemedView } from "../components/ThemedView";
import { StyledButton } from "../components/StyledButton";
import { useThemeColor } from "../hooks/useThemeColor";
import { useSettingsStore } from "../stores/settingsStore";
import { useRemoteControlStore } from "../stores/remoteControlStore";
import { APIConfigSection } from "../components/settings/APIConfigSection";
import { LiveStreamSection } from "../components/settings/LiveStreamSection";
import { RemoteInputSection } from "../components/settings/RemoteInputSection";
import { UpdateSection } from "../components/settings/UpdateSection";
import { CacheSection } from "../components/settings/CacheSection";
import { SettingsSection } from "../components/settings/SettingsSection";
import Toast from "react-native-toast-message";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "../utils/ResponsiveStyles";
import ResponsiveNavigation from "../components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "../components/navigation/ResponsiveHeader";
import { DeviceUtils } from "../utils/DeviceUtils";
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

type SectionItem = {
  component: React.ReactElement;
  key: string;
};

function isSectionItem(
  item: false | undefined | SectionItem
): item is SectionItem {
  return !!item;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { loadSettings, saveSettings, setApiBaseUrl, setM3uUrl } = useSettingsStore();
  const { lastMessage, targetPage, clearMessage } = useRemoteControlStore();
  const backgroundColor = useThemeColor({}, "background");
  const insets = useSafeAreaInsets();

  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSection, setCurrentSection] = useState<string | null>(null);

  const saveButtonRef = useRef<any>(null);
  const apiSectionRef = useRef<any>(null);
  const liveStreamSectionRef = useRef<any>(null);

  // 设置页只读取已有状态，不重复加载全部设置
  // _layout.tsx 已在应用启动时统一调用 loadSettings()
  // 避免因 useEffect 重执行导致 store 状态被覆盖（引发节点/线路不必要切换）
  useEffect(() => {
    if (!useSettingsStore.getState().apiBaseUrl) {
      loadSettings();
    }
  }, [loadSettings]);

  useEffect(() => {
    if (lastMessage && !targetPage) {
      const realMessage = lastMessage.split("_")[0];
      handleRemoteInput(realMessage);
      clearMessage();
      markAsChanged();
    }
  }, [lastMessage, targetPage, clearMessage, markAsChanged]);

  const handleRemoteInput = (message: string) => {
    if (currentSection === "api" && apiSectionRef.current) {
      setApiBaseUrl(message);
    } else if (currentSection === "livestream" && liveStreamSectionRef.current) {
      setM3uUrl(message);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await saveSettings();
      setHasChanges(false);
      Toast.show({
        type: "success",
        text1: "保存成功",
      });
    } catch {
      Alert.alert("错误", "保存设置失败");
    } finally {
      setIsLoading(false);
    }
  };

  const markAsChanged = () => {
    setHasChanges(true);
  };

  const rawSections = [
    deviceType !== "mobile" && {
      component: (
        <RemoteInputSection
          onChanged={markAsChanged}
          onFocus={() => {
            setCurrentSection("remote");
          }}
        />
      ),
      key: "remote",
    },
    deviceType === "mobile" && {
      component: <CacheSection />,
      key: "cache",
    },
    {
      component: (
        <APIConfigSection
          ref={apiSectionRef}
          onChanged={markAsChanged}
          hideDescription={deviceType === "mobile"}
          onFocus={() => {
            setCurrentSection("api");
          }}
        />
      ),
      key: "api",
    },
    deviceType !== "mobile" && {
      component: (
        <LiveStreamSection
          ref={liveStreamSectionRef}
          onChanged={markAsChanged}
          onFocus={() => {
            setCurrentSection("livestream");
          }}
        />
      ),
      key: "livestream",
    },
    deviceType !== "tv" && {
      component: (
        <SettingsSection
          focusable={true}
          onPress={() => router.push("/netdisk-search")}
        >
          <View style={{ padding: 16 }}>
            <ThemedText style={{ fontSize: 18, fontWeight: 'bold' }}>盘搜</ThemedText>
            <ThemedText style={{ fontSize: 14, color: '#888', marginTop: 4 }}>
              搜索全网网盘资源（夸克、磁力、百度）
            </ThemedText>
          </View>
        </SettingsSection>
      ),
      key: "netdisk_search",
    },
    Platform.OS === "android" && {
      component: <UpdateSection />,
      key: "update",
    },
  ] as const;

  const sections: SectionItem[] = rawSections.filter(isSectionItem);

 const handleTVEvent = React.useCallback(
  (event: any) => {
    if (deviceType !== "tv") return;
  },
  [deviceType]
);

  const safeUseTVEventHandler = typeof useTVEventHandler === 'function' ? useTVEventHandler : () => {};
  safeUseTVEventHandler(deviceType === "tv" ? handleTVEvent : () => { });

  const dynamicStyles = createResponsiveStyles(deviceType, spacing, insets);

  const renderSettingsContent = () => (
    <KeyboardAwareScrollView
      enableOnAndroid={true}
      extraScrollHeight={20}
      keyboardOpeningTime={0}
      keyboardShouldPersistTaps="always"
      scrollEnabled={true}
      style={{ flex: 1, backgroundColor }}
      removeClippedSubviews={false}
    >
      <ThemedView style={[commonStyles.container, dynamicStyles.container]}>
        {deviceType === "tv" && (
          <View style={dynamicStyles.header}>
            <ThemedText style={dynamicStyles.title}>设置</ThemedText>
          </View>
        )}

        <View style={dynamicStyles.scrollView}>
          {sections.map(item =>
            React.cloneElement(item.component, {
              key: item.key,
              style: [
                (item.component.props as any).style,
                dynamicStyles.itemWrapper,
              ],
            })
          )}
        </View>

        <View style={dynamicStyles.footer}>
          <StyledButton
            ref={saveButtonRef}
            text={isLoading ? "保存中..." : "保存设置"}
            onPress={handleSave}
            variant="primary"
            disabled={!hasChanges || isLoading}
            style={[dynamicStyles.saveButton, (!hasChanges || isLoading) && dynamicStyles.disabledButton]}
          />
        </View>
      </ThemedView>
    </KeyboardAwareScrollView>
  );

  if (deviceType === "tv") {
    return renderSettingsContent();
  }

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="设置" showBackButton={false} />
      {renderSettingsContent()}
    </ResponsiveNavigation>
  );
}

const createResponsiveStyles = (deviceType: string, spacing: number, insets: any) => {
  const isMobile = deviceType === "mobile";
  const isTablet = deviceType === "tablet";
  const isTV = deviceType === "tv";
  const minTouchTarget = DeviceUtils.getMinTouchTargetSize();

  return StyleSheet.create({
    container: {
      flex: 1,
      padding: spacing,
      paddingTop: isTV ? spacing * 2 : isMobile ? insets.top + spacing : insets.top + spacing * 1.5,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing,
    },
    title: {
      fontSize: isMobile ? 24 : isTablet ? 28 : 32,
      fontWeight: "bold",
      paddingTop: spacing,
      color: "white",
    },
    scrollView: {
      flex: 1,
    },
    footer: {
      paddingTop: spacing,
      alignItems: isMobile ? "center" : "flex-end",
    },
    saveButton: {
      minHeight: isMobile ? minTouchTarget : isTablet ? 50 : 50,
      width: isMobile ? "100%" : isTablet ? 140 : 120,
      maxWidth: isMobile ? 280 : undefined,
    },
    disabledButton: {
      opacity: 0.5,
    },
    itemWrapper: {
      marginBottom: spacing,
    },
  });
};
