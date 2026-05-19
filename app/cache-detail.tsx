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
import { Colors } from "@/constants/Colors";

export default function CacheDetailScreen() {
  const router = useRouter();
  const { title } = useLocalSearchParams<{ title: string }>();
  const {
    items,
    queue,
    downloadProgress,
    downloadQueuedEpisode,
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
    const list: { index: number; status: string; progress?: number; fileUri?: string; groupId?: string; id?: string }[] = [];

    queue.filter(g => g.title === title).forEach(group => {
      group.episodes.forEach(ep => {
        const itemId = `${group.source}_${group.id}_${ep.index}`;
        list.push({
          index: ep.index,
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
          status: 'completed',
          progress: 1,
          fileUri: it.fileUri,
          id: it.id
        });
      }
    });

    return list.sort((a, b) => a.index - b.index);
  }, [items, queue, title, downloadProgress]);

  const handlePlay = (fileUri: string, epTitle: string) => {
    const playTitle = `${movieInfo.title} ${epTitle}`;
    router.push({
      pathname: "/play",
      params: {
        title: playTitle,
        fileUri: fileUri,
        q: movieInfo.title
      }
    });
  };

  const handleDelete = async (itemId?: string) => {
    if (itemId) {
      await removeCacheItem(itemId);
    }
  };

  const handleCancel = async (groupId?: string, index?: number) => {
    if (groupId !== undefined && index !== undefined) {
      await cancelQueuedEpisode(groupId, index);
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
    }
  };

  const renderEpisodeItem = ({ item }: { item: typeof episodes[0] }) => {
    const epTitle = `第 ${item.index + 1} 集`;
    const progressPercent = Math.min(100, Math.round((item.progress || 0) * 100));
    const isDownloading = item.status === 'downloading';
    const isCompleted = item.status === 'completed';
    const isPaused = item.status === 'paused';
    const isQueued = item.status === 'queued';
    const isPending = item.status === 'pending';
    const isFailed = item.status === 'failed' || item.status === 'cancelled';

    // 状态文本与颜色映射
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
        {/* 上方：剧集编号 + 状态标签 */}
        <View style={styles.episodeHeader}>
          <ThemedText style={styles.episodeText}>{epTitle}</ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '40' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <ThemedText style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</ThemedText>
          </View>
        </View>

        {/* 进度条（所有状态都显示）*/}
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { backgroundColor: '#222' }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor: barColor,
                },
              ]}
            />
          </View>
        </View>

        {/* 底部：操作按钮区域 */}
        <View style={styles.actionRow}>
          {isCompleted ? (
            <>
              <StyledButton
                variant="primary"
                onPress={() => item.fileUri && handlePlay(item.fileUri, epTitle)}
                text="▶ 播放"
              />
              <StyledButton
                variant="ghost"
                onPress={() => handleDelete(item.id)}
                text="🗑 删除"
              />
            </>
          ) : isDownloading ? (
            <>
              <StyledButton
                variant="default"
                onPress={() => handlePause(item.groupId, item.index)}
                text="⏸ 暂停"
              />
              <StyledButton
                variant="ghost"
                onPress={() => handleCancel(item.groupId, item.index)}
                text="✕ 取消"
              />
            </>
          ) : isPaused ? (
            <>
              <StyledButton
                variant="primary"
                onPress={() => handleResume(item.groupId, item.index)}
                text="▶ 继续"
              />
              <StyledButton
                variant="ghost"
                onPress={() => handleCancel(item.groupId, item.index)}
                text="✕ 取消"
              />
            </>
          ) : isQueued || isPending ? (
            <>
              <StyledButton
                variant="primary"


                onPress={() => handleRetry(item.groupId, item.index)}
                              text="⬇ 开始下载"
              />
              <StyledButton
                variant="ghost"
                onPress={() => handleCancel(item.groupId, item.index)}
                text="✕ 移除"
              />
            </>
          ) : (
            /* failed / cancelled 显示重试 */
            <>
              <StyledButton
                variant="default"
                onPress={() => handleRetry(item.groupId, item.index)}
                text="↻ 重试"
              />
              <StyledButton
                variant="ghost"
                onPress={() => handleDelete(item.id)}
                text="🗑 删除"
              />
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
          {movieInfo.poster && (
            <Image source={{ uri: movieInfo.poster }} style={styles.poster} />
          )}
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    padding: 20,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: 6,
    marginRight: 16,
    backgroundColor: '#1a1a1a',
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
  },
  listContent: {
    padding: 16,
  },
  episodeCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  episodeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  episodeText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#eee",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  progressContainer: {
    marginBottom: 10,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingTop: 4,
  },
});
