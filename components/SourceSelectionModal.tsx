import React, { useEffect } from "react";
import { View, Text, StyleSheet, Modal, FlatList, ActivityIndicator } from "react-native";
import { StyledButton } from "./StyledButton";
import useDetailStore from "@/stores/detailStore";
import usePlayerStore from "@/stores/playerStore";
import { useSettingsStore } from "@/stores/settingsStore";
import Logger from "@/utils/Logger";

const logger = Logger.withTag("SourceSelectionModal");

export const SourceSelectionModal: React.FC = () => {
  const { showSourceModal, setShowSourceModal, loadVideo, currentEpisodeIndex, status } =
    usePlayerStore();
  const { searchResults, detail, setDetail, optimizeSources, isOptimizing } = useDetailStore();
  const { sourceLatencies } = useSettingsStore();

  useEffect(() => {
    if (showSourceModal) {
      logger.info("Opening SourceSelectionModal, triggering optimization...");
      optimizeSources();
    }
  }, [showSourceModal]);

  const onSelectSource = (index: number) => {
    const selected = searchResults[index];
    if (!selected) return;

    if (selected.source !== detail?.source) {
      setDetail(selected);

      const currentPosition = status?.isLoaded ? status.positionMillis : undefined;

      loadVideo({
        source: selected.source,
        id: (selected.id || "").toString(),
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
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>选择播放源</Text>
            {isOptimizing && (
              <View style={styles.optimizingBadge}>
                <ActivityIndicator size="small" color="#00bb5e" />
                <Text style={styles.optimizingText}>正在优选线路...</Text>
              </View>
            )}
          </View>

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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  modalTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },
  optimizingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,187,94,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  optimizingText: {
    color: '#00bb5e',
    fontSize: 12,
    fontWeight: '600',
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
