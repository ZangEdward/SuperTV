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
import { FontAwesome } from "@expo/vector-icons";
import { CacheService } from "@/services/cacheService";
import Toast from "react-native-toast-message";

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
  }, []);

  const movieInfo = useMemo(() => {
    const queuedGroup = queue.find((g) => g.title === title);
    if (queuedGroup) return { title: queuedGroup.title, poster: queuedGroup.poster };

    const cachedItem = items.find((it) => it.title === title);
    if (cachedItem) return { title: cachedItem.title, poster: cachedItem.poster };

    return { title: title || "未知影片", poster: undefined };
  }, [items, queue, title]);

  const episodes = useMemo(() => {
    const list: { index: number; status: string; progress?: number; fileUri?: string; groupId?: string; id?: string }[] = [];

    // 1. 处理下载队列中的项目
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

    // 2. 处理已完成的项目（或者更新队列中已完成的状态）
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
    // 检查是文件路径还是网络路径
    const playTitle = `${movieInfo.title} ${epTitle}`;
    router.push({
      pathname: "/play",
      params: {
        title: playTitle,
        fileUri: fileUri,
        // 传递必要参数以防播放页需要
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

    return (
      <View style={styles.episodeRow}>
        <ThemedText style={styles.episodeText}>{epTitle}</ThemedText>

        {item.status === 'completed' ? (
          <View style={styles.statusRow}>
            <ThemedText style={styles.statusLabel}>缓存完成</ThemedText>
            <StyledButton
              variant="primary"
              onPress={() => item.fileUri && handlePlay(item.fileUri, epTitle)}
              style={[styles.miniButton, { marginRight: 8 }]}
              text="播放"
            />
            <StyledButton
              variant="ghost"
              onPress={() => handleDelete(item.id)}
              style={styles.miniButton}
              text="删除"
            />
          </View>
        ) : isDownloading ? (
          <View style={styles.statusRow}>
            <ThemedText style={styles.statusLabel}>已缓存{progressPercent}%</ThemedText>
            <StyledButton
              variant="default"
              onPress={() => handleCancel(item.groupId, item.index)}
              style={[styles.miniButton, { marginRight: 8 }]}
              text="暂停"
            />
            <StyledButton
              variant="ghost"
              onPress={() => handleCancel(item.groupId, item.index)}
              style={styles.miniButton}
              text="取消"
            />
          </View>
        ) : (
          <View style={styles.statusRow}>
            {item.progress !== undefined && item.progress > 0 && (
              <ThemedText style={styles.statusLabel}>暂停中 {progressPercent}%</ThemedText>
            )}
            <StyledButton
              variant="default"
              onPress={() => handleDownload(item.groupId, item.index)}
              style={styles.miniButton}
              text={item.status === 'queued' ? "等待中" : item.status === 'failed' ? "重试" : "下载"}
            />
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
            <ThemedText style={styles.subtitle}>已缓存/队列中 {episodes.length} 个项目</ThemedText>
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
    borderBottomColor: "#333",
  },
  poster: {
    width: 80,
    height: 120,
    borderRadius: 8,
    marginRight: 20,
    backgroundColor: '#1a1a1a',
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
  },
  listContent: {
    padding: 16,
  },
  episodeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  episodeText: {
    fontSize: 16,
    color: "#eee",
    flex: 1,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusLabel: {
    fontSize: 14,
    color: "#00bb5e",
    marginRight: 12,
  },
  miniButton: {
    minWidth: 70,
    height: 32,
    paddingHorizontal: 8,
  },
});
