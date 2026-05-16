import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Image, ScrollView, TouchableOpacity, Modal } from "react-native";
import { useRouter } from "expo-router";
import useCacheStore from "@/stores/cacheStore";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { StyledButton } from "@/components/StyledButton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";

export default function CacheManagementScreen() {
  const router = useRouter();
  const { items, loadCache, removeCacheItem, loading, concurrency, setConcurrency } = useCacheStore();
  const { queue, downloadQueuedEpisode, cancelQueuedEpisode, cancelGroup, downloadProgress, currentDownloadId } = useCacheStore();
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});
  const [concurrencyOpen, setConcurrencyOpen] = React.useState(false);
  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { spacing } = responsiveConfig;

  useEffect(() => {
    loadCache();
  }, [loadCache]);

  const handlePlayCached = (fileUri: string, title: string) => {
    router.push(`/play?title=${encodeURIComponent(title)}&fileUri=${encodeURIComponent(fileUri)}`);
  };

  // modal state for collection detail
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalEpisodes, setModalEpisodes] = useState<{ index: number; status: string; progress?: number; fileUri?: string }[]>([]);

  const groupedCollections = useMemo(() => {
    const map = new Map<string, { title: string; poster: string }>();
    items.forEach((it) => {
      if (!map.has(it.title)) map.set(it.title, { title: it.title, poster: it.poster });
    });
    return Array.from(map.values());
  }, [items]);

  const openCollectionModal = (title?: string) => {
    if (!title) return;
    // find queued group first
    const group = queue.find((g) => g.title === title);
    if (group) {
      setModalTitle(group.title);
      setModalEpisodes(group.episodes.map((ep) => ({ index: ep.index, status: ep.status, progress: ep.progress })));
      setModalVisible(true);
      return;
    }

    // else find cached items
    const matched = items.filter((it) => it.title === title).sort((a, b) => a.episodeIndex - b.episodeIndex);
    setModalTitle(title);
    setModalEpisodes(matched.map((it) => ({ index: it.episodeIndex, status: 'completed', progress: 1, fileUri: it.fileUri })));
    setModalVisible(true);
  };

  const activeDownload = React.useMemo(() => {
    if (!currentDownloadId) return null;
    for (const group of queue) {
      for (const ep of group.episodes) {
        const itemId = `${group.source}_${group.id}_${ep.index}`;
        if (itemId === currentDownloadId) {
          return {
            title: group.title,
            episodeIndex: ep.index,
            progress: downloadProgress?.[itemId] ?? ep.progress ?? 0,
          };
        }
      }
    }
    return null;
  }, [currentDownloadId, downloadProgress, queue]);

  const queuedCount = React.useMemo(
    () => queue.reduce((count, group) => count + group.episodes.filter((ep) => ep.status === 'queued' || ep.status === 'pending').length, 0),
    [queue]
  );

  const currentStatusLabel = activeDownload ? '正在缓存' : queuedCount > 0 ? '等待缓存' : '当前状态';
  const currentStatusValue = activeDownload
    ? `${activeDownload.title} · 第 ${activeDownload.episodeIndex + 1} 集 · ${Math.round(activeDownload.progress * 100)}%`
    : queuedCount > 0
    ? `队列中 ${queuedCount} 集，正在等待下载`
    : '暂无进行中的缓存';

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="缓存管理" showBackButton />
      <ThemedView style={[commonStyles.container, styles.container, { padding: spacing }]}> 
        {/* 并发设置 */}
        <View style={[styles.concurrencyContainer, { marginBottom: spacing }]}> 
          <ThemedText style={[styles.concurrencyLabel, { marginBottom: 8 }]}>并发下载</ThemedText>
          <TouchableOpacity
            style={styles.concurrencySelector}
            onPress={() => setConcurrencyOpen((open) => !open)}
          >
            <ThemedText style={styles.concurrencyLabel}>当前并发下载数</ThemedText>
            <View style={styles.selectorValueWrap}>
              <ThemedText style={styles.concurrencyValue}>{concurrency}</ThemedText>
              <ThemedText style={styles.concurrencyArrow}>{concurrencyOpen ? '▲' : '▼'}</ThemedText>
            </View>
          </TouchableOpacity>
          {concurrencyOpen && (
            <View style={styles.concurrencyOptions}>
              {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                <StyledButton
                  key={value}
                  text={`${value}`}
                  onPress={() => {
                    setConcurrency(value);
                    setConcurrencyOpen(false);
                  }}
                  isSelected={value === concurrency}
                  variant={value === concurrency ? 'primary' : 'default'}
                  style={styles.optionButton}
                  textStyle={styles.optionText}
                />
              ))}
            </View>
          )}
          <ThemedText type="subtitle" style={styles.concurrencyHint}>选择并发下载数量</ThemedText>
        </View>
        {/* 下载队列 */}
        <View style={{ marginBottom: spacing }}>
          <ThemedText style={[styles.title, { marginBottom: 8 }]}>下载列表</ThemedText>
          <View style={styles.currentStatusRow}>
            <ThemedText style={styles.currentStatusLabel}>{currentStatusLabel}</ThemedText>
            <ThemedText style={styles.currentStatusValue}>{currentStatusValue}</ThemedText>
          </View>
          {queue.length === 0 ? (
            <ThemedText type="subtitle">下载列表为空</ThemedText>
          ) : (
            queue.map((g) => (
              <View key={g.groupId} style={[styles.card, { marginBottom: 8 }]}> 
                <TouchableOpacity onPress={() => setExpandedGroups((s) => ({ ...s, [g.groupId]: !s[g.groupId] }))}>
                  <View style={styles.groupHeader}>
                    <Image source={{ uri: g.poster }} style={styles.groupPoster} />
                    <View style={styles.groupMeta}>
                      <ThemedText style={styles.title} numberOfLines={2}>{g.title}</ThemedText>
                      <ThemedText style={styles.meta}>{g.episodes.length} 集待处理</ThemedText>
                    </View>
                    <View style={styles.groupActions}>
                      <StyledButton
                        text={expandedGroups[g.groupId] ? '收起' : '展开'}
                        onPress={() => setExpandedGroups((s) => ({ ...s, [g.groupId]: !s[g.groupId] }))}
                        style={styles.groupActionButton}
                      />
                      <StyledButton
                        text="取消分组"
                        variant="ghost"
                        onPress={() => cancelGroup(g.groupId)}
                        style={styles.groupActionButton}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
                {expandedGroups[g.groupId] && (
                  <View style={{ padding: 12 }}>
                    {g.episodes.map((ep) => {
                      const progressValue = ep.progress ?? downloadProgress?.[`${g.source}_${g.id}_${ep.index}`] ?? 0;
                      const progressPercent = Math.round(progressValue * 100);
                      return (
                        <View key={ep.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <ThemedText style={{ flex: 1 }}>第 {ep.index + 1} 集</ThemedText>
                          {ep.status === 'downloading' || progressValue > 0 ? (
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <View style={styles.progressBarBackground}>
                                <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                              </View>
                              <ThemedText style={styles.progressPercentage}>{progressPercent}%</ThemedText>
                            </View>
                          ) : null}
                          <View style={styles.episodeActionRow}>
                            <StyledButton
                              text="下载"
                              onPress={() => downloadQueuedEpisode(g.groupId, ep.index)}
                              disabled={ep.status === 'downloading' || ep.status === 'completed' || currentDownloadId === `${g.source}_${g.id}_${ep.index}`}
                              style={[styles.episodeActionButton, { marginRight: 6 }]}
                            />
                            <StyledButton
                              text="取消"
                              variant="ghost"
                              onPress={() => cancelQueuedEpisode(g.groupId, ep.index)}
                              style={styles.episodeActionButton}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            ))
          )}
        </View>
        <ScrollView>
          {items.length === 0 ? (
            <View style={styles.emptyBox}>
              <ThemedText type="subtitle">暂无缓存内容</ThemedText>
            </View>
          ) : (
            <View style={styles.grid}>
              {groupedCollections.map((c) => (
                <View key={c.title} style={styles.posterCard}>
                  <TouchableOpacity onPress={() => openCollectionModal(c.title)}>
                    <Image source={{ uri: c.poster }} style={styles.posterLarge} />
                  </TouchableOpacity>
                  <ThemedText style={styles.posterTitle} numberOfLines={2}>{c.title}</ThemedText>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ThemedText style={styles.modalTitle}>{modalTitle}</ThemedText>
              <ScrollView style={styles.modalList}>
                {modalEpisodes.map((ep) => (
                  <View key={ep.index} style={styles.modalEpisodeRow}>
                    <ThemedText style={styles.modalEpisodeText}>第 {ep.index + 1} 集</ThemedText>
                    {ep.status === 'downloading' ? (
                      <ThemedText style={styles.modalEpisodeStatus}>{Math.round((ep.progress || 0) * 100)}%</ThemedText>
                    ) : ep.status === 'completed' ? (
                      <StyledButton text="播放" variant="primary" onPress={() => ep.fileUri && handlePlayCached(ep.fileUri, modalTitle)} />
                    ) : (
                      <ThemedText style={styles.modalEpisodeStatusSmall}>{ep.status}</ThemedText>
                    )}
                  </View>
                ))}
              </ScrollView>
              <StyledButton text="关闭" onPress={() => setModalVisible(false)} style={{ marginTop: 12 }} />
            </View>
          </View>
        </Modal>
      </ThemedView>
    </ResponsiveNavigation>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyBox: {
    paddingTop: 60,
    alignItems: "center",
  },
  card: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#1f1f1f",
    borderRadius: 12,
    overflow: "hidden",
  },
  poster: {
    width: 120,
    height: 170,
  },
  progressWrap: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBarBackground: {
    flex: 1,
    height: 8,
    backgroundColor: '#333',
    borderRadius: 6,
    overflow: 'hidden',
    marginRight: 8,
  },
  progressBarFill: {
    height: 8,
    backgroundColor: '#00bb5e',
  },
  progressPercentage: {
    marginTop: 4,
    color: '#ccc',
    fontSize: 12,
    textAlign: 'right',
  },
  progressText: {
    color: '#ddd',
    fontSize: 12,
    minWidth: 36,
    textAlign: 'right',
  },
  currentStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  currentStatusLabel: {
    color: '#aaa',
    fontSize: 13,
  },
  currentStatusValue: {
    color: '#fff',
    fontSize: 13,
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    marginLeft: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    padding: 10,
  },
  groupPoster: {
    width: 80,
    height: 100,
    borderRadius: 6,
    marginRight: 12,
    marginBottom: 8,
  },
  groupMeta: {
    flex: 1,
    minWidth: 140,
    marginBottom: 8,
  },
  groupActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 120,
  },
  groupActionButton: {
    minWidth: 68,
    marginRight: 6,
    marginBottom: 6,
  },
  episodeActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    minWidth: 120,
  },
  episodeActionButton: {
    minWidth: 64,
    marginBottom: 4,
  },
  content: {
    flex: 1,
    padding: 14,
    justifyContent: "space-between",
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
    marginBottom: 8,
  },
  meta: {
    color: "#bbb",
    marginBottom: 6,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionButton: {
    marginRight: 10,
  },
  concurrencyContainer: {
    backgroundColor: '#1d1d1d',
    borderRadius: 12,
    padding: 14,
  },
  concurrencySelector: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  concurrencyLabel: {
    color: '#bbb',
    fontSize: 14,
  },
  selectorValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  concurrencyArrow: {
    color: '#ccc',
    fontSize: 14,
  },
  concurrencyOptions: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  optionButton: {
    minWidth: 52,
    marginBottom: 10,
  },
  optionText: {
    textAlign: 'center',
  },
  concurrencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  concurrencyButton: {
    minWidth: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  concurrencyValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'center',
  },
  concurrencyHint: {
    color: '#aaa',
    marginTop: 10,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 12,
  },
  posterCard: {
    width: 140,
    marginRight: 12,
    marginBottom: 16,
  },
  posterLarge: {
    width: 140,
    height: 200,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  posterTitle: {
    color: '#fff',
    marginTop: 8,
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#121212',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalList: {
    maxHeight: '70%',
  },
  modalEpisodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  modalEpisodeText: {
    color: '#ddd',
  },
  modalEpisodeStatus: {
    color: '#0f0',
    minWidth: 48,
    textAlign: 'right',
  },
  modalEpisodeStatusSmall: {
    color: '#aaa',
  },
});
