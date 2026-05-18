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
    removeCacheItem,
    cancelQueuedEpisode,
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

  const handleDownload = (groupId?: string, index?: number) => {
    if (groupId !== undefined && index !== undefined) {
      downloadQueuedEpisode(groupId, index);
    }
  };

  const renderEpisodeItem = ({ item }: { item: typeof episodes[0] }) => {
    const epTitle = `第 ${item.index + 1} 集`;
    const progressPercent = Math.round((item.progress || 0) * 100);
    const isDownloading = item.status === 'downloading';
    const isCompleted = item.status === 'completed';
    const isPaused = item.status === 'cancelled' || (item.status === 'failed' && item.progress! > 0);

    return (
      <View style={styles.episodeCard}>
        <View style={styles.episodeMain}>
          <View style={styles.episodeInfo}>
            <ThemedText style={styles.episodeText}>{epTitle}</ThemedText>
            <ThemedText style={[styles.statusText, isCompleted && { color: Colors.dark.primary }]}>
              {isCompleted ? '已完成' : isDownloading ? `下载中 ${progressPercent}%` : isPaused ? `暂停 ${progressPercent}%` : '等待中'}
            </ThemedText>
          </View>

          <View style={styles.actionRow}>
            {isCompleted ? (
              <>
                <StyledButton
                  variant="primary"
                  onPress={() => item.fileUri && handlePlay(item.fileUri, epTitle)}
                  style={styles.actionBtn}
                  text="播放"
                />
                <StyledButton
                  variant="ghost"
                  onPress={() => handleDelete(item.id)}
                  style={styles.actionBtn}
                  text="删除"
                />
              </>
            ) : isDownloading ? (
              <>
                <StyledButton
                  variant="default"
                  onPress={() => handleCancel(item.groupId, item.index)}
                  style={styles.actionBtn}
                  text="暂停"
                />
                <StyledButton
                  variant="ghost"
                  onPress={() => handleDelete(item.id)}
                  style={styles.actionBtn}
                  text="删除"
                />
              </>
            ) : (
              <>
                <StyledButton
                  variant="primary"
                  onPress={() => handleDownload(item.groupId, item.index)}
                  style={styles.actionBtn}
                  text={isPaused ? "继续" : "下载"}
                />
                <StyledButton
                  variant="ghost"
                  onPress={() => handleDelete(item.id)}
                  style={styles.actionBtn}
                  text="删除"
                />
              </>
            )}
          </View>
        </View>

        {!isCompleted && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
          </View>
        )}
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
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  episodeMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  episodeInfo: {
    flex: 1,
  },
  episodeText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#eee",
  },
  statusText: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    minWidth: 60,
    height: 32,
    paddingHorizontal: 8,
  },
  progressContainer: {
    marginTop: 12,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#222',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.dark.primary,
  },
});
