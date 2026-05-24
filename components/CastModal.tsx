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

/** 请求 DLNA 搜索所需的权限 */
async function requestDlnaPermissions() {
  if (Platform.OS !== 'android') return true;

  try {
    const apiLevel = Platform.Version as number;
    const PERM_NEARBY = 'android.permission.NEARBY_WIFI_DEVICES';
    const PERM_LOCATION = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;

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

    if (apiLevel >= 29) {
      const granted = await PermissionsAndroid.request(PERM_LOCATION);
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    return true;
  } catch (err) {
    logger.warn('[Cast] Permission request error:', err);
    return false;
  }
}

/** file:// → http:// 转换 */
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
  const { showCastModal, setShowCastModal, episodes, currentEpisodeIndex, pause } = usePlayerStore();
  const [devices, setDevices] = useState<DLNADevice[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [castingDevice, setCastingDevice] = useState<DLNADevice | null>(null);
  const searchTimerRef = useRef<any>(null);

  /** 开始搜索 */
  const startSearch = useCallback(async () => {
    setDevices([]);
    dlnaService.receivedKeys.clear();
    dlnaService.clearDevices?.();

    const hasPermission = await requestDlnaPermissions();
    if (!hasPermission) {
      Toast.show({
        type: 'error',
        text1: '权限不足',
        text2: '请在系统设置中允许“附近的设备”权限以搜索电视',
      });
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setIsSearching(true);

    dlnaService.searchDevices((foundDevices) => {
      setDevices([...foundDevices]);
    });

    searchTimerRef.current = setTimeout(() => {
      setIsSearching(false);
      dlnaService.stopSearch();
    }, 15000);
  }, []);

  /** 弹窗打开时自动搜索 */
  useEffect(() => {
    if (showCastModal) {
      startSearch();
    }
    return () => {
      dlnaService.stopSearch();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [showCastModal, startSearch]);

  /** 自动重试投屏 */
  const tryCast = async (device: DLNADevice, url: string, title: string, retry = 0) => {
    try {
      await dlnaService.castVideo(device, url, title);

      setCastingDevice(device);
      // 1. 投屏成功后暂停手机端播放
      await pause();

      Toast.show({ type: 'success', text1: '投屏成功', text2: '正在电视上播放，手机端已暂停' });

    } catch (error) {
      if (retry < 2) {
        Toast.show({
          type: 'info',
          text1: '投屏失败，正在重试...',
          text2: `第 ${retry + 2} 次尝试`
        });

        setTimeout(() => tryCast(device, url, title, retry + 1), 1000);
      } else {
        Toast.show({
          type: 'error',
          text1: '投屏失败',
          text2: '请检查网络或电视是否支持 DLNA'
        });
      }
    }
  };

  /** 执行投屏 */
  const onCast = async (device: DLNADevice) => {
    const currentEpisode = episodes[currentEpisodeIndex];
    if (!currentEpisode) {
      Toast.show({ type: 'error', text1: '无可用视频', text2: '请确认已加载视频' });
      return;
    }

    const castUrl = convertToHttpUrl(currentEpisode.url);

    Toast.show({ type: 'info', text1: '正在投屏...', text2: `连接到 ${device.name}` });

    tryCast(device, castUrl, currentEpisode.title, 0);
  };

  /** 关闭弹窗 */
  const onClose = () => {
    dlnaService.stopSearch();
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setShowCastModal(false);
  };

  const handleStopCast = async () => {
    if (!castingDevice) return;

    try {
      // 2. 发送停止指令
      await dlnaService.stopCast(castingDevice);
      Toast.show({ type: 'success', text1: '已断开投屏', text2: '电视已停止播放' });
    } catch (e) {
      // 即使发送失败（可能是网络断开），也允许手机端恢复状态
      logger.warn('[Cast] stopCast command failed:', e);
      Toast.show({ type: 'info', text1: '已断开连接', text2: '无法通知电视停止，请手动关闭' });
    } finally {
      // 手机端恢复到重新搜索投屏的状态
      setCastingDevice(null);
      startSearch();
    }
  };

  return (
    <Modal visible={showCastModal} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>

          {/* 标题 + 刷新按钮 */}
          <View style={styles.header}>
            <Text style={styles.modalTitle}>选择投屏设备</Text>
            <TouchableOpacity onPress={startSearch} disabled={isSearching}>
              <RefreshCw size={20} color={isSearching ? "#666" : "white"} />
            </TouchableOpacity>
          </View>

          <Text style={styles.tipText}>
            请确认电视和手机在同一 WiFi 网络下，且电视已开启 DLNA/投屏功能
          </Text>

          {/* ⭐ 已投屏状态 */}
          {castingDevice && (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ color: '#0f0', marginBottom: 10 }}>
                当前已连接：{castingDevice.name}
              </Text>

              <StyledButton
                text="断开投屏"
                onPress={handleStopCast}
                style={{ backgroundColor: '#aa0000' }}
              />
            </View>
          )}

          {/* 搜索中 */}
          {isSearching && devices.length === 0 && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#00bb5e" />
              <Text style={styles.loadingText}>正在搜索设备...</Text>
            </View>
          )}

          {/* 搜索结束但无设备 */}
          {!isSearching && devices.length === 0 && !castingDevice && (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>未找到可用设备</Text>
              <StyledButton text="重新搜索" onPress={startSearch} style={{ marginTop: 20 }} />
            </View>
          )}

          {/* 设备列表 */}
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
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 20,
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
