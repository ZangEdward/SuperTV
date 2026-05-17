import React, { useMemo } from "react";
import { View, StyleSheet, Image, ScrollView, FlatList } from "react-native";
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
  const { items, queue, downloadProgress, currentDownloadId, downloadQueuedEpisode, removeCacheItem, cancelQueuedEpisode } = useCacheStore();

  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  const movieInfo = useMemo(() => {
    const queuedGroup = queue.find((g) => g.title === title);
    if (queuedGroup) return { title: queuedGroup.title, poster: queuedGroup.poster };

    const cachedItem = items.find((it) => it.title === title);
    if (cachedItem) return { title: cachedItem.title, poster: cachedItem.poster };

    return { title: title || "未知影片", poster: undefined };
  }, [items, queue, title]);

  const episodes = useMemo(() => {
    const list: { index: number; status: string; progress?: number; fileUri?: string; groupId?: string; url?: string }[] = [];

    // Check queue
    queue.filter(g => g.title === title).forEach(group => {
      group.episodes.forEach(ep => {
        const itemId = `${group.source}_${group.id}_${ep.index}`;
        list.push({
          index: ep.index,
          status: ep.status,
          progress: downloadProgress?.[itemId] ?? ep.progress ?? 0,
          groupId: group.groupId,
          url: ep.url
        });
      });
    });

    // Check cached items
    items.filter(it => it.title === title).forEach(it => {
      // If already in list (from queue), update it to completed if needed
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
          fileUri: it.fileUri
        });
      }
    });

    return list.sort((a, b) => a.index - b.index);
  }, [items, queue, title, downloadProgress]);

  const handlePlay = (fileUri: string, epTitle: string) => {
    router.push(`/play?title=${encodeURIComponent(title + " " + epTitle)}&fileUri=${encodeURIComponent(fileUri)}`);
  };

  const handleExport = async (fileUri: string, epTitle: string) => {
    try {
      Toast.show({ type: "info", text1: "开始导出", text2: "正在保存到相册..." });
      const result = await CacheService.saveToPublicStorage(fileUri);
      if (result) {
        Toast.show({ type: "success", text1: "导出成功", text2: `已保存 ${title} ${epTitle}` });
      } else {
        Toast.show({ type: "error", text1: "导出失败", text2: "无法保存到本地" });
      }
    } catch (err) {
      Toast.show({ type: "error", text1: "导出错误", text2: String(err) });
    }
  };

  const handleDelete = async (index: number) => {
    const itemToDelete = items.find(it => it.title === title && it.episodeIndex === index);
    if (itemToDelete) {
      await removeCacheItem(itemToDelete.id);
    }
  };

  const handleCancel = async (groupId?: string, index?: number) => {
    if (groupId !== undefined && index !== undefined) {
      await cancelQueuedEpisode(groupId, index);
    }
  };

  const renderEpisodeItem = ({ item }: { item: typeof episodes[0] }) => {
    const epTitle = `第 ${item.index + 1} 集`;
    const progressPercent = Math.round((item.progress || 0) * 100);
    const isDownloading = item.status === 'downloading' || (item.progress !== undefined && item.progress > 0 && item.progress < 1);

    return (
      <View style={styles.episodeRow}>
        <ThemedText style={styles.episodeText}>{epTitle}</ThemedText>

        {item.status === 'completed' ? (
          <View style={styles.statusRow}>
            <ThemedText style={styles.statusLabel}>已完成</ThemedText>
            <StyledButton
              variant="primary"
              onPress={() => item.fileUri && handlePlay(item.fileUri, epTitle)}
              style={[styles.miniButton, { marginRight: 8 }]}
              text="播放"
            />
            <StyledButton
              variant="ghost"
              onPress={() => handleDelete(item.index)}
              style={styles.miniButton}
              text="删除"
            />
          </View>
        ) : isDownloading ? (
          <View style={styles.statusRow}>
            <ThemedText style={styles.statusLabel}>缓存进度 {progressPercent}%</ThemedText>
            <StyledButton
              variant="ghost"
              onPress={() => handleCancel(item.groupId, item.index)}
              style={styles.miniButton}
              text="取消下载"
            />
          </View>
        ) : (
          <StyledButton
            variant="default"
            onPress={() => handleDownload(item.groupId, item.index)}
            style={styles.miniButton}
            text={item.status === 'queued' ? "等待中" : item.status === 'failed' ? "重试" : "下载"}
          />
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
          keyExtractor={(item) => item.index.toString()}
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
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "white",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#aaa",
  },
  listContent: {
    padding: 16,
  },
  episodeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
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
    color: "#aaa",
    marginRight: 12,
  },
  miniButton: {
    minWidth: 80,
    height: 32,
    paddingHorizontal: 12,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "white",
    marginLeft: 8,
    fontSize: 14,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: 120,
  },
  progressBarBackground: {
    flex: 1,
    height: 6,
    backgroundColor: "#333",
    borderRadius: 3,
    overflow: "hidden",
    marginRight: 10,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#00bb5e",
  },
  progressText: {
    fontSize: 12,
    color: "#00bb5e",
    width: 35,
    textAlign: "right",
  },
});
