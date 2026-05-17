import { UPDATE_CONFIG } from "@/constants/UpdateConfig";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Platform, View, StyleSheet } from "react-native";
import Toast from "react-native-toast-message";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useSettingsStore } from "@/stores/settingsStore";
import { useRemoteControlStore } from "@/stores/remoteControlStore";
import LoginModal from "@/components/LoginModal";
import useAuthStore from "@/stores/authStore";
import { useUpdateStore, initUpdateStore } from "@/stores/updateStore";
import { UpdateModal } from "@/components/UpdateModal";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { Colors } from "@/constants/Colors";
import Logger from '@/utils/Logger';
import MobileTabContainer from "@/components/navigation/MobileTabContainer";

const logger = Logger.withTag('RootLayout');

// 自定义暗色主题，确保背景色一致
const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.dark.background,
    card: Colors.dark.background,
  },
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = "dark";
  const theme = colorScheme === "dark" ? CustomDarkTheme : DefaultTheme;

  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const { loadSettings, remoteInputEnabled, apiBaseUrl } = useSettingsStore();
  const { startServer, stopServer } = useRemoteControlStore();
  const { checkLoginStatus } = useAuthStore();
  const { checkForUpdate, lastCheckTime } = useUpdateStore();
  const responsiveConfig = useResponsiveLayout();

  useEffect(() => {
    const initializeApp = async () => {
      await loadSettings();
    };
    initializeApp();
    initUpdateStore(); // 初始化更新存储
  }, [loadSettings]);

  useEffect(() => {
    if (apiBaseUrl) {
      checkLoginStatus(apiBaseUrl);
    }
  }, [apiBaseUrl, checkLoginStatus]);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
      if (error) {
        logger.warn(`Error in loading fonts: ${error}`);
      }
    }
  }, [loaded, error]);

  // 检查更新
  useEffect(() => {
    if (loaded && UPDATE_CONFIG?.AUTO_CHECK && Platform.OS === 'android') {
      // 检查是否需要自动检查更新
      const shouldCheck = Date.now() - lastCheckTime > (UPDATE_CONFIG?.CHECK_INTERVAL || 0);
      if (shouldCheck) {
        checkForUpdate(true); // 静默检查
      }
    }
  }, [loaded, lastCheckTime, checkForUpdate]);

  useEffect(() => {
    // 只有在非手机端才启动远程控制服务器
    if (remoteInputEnabled && responsiveConfig.deviceType !== "mobile") {
      startServer();
    } else {
      stopServer();
    }
  }, [remoteInputEnabled, startServer, stopServer, responsiveConfig.deviceType]);

  if (!loaded && !error) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={theme}>
          <View style={[styles.container, { backgroundColor: Colors.dark.background }]}>
            <MobileTabContainer>
              <Stack screenOptions={({ route }) => {
                const params = route.params as any;
                const noAnim = params?.noAnim === 'true';
                const dir = params?.dir;

                let animation: any = 'slide_from_right';
                if (noAnim) {
                  animation = 'none';
                } else if (dir === 'back') {
                  animation = 'slide_from_left';
                }

                return {
                  headerShown: false,
                  contentStyle: { backgroundColor: Colors.dark.background },
                  animation: animation,
                  gestureEnabled: false,
                };
              }}>
                <Stack.Screen name="index" options={{ gestureEnabled: true }} />
                <Stack.Screen name="detail" />
                <Stack.Screen name="cache" />
                <Stack.Screen name="cache-management" />
                <Stack.Screen name="cache-detail" />
                {Platform.OS !== "web" && <Stack.Screen name="play" />}
                <Stack.Screen name="search" options={{ gestureEnabled: true }} />
                <Stack.Screen name="live" />
                <Stack.Screen name="settings" options={{ gestureEnabled: true }} />
                <Stack.Screen name="favorites" options={{ gestureEnabled: true }} />
                <Stack.Screen name="+not-found" />
              </Stack>
            </MobileTabContainer>
          </View>
          <Toast />
          <LoginModal />
          <UpdateModal />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
