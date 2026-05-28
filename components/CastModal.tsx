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

/** 请求 DLNA 搜索所需的权限，返回 'granted' | 'denied' | 'unavailable' */
async function requestDlnaPermissions(): Promise<'granted' | 'denied' | 'unavailable'> {
  if (Platform.OS !== 'android') return 'granted';

  try {
    const apiLevel = Platform.Version as number;
    const PERM_NEARBY = 'android.permission.NEARBY_WIFI_DEVICES';
    const PERM_LOCATION = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;

    if (apiLevel >= 33) {
      const granted = await PermissionsAndroid.requestMultiple([
        PERM_NEARBY as any,
        PERM_LOCATION,
      ]);
      const nearby = granted[PERM_NEARBY];
      const location = granted[PERM_LOCATION];
      if (nearby === PermissionsAndroid.RESULTS.GRANTED || location === PermissionsAndroid.RESULTS.GRANTED) {
        return 'granted';
      }
      // 用户点了"不再询问"则返回 denied，否则返回 denied 但可再次请求
      return nearby === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN || location === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
        ? 'denied' : 'denied';
    }

    if (apiLevel >= 29) {
      const granted = await PermissionsAndroid.request(PERM_LOCATION);
      return granted === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
    }

    return 'granted';
  } catch (err) {
    logger.warn('[Cast] Permission request error:', err);
    return 'unavailable';
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
  const { showCastModal, setShowCastModal, episodes, currentEpisodeIndex, pause, setCastingDevice, castingDevice, stopCast } = usePlayerStore();
  const [devices, setDevices] = useState<DLNADevice[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const searchTimerRef = useRef<any>(null);
  const mountedRef = useRef(false);

  /** 开始搜索 */
  const startSearch = useCallback(async () => {
    setDevices([]);
    setPermissionDenied(false);
    dlnaService.receivedKeys.clear();
    dlnaService.clearDevices?.();

    const hasPermission = await requestDlnaPermissions();
    if (hasPermission !== 'granted') {
      setPermissionDenied(true);
      setIsSearching(false);
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

      Toast.show({ type: 'success', text1: '投屏成功', text2: '正在电视上播放，您可以使用播放页进度条和按键控制电视' });

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
      await stopCast();
      Toast.show({ type: 'success', text1: '已断开投屏', text2: '电视已停止播放' });
    } catch (e) {
      // 即使发送失败（可能是网络断开），也允许手机端恢复状态
      logger.warn('[Cast] stopCast command failed:', e);
      Toast.show({ type: 'info', text1: '已断开连接', text2: '无法通知电视停止，请手动关闭' });
      setCastingDevice(null);
    } finally {
      startSearch();
    }
  };

  return (
    <Modal visible={showCastModal} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalContent}>

          {/* 标题行 + 刷新 */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>选择投屏设备</Text>
            <TouchableOpacity onPress={startSearch} disabled={isSearching} style={styles.refreshBtn}>
              <RefreshCw size={18} color={isSearching ? "#555" : "#00bb5e"} />
            </TouchableOpacity>
          </View>

          <Text style={styles.tipText}>请确保手机和电视在同一 WiFi 网络</Text>

          {/* 已连接状态 */}
          {castingDevice && (
            <View style={styles.connectedSection}>
              <View style={styles.connectedRow}>
                <Tv size={18} color="#00bb5e" />
                <Text style={styles.connectedText}>{castingDevice.name}</Text>
              </View>
              <TouchableOpacity style={styles.disconnectBtn} onPress={handleStopCast}>
                <Text style={styles.disconnectText}>断开连接</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 权限被拒 */}
          {permissionDenied && (
            <View style={styles.loadingContainer}>
              <Text style={styles.permissionDeniedText}>未授予附近设备权限</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={startSearch}>
                <Text style={styles.retryBtnText}>重新申请权限</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 搜索中 */}
          {!permissionDenied && isSearching && devices.length === 0 && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#00bb5e" />
              <Text style={styles.loadingText}>正在搜索设备...</Text>
            </View>
          )}

          {/* 无设备 */}
          {!permissionDenied && !isSearching && devices.length === 0 && !castingDevice && (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>未找到可用设备</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={startSearch}>
                <Text style={styles.retryBtnText}>重新搜索</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 设备列表 */}
          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.deviceList}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.deviceItem} onPress={() => onCast(item)}>
                <View style={styles.deviceIconWrap}>
                  <Tv color="#00bb5e" size={22} />
                </View>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>{item.name}</Text>
                  <Text style={styles.deviceHost}>{item.host}</Text>
                </View>
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    backgroundColor: "#1c1c1e",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
    maxHeight: "75%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
  refreshBtn: {
    padding: 6,
  },
  tipText: {
    color: "#666",
    fontSize: 12,
    marginBottom: 16,
  },
  connectedSection: {
    backgroundColor: "#0a2a0a",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  connectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  connectedText: {
    color: "#00bb5e",
    fontSize: 14,
    fontWeight: "600",
  },
  disconnectBtn: {
    backgroundColor: "#aa0000",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  disconnectText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  loadingText: {
    color: "#888",
    fontSize: 14,
    marginTop: 12,
  },
  permissionDeniedText: {
    color: "#ff6b6b",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 8,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: "#2a2a2a",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryBtnText: {
    color: "#00bb5e",
    fontSize: 14,
    fontWeight: "600",
  },
  deviceList: {
    paddingBottom: 8,
  },
  deviceItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  deviceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0a2a0a",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
  },
  deviceHost: {
    color: "#555",
    fontSize: 12,
    marginTop: 2,
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  cancelText: {
    color: "#888",
    fontSize: 14,
  },
});
