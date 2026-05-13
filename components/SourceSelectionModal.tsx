import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, FlatList, Platform } from "react-native";
import { StyledButton } from "./StyledButton";
import useDetailStore from "@/stores/detailStore";
import usePlayerStore from "@/stores/playerStore";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("SourceSelectionModal");

// 测速函数（HEAD 请求）
const testSourceSpeed = async (url: string): Promise<number> => {
  const start = Date.now();
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!res.ok) throw new Error("Bad response");
    return Date.now() - start;
  } catch {
    return Infinity;
  }
};

export const SourceSelectionModal: React.FC = () => {
  const { showSourceModal, setShowSourceModal, loadVideo, currentEpisodeIndex, status } =
    usePlayerStore();

  const { searchResults, detail, setDetail, setLatencies } = useDetailStore();

  const [latencies, setLocalLatencies] = useState<Record<string, number>>({});
  const [focusedSource, setFocusedSource] = useState<any>(null); // ⭐ TV 当前焦点源

  // ⭐ TV：焦点停留 2 秒后自动测速
  useEffect(() => {
    if (!Platform.isTV) return; // 手机不执行
    if (!focusedSource) return;

    const timer = setTimeout(async () => {
      const url =
        focusedSource.play_url ||
        focusedSource.url ||
        focusedSource.source_url ||
        focusedSource.source;

      if (!url) return;

      const ms = await testSourceSpeed(url);

      const newLatencies = {
        ...latencies,
        [focusedSource.source]: ms,
      };

      // ⭐ 更新本地
      setLocalLatencies(newLatencies);

      // ⭐ 写入全局 detailStore（排序 + 默认选最快 + 前 5 个）
      setLatencies(newLatencies);

    }, 2000);

    return () => clearTimeout(timer);
  }, [focusedSource]);

  const onSelectSource = (index: number) => {
    const selected = searchResults[index];

    if (selected.source !== detail?.source) {
      setDetail(selected);

      const currentPosition = status?.isLoaded ? status.positionMillis : undefined;

      loadVideo({
        source: selected.source,
        id: selected.id.toString(),
        episodeIndex: currentEpisodeIndex,
        title: selected.title,
        position: currentPosition,
      });
    }

    setShowSourceModal(false);
  };

  const onClose = () => {
    setShowSourceModal(false);
  };

  const getLatencyText = (source: string) => {
    const ms = latencies[source];
    if (ms === undefined) return "测速中...";
    if (ms === Infinity) return "超时";
    return `${ms} ms`;
  };

  return (
    <Modal visible={showSourceModal} transparent={true} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>选择播放源</Text>

          <FlatList
            data={searchResults}
            numColumns={3}
            contentContainerStyle={styles.sourceList}
            keyExtractor={(item, index) => `source-${item.source}-${index}`}
            renderItem={({ item, index }) => (
              <StyledButton
                text={`${item.source_name} (${getLatencyText(item.source)})`}
                onPress={() => onSelectSource(index)} // ⭐ 手机点击
                onFocus={() => setFocusedSource(item)} // ⭐ TV 焦点变化
                isSelected={detail?.source === item.source}
                hasTVPreferredFocus={detail?.source === item.source}
                style={styles.sourceItem}
                textStyle={styles.sourceItemText}
              />
            )}
          />
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
    width: 600,
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    padding: 20,
  },
  modalTitle: {
    color: "white",
    marginBottom: 12,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
  },
  sourceList: {
    justifyContent: "flex-start",
  },
  sourceItem: {
    paddingVertical: 2,
    margin: 4,
    marginLeft: 10,
    marginRight: 8,
    width: "30%",
  },
  sourceItemText: {
    fontSize: 14,
  },
});