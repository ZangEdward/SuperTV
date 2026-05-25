import React, { useEffect } from "react";
import { View, Text, StyleSheet, Modal, FlatList } from "react-native";
import { StyledButton } from "./StyledButton";
import useDetailStore from "@/stores/detailStore";
import usePlayerStore from "@/stores/playerStore";
import { useSettingsStore } from "@/stores/settingsStore";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("SourceSelectionModal");

// 自动切换到下一个最快源（播放失败时调用）已禁用
export const autoSwitchToNextSource = () => {
  logger.info("autoSwitchToNextSource called but feature is disabled");
};

export const SourceSelectionModal: React.FC = () => {
  const { showSourceModal, setShowSourceModal, loadVideo, currentEpisodeIndex, status } =
    usePlayerStore();
  const { searchResults, detail, setDetail, optimizeSources } = useDetailStore();
  const { sourceLatencies } = useSettingsStore();

  useEffect(() => {
    if (showSourceModal) {
      // 弹窗打开时，静默触发一次测速优化
      optimizeSources();
    }
  }, [showSourceModal]);

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

  const getLatencyText = (item: any) => {
    const ms = item.latency ?? sourceLatencies[item.source];
    const speed = item.speed;

    let text = "";
    if (ms !== undefined) {
      if (ms === Infinity) text += "（超时）";
      else text += `（${Math.round(ms)}ms）`;
    }

    if (speed !== undefined && speed > 0) {
      text += ` ${speed.toFixed(1)}MB/s`;
    }

    return text;
  };

  return (
    <Modal visible={showSourceModal} transparent={true} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>选择播放源</Text>

          <FlatList
            data={searchResults}
            numColumns={2}
            contentContainerStyle={styles.sourceList}
            keyExtractor={(item, index) => `source-${item.source}-${index}`}
            renderItem={({ item, index }) => (
              <StyledButton
                text={`${item.source_name}${getLatencyText(item)}`}
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
