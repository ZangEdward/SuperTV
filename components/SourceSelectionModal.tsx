import React, { useEffect } from "react";
import { View, Text, StyleSheet, Modal, FlatList, TouchableOpacity } from "react-native";
import { StyledButton } from "./StyledButton";
import useDetailStore from "@/stores/detailStore";
import usePlayerStore from "@/stores/playerStore";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("SourceSelectionModal");

// 自动切换到下一个最快源（播放失败时调用）
export const autoSwitchToNextSource = () => {
  const { searchResults, detail, setDetail } = useDetailStore.getState();
  const { loadVideo, currentEpisodeIndex, status } = usePlayerStore.getState();

  const sorted = [...searchResults].sort(
    (a, b) => (a.latency ?? 99999) - (b.latency ?? 99999)
  );

  const currentIndex = sorted.findIndex((s) => s.source === detail?.source);
  const next = sorted[currentIndex + 1];

  if (!next) {
    console.warn("没有更多源可切换");
    return;
  }

  setDetail(next);

  const currentPosition = status?.isLoaded ? status.positionMillis : undefined;

  loadVideo({
    source: next.source,
    id: next.id.toString(),
    episodeIndex: currentEpisodeIndex,
    title: next.title,
    position: currentPosition,
  });
};

export const SourceSelectionModal: React.FC = () => {
  const { showSourceModal, setShowSourceModal, loadVideo, currentEpisodeIndex, status } =
    usePlayerStore();
  const { searchResults, detail, setDetail } = useDetailStore();

  // 手动测速：由外部触发，不在 Modal 打开时自动测速

  // 自动选择最快源（打开详情页时）
  useEffect(() => {
    if (!searchResults || searchResults.length === 0) return;

    const sorted = [...searchResults].sort(
      (a, b) => (a.latency ?? 99999) - (b.latency ?? 99999)
    );

    if (sorted[0] && sorted[0].source !== detail?.source) {
      setDetail(sorted[0]);
    }
  }, [searchResults]);

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
                onPress={() => onSelectSource(index)}
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
