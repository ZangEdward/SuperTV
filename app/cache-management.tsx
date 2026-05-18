import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Image, ScrollView, TouchableOpacity, Alert } from "react-native";
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
  const cacheStore = useCacheStore();
  const { items, loadCache, concurrency, setConcurrency, removeCacheItem, cancelQueuedEpisode } = cacheStore;
  const { queue, downloadProgress, currentDownloadId } = cacheStore;
  const [concurrencyOpen, setConcurrencyOpen] = React.useState(false);
  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { spacing } = responsiveConfig;

  useEffect(() => {
    loadCache();
    // 增加轮询：每5秒加载一次缓存列表以更新最新状态
    const timer = setInterval(() => {
      loadCache();
    }, 5000);
    return () => clearInterval(timer);
  }, [loadCache]);

  const combinedCollections = useMemo(() => {
    const map = new Map<string, { title: string; poster: string }>();
    queue.forEach((g) => {
      if (!map.has(g.title)) map.set(g.title, { title: g.title, poster: g.poster });
    });
    items.forEach((it) => {
      if (!map.has(it.title)) map.set(it.title, { title: it.title, poster: it.poster });
    });
    return Array.from(map.values());
  }, [items, queue]);

  const openCollectionDetail = (title?: string) => {
    if (!title) return;
    router.push({
      pathname: "/cache-detail",
      params: { title }
    });
  };

  /** 长按删除整部剧集的所有缓存文件 */
  const handleLongPressDeleteSeries = (title: string) => {
    Alert.alert(
      '删除整部剧集',
      `确定要删除「${title}」的所有缓存文件吗？此操作不可恢复。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除全部',
          style: 'destructive',
          onPress: async () => {
            // 删除 AsyncStorage 中该标题的所有缓存记录
            const allItems = [...items];
            const seriesItems = allItems.filter(it => it.title === title);
            for (const item of seriesItems) {
              await removeCacheItem(item.id);
            }
            // 删除队列中的任务
            const allQueue = [...queue];
            const seriesQueue = allQueue.filter(g => g.title === title);
            for (const group of seriesQueue) {
              // 取消队列中所有下载
              for (const ep of group.episodes) {
                await cancelQueuedEpisode(group.groupId, ep.index);
              }
            }
            await loadCache();
          },
        },
      ]
    );
  };

  const queuedCount = React.useMemo(
    () => queue.reduce((count, group) => count + group.episodes.filter((ep) => ep.status === 'queued' || ep.status === 'pending' || ep.status === 'downloading').length, 0),
    [queue]
  );

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="缓存管理" showBackButton />
      <ThemedView style={[commonStyles.container, styles.container, { padding: spacing }]}> 
        {/* 并发设置 */}
        <View style={[styles.concurrencyContainer, { marginBottom: spacing }]}> 
          <TouchableOpacity
            style={styles.concurrencySelector}
            onPress={() => setConcurrencyOpen((open) => !open)}
          >
            <ThemedText style={styles.concurrencyLabel}>并发下载：当前并发下载数</ThemedText>
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
        </View>
        {/* 下载列表 */}
        <View style={{ marginBottom: spacing }}>
          <View style={styles.headerRow}>
            <ThemedText style={styles.title}>下载列表</ThemedText>
            <ThemedText style={styles.headerCount}>
              队列中 {queuedCount} 集，已完成 {items.length} 集
            </ThemedText>
          </View>

          <ScrollView>
            {combinedCollections.length === 0 ? (
              <View style={styles.emptyBox}>
                <ThemedText type="subtitle">暂无缓存内容</ThemedText>
              </View>
            ) : (
              <View style={styles.grid}>
                {combinedCollections.map((c) => (
                  <View key={c.title} style={styles.posterCard}>
                    <TouchableOpacity
                      onPress={() => openCollectionDetail(c.title)}
                      onLongPress={() => handleLongPressDeleteSeries(c.title)}
                      delayLongPress={600}
                    >
                      <Image source={{ uri: c.poster }} style={styles.posterLarge} />
                      <ThemedText style={styles.posterTitle} numberOfLines={2}>{c.title}</ThemedText>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </ThemedView>
    </ResponsiveNavigation>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerCount: {
    color: '#aaa',
    fontSize: 14,
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
});
