import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Modal, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";
import { StyledButton } from "./StyledButton";
import usePlayerStore from "@/stores/playerStore";
import { dlnaService, DLNADevice } from "@/services/dlnaService";
import { Tv, RefreshCw } from "lucide-react-native";
import Toast from "react-native-toast-message";

export const CastModal: React.FC = () => {
  const { showCastModal, setShowCastModal, episodes, currentEpisodeIndex, status } = usePlayerStore();
  const [devices, setDevices] = useState<DLNADevice[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const startSearch = () => {
    setIsSearching(true);
    dlnaService.searchDevices((foundDevices) => {
      setDevices(foundDevices);
    });
    // 5秒后停止加载动画
    setTimeout(() => setIsSearching(false), 5000);
  };

  useEffect(() => {
    if (showCastModal) {
      startSearch();
    }
  }, [showCastModal]);

  const onCast = async (device: DLNADevice) => {
    const currentEpisode = episodes[currentEpisodeIndex];
    if (!currentEpisode) return;

    try {
      Toast.show({ type: 'info', text1: '正在投屏...', text2: `连接到 ${device.name}` });
      await dlnaService.castVideo(device, currentEpisode.url, currentEpisode.title);
      Toast.show({ type: 'success', text1: '投屏成功', text2: '请在电视上查看' });
      setShowCastModal(false);
    } catch (error) {
      Toast.show({ type: 'error', text1: '投屏失败', text2: '请重试或检查网络' });
    }
  };

  const onClose = () => {
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
    width: 350,
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
