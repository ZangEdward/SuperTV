import React, { useMemo, useEffect } from "react";
import { View, StyleSheet, Image, FlatList, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import useCacheStore from "@/stores/cacheStore";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { StyledButton } from "@/components/StyledButton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";
import Toast from "react-native-toast-message";
import { Ionicons } from "@expo/vector-icons";

export default function CacheDetailScreen() {
  const router = useRouter();
  const { title } = useLocalSearchParams<{ title: string }>();
  const {
    items,
    queue,
    downloadProgress,
    pauseQueuedEpisode,
    resumeQueuedEpisode,
    removeCacheItem,
    cancelQueuedEpisode,
    retryDownload,
    loadCache
  } = useCacheStore();

  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { spacing } = responsiveConfig;

  useEffect(() => {
    loadCache();
  }, [loadCache]);

  const movieInfo = useMemo(() => {
    const queuedGroup = queue.find((g) => g.title === title);
    if (queuedGroup) return { title: queuedGroup.title, poster: queuedGroup.poster };
    const cachedItem = items.find((it) => it.title === title);
    if (cachedItem) return { title: cachedItem.title, poster: cachedItem.poster };
    return { title: title || "未知影片", poster: undefined };
  }, [items, queue, title]);

  const episodes = useMemo(() => {
    const list: { index: number; title: string; status: string; progress?: number; fileUri?: string; groupId?: string; id?: string }[] = [];
    queue.filter(g => g.title === title).forEach(group => {
      group.episodes.forEach(ep => {
        const itemId = `${group.source}_${group.id}_${ep.index}`;
        list.push({
          index: ep.index,
          title: ep.title,
          status: ep.status,
          progress: downloadProgress?.[itemId] ?? ep.progress ?? 0,
          groupId: group.groupId,
          id: itemId
        });
      });
    });
    items.filter(it => it.title === title).forEach(it => {
      const existing = list.find(e => e.index === it.episodeIndex);
      if (existing) {
        existing.status = 'completed';
        existing.fileUri = it.fileUri;
        existing.progress = 1;
      } else {
        list.push({
          index: it.episodeIndex,
          title: it.episodeTitle || `第 ${it.episodeIndex + 1} 集`,
          status: 'completed',
          progress: 1,
          fileUri: it.fileUri,
          id: it.id
        });
      }
    });
    return list.sort((a, b) => a.index - b.index);
  }, [items, queue, title, downloadProgress]);

  const handlePlay = (fileUri: string | undefined, epTitle: string, episodeIndex: number = 0) => {
    if (!fileUri) {
      Toast.show({ type: "error", text1: "播放失败", text2: "文件路径不存在" });
      return;
    }
    const playTitle = `${movieInfo.title} ${epTitle}`;
    router.push({
      pathname: "/play",
      params: {
        title: playTitle,
        fileUri: fileUri,
        q: movieInfo.title,
        episodeIndex: episodeIndex.toString()
      }
    });
  };

  const handleDelete = async (itemId?: string) => {
    if (itemId) {
      await removeCacheItem(itemId);
      Toast.show({ type: "success", text1: "已删除" });
    }
  };

  const handleCancel = async (groupId?: string, index?: number) => {
    if (groupId !== undefined && index !== undefined) {
      await cancelQueuedEpisode(groupId, index);
      Toast.show({ type: "info", text1: "下载已取消" });
    }
  };

  const handlePause = async (groupId?: string, index?: number) => {
    if (groupId !== undefined && index !== undefined) {
      await pauseQueuedEpisode(groupId, index);
    }
  };

  const handleResume = async (groupId?: string, index?: number) => {
    if (groupId !== undefined && index !== undefined) {
      await resumeQueuedEpisode(groupId, index);
    }
  };

  const handleRetry = async (groupId?: string, index?: number) => {
    if (groupId !== undefined && index !== undefined) {
      retryDownload(groupId, index);
      Toast.show({ type: "info", text1: "正在重试下载" });
    }
  };

  const renderEpisodeItem = ({ item }: { item: typeof episodes[0] }) => {
    const epTitle = item.title;
    const progressPercent = Math.min(100, Math.round((item.progress || 0) * 100));
    const isDownloading = item.status === 'downloading';
    const isCompleted = item.status === 'completed';
    const isPaused = item.status === 'paused';
    const isQueued = item.status === 'queued';
    const isPending = item.status === 'pending';
    const isFailed = item.status === 'failed' || item.status === 'cancelled';

    let statusLabel: string;
    let statusColor: string;
    let barColor: string;

    if (isCompleted) {
      statusLabel = `已完成 100%`;
      statusColor = '#4CAF50';
      barColor = '#4CAF50';
    } else if (isDownloading) {
      statusLabel = `下载中 ${progressPercent}%`;
      statusColor = '#FF9800';
      barColor = '#FF9800';
    } else if (isPaused) {
      statusLabel = `已暂停 ${progressPercent}%`;
      statusColor = '#2196F3';
      barColor = '#2196F3';
    } else if (isQueued) {
      statusLabel = '排队中';
      statusColor = '#9E9E9E';
      barColor = '#9E9E9E';
    } else if (isPending) {
      statusLabel = '等待下载';
      statusColor = '#757575';
      barColor = '#757575';
    } else if (isFailed) {
      statusLabel = item.status === 'cancelled' ? '已取消' : '下载失败';
      statusColor = '#F44336';
      barColor = '#555';
    } else {
      statusLabel = '等待中';
      statusColor = '#757575';
      barColor = '#757575';
    }

    return (
      <View style={styles.episodeCard}>
        <View style={styles.episodeHeader}>
          <ThemedText style={styles.episodeText}>{epTitle}</ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '40' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <ThemedText style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</ThemedText>
          </View>
        </View>

        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { backgroundColor: '#222' }]}>
            <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: barColor }]} />
          </View>
        </View>

        <View style={styles.actionRow}>
          {isCompleted ? (
            <>
              <StyledButton variant="primary" onPress={() => handlePlay(item.fileUri, epTitle, item.index)} text="▶ 播放" />
              <TouchableOpacity style={styles.iconButton} onPress={() => handleDelete(item.id)}>
                <Ionicons name="trash-outline" size={20} color="#ff4444" />
              </TouchableOpacity>
            </>
          ) : isDownloading ? (
            <>
              <StyledButton variant="default" onPress={() => handlePause(item.groupId, item.index)} text="⏸ 暂停" />
              <TouchableOpacity style={styles.iconButton} onPress={() => handleCancel(item.groupId, item.index)}>
                <Ionicons name="trash-outline" size={20} color="#ff4444" />
              </TouchableOpacity>
            </>
          ) : isPaused ? (
            <>
              <StyledButton variant="primary" onPress={() => handleResume(item.groupId, item.index)} text="▶ 继续" />
              <TouchableOpacity style={styles.iconButton} onPress={() => handleCancel(item.groupId, item.index)}>
                <Ionicons name="trash-outline" size={20} color="#ff4444" />
              </TouchableOpacity>
            </>
          ) : isQueued || isPending ? (
            <>
              <StyledButton variant="primary" onPress={() => handleRetry(item.groupId, item.index)} text="⬇ 开始下载" />
              <TouchableOpacity style={styles.iconButton} onPress={() => handleCancel(item.groupId, item.index)}>
                <Ionicons name="trash-outline" size={20} color="#ff4444" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <StyledButton variant="default" onPress={() => handleRetry(item.groupId, item.index)} text="↻ 重试" />
              <TouchableOpacity style={styles.iconButton} onPress={() => handleDelete(item.id)}>
                <Ionicons name="trash-outline" size={20} color="#ff4444" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="缓存详情" showBackButton />
      <ThemedView style={[commonStyles.container, styles.container]}>
        <View style={styles.header}>
          {movieInfo.poster && <Image source={{ uri: movieInfo.poster }} style={styles.poster} />}
          <View style={styles.headerInfo}>
            <ThemedText type="title" style={styles.title}>{movieInfo.title}</ThemedText>
            <ThemedText style={styles.subtitle}>
              共 {episodes.length} 个项目 · 已完成 {episodes.filter(e => e.status === 'completed').length}
            </ThemedText>
          </View>
        </View>
        <FlatList
          data={episodes}
          renderItem={renderEpisodeItem}
          keyExtractor={(item, index) => `${item.index}_${index}`}
          contentContainerStyle={[styles.listContent, { paddingBottom: spacing * 2 }]}
        />
      </ThemedView>
    </ResponsiveNavigation>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", padding: 20, alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1a1a1a" },
  poster: { width: 60, height: 90, borderRadius: 6, marginRight: 16, backgroundColor: '#1a1a1a' },
  headerInfo: { flex: 1 },
  title: { fontSize: 18, fontWeight: "bold", color: "white", marginBottom: 4 },
  subtitle: { fontSize: 13, color: "#666" },
  listContent: { padding: 16 },
  episodeCard: { backgroundColor: '#111', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  episodeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  episodeText: { fontSize: 15, fontWeight: "600", color: "#eee" },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: "500" },
  progressContainer: { marginBottom: 10 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  actionRow: { flexDirection: "row", justifyContent: "center", gap: 12, paddingTop: 4 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255, 68, 68, 0.15)", justifyContent: "center", alignItems: "center" },
});
