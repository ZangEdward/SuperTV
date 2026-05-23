import { UPDATE_CONFIG } from "../constants/UpdateConfig";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from "react";
import { Platform, View, StyleSheet, useColorScheme } from "react-native";
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
import { NativeModules } from 'react-native'; // 引入原生模块

const logger = Logger.withTag('RootLayout');
const { MulticastModule } = NativeModules;

// 安全兜底颜色常量 —— 当 Colors 模块加载失败或未定义时使用
const SAFE_COLORS = {
  dark: { background: '#151718', text: '#fff', border: '#333', primary: '#00bb5e' },
  light: { background: '#fff', text: '#11181C', border: '#E5E5E5', primary: '#00bb5e' },
};

/** 安全获取颜色值，避免因 Colors 未加载而崩溃 */
function getSafeColor(path: 'dark' | 'light', key: keyof typeof SAFE_COLORS.dark): string {
  try {
    if (Colors && typeof Colors === 'object' && Colors[path] && typeof Colors[path] === 'object') {
      const val = (Colors[path] as Record<string, any>)?.[key];
      if (typeof val === 'string') return val;
    }
  } catch (_) {
    // 忽略任何访问错误
  }
  return SAFE_COLORS[path][key];
}

// 预计算常用颜色
const DARK_BG = getSafeColor('dark', 'background');
const DARK_TEXT = getSafeColor('dark', 'text');
const DARK_BORDER = getSafeColor('dark', 'border');
const DARK_PRIMARY = getSafeColor('dark', 'primary');

// 自定义暗色主题，确保背景色一致
const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: DARK_BG,
    card: DARK_BG,
    text: DARK_TEXT,
    border: DARK_BORDER,
    primary: DARK_PRIMARY,
  },
};

// 将 Toast 注册到全局对象 —— 修复 ReferenceError: Property 'Toast' doesn't exist
(globalThis as any).Toast = Toast;

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = (colorScheme === "dark" ? CustomDarkTheme : DefaultTheme) ?? DefaultTheme;

  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const { loadSettings, remoteInputEnabled, apiBaseUrl } = useSettingsStore();
  const { startServer, stopServer } = useRemoteControlStore();
  const { checkLoginStatus } = useAuthStore();
  const { checkForUpdate, lastCheckTime } = useUpdateStore();
  const responsiveConfig = useResponsiveLayout();
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function setupSystemUI() {
      try {
        // 设置原生系统的背景颜色为黑色，消除白屏闪烁
        await SystemUI.setBackgroundColorAsync(DARK_BG);
      } catch (e) {
        // 忽略错误
      }
    }
    setupSystemUI();
  }, []);

  useEffect(() => {
    async function lockOrientation() {
      if (responsiveConfig.deviceType === 'mobile') {
        // 移动端跟随系统传感器旋转
        await ScreenOrientation.unlockAsync();
      } else {
        // TV 和平板锁定横屏
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      }
    }
    lockOrientation();
  }, [responsiveConfig.deviceType]);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await loadSettings();
        // 关键：App 启动即开启组播锁
        if (Platform.OS === 'android' && MulticastModule) {
          MulticastModule.acquire();
          logger.info('[Multicast] Lock acquired at startup');
        }
      } catch (e) {
        logger.error('Failed to load settings', e);
      } finally {
        setAppIsReady(true);
      }
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
    // 只有当字体加载完成且初始化设置（如 apiBaseUrl 加载）完成后才关闭开屏
    if (loaded && appIsReady) {
      // 稍微延迟 100ms 确保 React 已经完成了第一帧渲染
      setTimeout(() => {
        SplashScreen.hideAsync();
      }, 100);
    } else if (error) {
      SplashScreen.hideAsync();
      logger.warn(`Error in loading fonts: ${error}`);
    }
  }, [loaded, error, appIsReady]);

  // 检查更新
  useEffect(() => {
    const config = UPDATE_CONFIG;
    if (loaded && config && config.AUTO_CHECK && Platform.OS === 'android') {
      // 检查是否需要自动检查更新
      const shouldCheck = Date.now() - lastCheckTime > (config.CHECK_INTERVAL || 0);
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
    return <View style={{ flex: 1, backgroundColor: DARK_BG }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={theme}>
          <View style={[styles.container, { backgroundColor: DARK_BG }]}>
            <MobileTabContainer>
              <Stack screenOptions={({ route }) => {
                const params = route.params as any;
                const noAnim = params?.noAnim === 'true';
                const isMobile = responsiveConfig.deviceType === 'mobile';

                let animation: any = 'fade';
                if (noAnim && !isMobile) {
                  animation = 'none';
                }

                return {
                  headerShown: false,
                  contentStyle: { backgroundColor: DARK_BG },
                  animation: animation,
                  animationDuration: isMobile ? 300 : 200,
                  gestureEnabled: isMobile,
                  fullScreenGestureEnabled: isMobile,
                };
              }}>
                <Stack.Screen name="index" options={{ gestureEnabled: false }} />
                <Stack.Screen name="detail" />
                <Stack.Screen name="cache" />
                <Stack.Screen name="cache-management" />
                <Stack.Screen name="cache-detail" />
                {Platform.OS !== "web" && <Stack.Screen name="play" />}
                <Stack.Screen name="search" options={{ gestureEnabled: false }} />
                <Stack.Screen name="live" />
                <Stack.Screen name="settings" options={{ gestureEnabled: false }} />
                <Stack.Screen name="favorites" options={{ gestureEnabled: false }} />
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
