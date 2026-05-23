import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Modal, FlatList, ActivityIndicator, TouchableOpacity, PermissionsAndroid, Platform } from "react-native";
import { StyledButton } from "./StyledButton";
import usePlayerStore from "@/stores/playerStore";
import { dlnaService, DLNADevice } from "@/services/dlnaService";
import { tcpHttpServer } from "@/services/tcpHttpServer";
import { Tv, RefreshCw } from "lucide-react-native";
import Toast from "react-native-toast-message";
import Logger from '@/utils/Logger';

const logger = Logger.withTag('CastModal');

/**
 * 请求 DLNA 搜索所需的权限
 */
async function requestDlnaPermissions() {
  if (Platform.OS !== 'android') return true;

  try {
    const apiLevel = Platform.Version as number;

    // 定义权限常量字符串（防止常量未定义导致崩溃）
    const PERM_NEARBY = 'android.permission.NEARBY_WIFI_DEVICES';
    const PERM_LOCATION = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;

    // Android 13+ (API 33+)：必须授权“附近的设备”
    if (apiLevel >= 33) {
      const granted = await PermissionsAndroid.requestMultiple([
        PERM_NEARBY as any,
        PERM_LOCATION,
      ]);

      return (
        granted[PERM_NEARBY] === PermissionsAndroid.RESULTS.GRANTED ||
        granted[PERM_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
      );
    }

    // Android 10-12 (API 29-32)：依赖定位权限进行 WiFi 扫描
    if (apiLevel >= 29) {
      const granted = await PermissionsAndroid.request(
        PERM_LOCATION,
        {
          title: '需要定位权限',
          message: '搜索附近的投屏设备需要定位权限以扫描局域网',
          buttonNeutral: '稍后',
          buttonNegative: '拒绝',
          buttonPositive: '确定',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    // Android 9 及以下：Manifest 声明即可
    return true;
  } catch (err) {
    logger.warn('[Cast] Permission request error:', err);
    return false;
  }
}

/**
 * 将可能的本地 file:// 地址转为 HTTP 可访问地址
 * 缓存文件需要以 HTTP 方式提供给 DLNA 设备
 */
function convertToHttpUrl(url: string): string {
  if (url.startsWith('file://')) {
    const httpUrl = tcpHttpServer.getLocalUrl(url);
    if (httpUrl) {
      logger.info('[Cast] Converted file:// URL to HTTP: ' + httpUrl);
      return httpUrl;
    }
  }
  return url;
}

export const CastModal: React.FC = () => {
  const { showCastModal, setShowCastModal, episodes, currentEpisodeIndex, status } = usePlayerStore();
  const [devices, setDevices] = useState<DLNADevice[]>(() => dlnaService.getDevices());
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<any>(null);

  const startSearch = useCallback(async () => {
    const hasPermission = await requestDlnaPermissions();
    if (!hasPermission) {
      Toast.show({
        type: 'error',
        text1: '权限不足',
        text2: '搜索投屏设备需要附近的设备或定位权限',
      });
      return;
    }

    // 显示之前缓存过的设备（如果有）
    const cachedDevices = dlnaService.getDevices();
    if (cachedDevices.length > 0) {
      setDevices(cachedDevices);
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setIsSearching(true);

    dlnaService.searchDevices((foundDevices) => {
      setDevices(foundDevices);
      setIsSearching(false);
    });

    // 15 秒超时保护
    searchTimerRef.current = setTimeout(() => {
      setIsSearching(false);
    }, 15000);
  }, []);

  useEffect(() => {
    if (showCastModal) {
      startSearch();
    }
    return () => {
      dlnaService.stopSearch();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [showCastModal, startSearch]);

  const onCast = async (device: DLNADevice) => {
    const currentEpisode = episodes[currentEpisodeIndex];
    if (!currentEpisode) {
      Toast.show({ type: 'error', text1: '无可用视频', text2: '请确认已加载视频' });
      return;
    }

    // 如果 URL 是本地缓存文件（file://），转为 HTTP 地址
    const castUrl = convertToHttpUrl(currentEpisode.url);

    try {
      Toast.show({ type: 'info', text1: '正在投屏...', text2: `连接到 ${device.name}` });
      await dlnaService.castVideo(device, castUrl, currentEpisode.title);
      Toast.show({ type: 'success', text1: '投屏成功', text2: '请在电视上查看' });
      setShowCastModal(false);
    } catch (error: any) {
      logger.warn('[Cast] Failed:', error);
      Toast.show({
        type: 'error',
        text1: '投屏失败',
        text2: error.message || '请检查网络连接并确认电视支持 DLNA'
      });
    }
  };

  const onClose = () => {
    dlnaService.stopSearch();
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setShowCastModal(false);
  };

  return (
    <Modal visible={showCastModal} transparent={true} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.modalTitle}>选择投屏设备</Text>
            <TouchableOpacity onPress={startSearch} disabled={isSearching}>
              <RefreshCw size={20} color={isSearching ? "#666" : "white"} />
            </TouchableOpacity>
          </View>

          <Text style={styles.tipText}>
            请确认电视和手机在同一WiFi网络下，且电视已开启DLNA/投屏功能
          </Text>

          {isSearching && devices.length === 0 && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#00bb5e" />
              <Text style={styles.loadingText}>正在搜索设备...</Text>
            </View>
          )}

          {!isSearching && devices.length === 0 && (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>未找到可用设备</Text>
              <StyledButton text="重新搜索" onPress={startSearch} style={{ marginTop: 20 }} />
            </View>
          )}

          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.deviceItem} onPress={() => onCast(item)}>
                <Tv color="#00bb5e" size={24} />
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{item.name}</Text>
                  <Text style={styles.deviceHost}>{item.host}</Text>
                </View>
              </TouchableOpacity>
            )}
          />

          <StyledButton text="取消" onPress={onClose} variant="ghost" style={styles.closeButton} />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  modalContent: {
    width: "30%",
    minWidth: 300,
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    padding: 20,
    borderLeftWidth: 1,
    borderLeftColor: "#333",
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  tipText: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 15,
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#888",
    marginTop: 10,
  },
  deviceItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  deviceInfo: {
    marginLeft: 15,
  },
  deviceName: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
  },
  deviceHost: {
    color: "#666",
    fontSize: 12,
  },
  closeButton: {
    marginTop: 10,
  },
});