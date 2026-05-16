import React, { useEffect } from "react";
import { View, StyleSheet, Image, ScrollView, TouchableOpacity } from "react-native";
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
  const { items, loadCache, removeCacheItem, loading } = useCacheStore();
  const { queue, downloadQueuedEpisode, cancelQueuedEpisode, cancelGroup, downloadProgress, currentDownloadId } = useCacheStore();
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});
  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { spacing } = responsiveConfig;

  useEffect(() => {
    loadCache();
  }, [loadCache]);

  const handlePlayCached = (fileUri: string, title: string) => {
    router.push(`/play?title=${encodeURIComponent(title)}&fileUri=${encodeURIComponent(fileUri)}`);
  };

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="缓存管理" showBackButton />
      <ThemedView style={[commonStyles.container, styles.container, { padding: spacing }]}> 
        {/* 下载队列 */}
        <View style={{ marginBottom: spacing }}>
          <ThemedText style={[styles.title, { marginBottom: 8 }]}>下载列表</ThemedText>
          {queue.length === 0 ? (
            <ThemedText type="subtitle">下载列表为空</ThemedText>
          ) : (
            queue.map((g) => (
              <View key={g.groupId} style={[styles.card, { marginBottom: 8 }]}> 
                <TouchableOpacity onPress={() => setExpandedGroups((s) => ({ ...s, [g.groupId]: !s[g.groupId] }))}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Image source={{ uri: g.poster }} style={{ width: 80, height: 100, borderRadius: 6, margin: 10 }} />
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.title}>{g.title}</ThemedText>
                      <ThemedText style={styles.meta}>{g.episodes.length} 集待处理</ThemedText>
                    </View>
                    <View style={{ paddingRight: 12 }}>
                      <StyledButton text={expandedGroups[g.groupId] ? '收起' : '展开'} onPress={() => setExpandedGroups((s) => ({ ...s, [g.groupId]: !s[g.groupId] }))} />
                    </View>
                    <View style={{ paddingRight: 8 }}>
                      <StyledButton text="取消分组" variant="ghost" onPress={() => cancelGroup(g.groupId)} />
                    </View>
                  </View>
                </TouchableOpacity>
                {expandedGroups[g.groupId] && (
                  <View style={{ padding: 12 }}>
                    {g.episodes.map((ep) => (
                      <View key={ep.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <ThemedText style={{ flex: 1 }}>第 {ep.index + 1} 集</ThemedText>
                        {ep.status === 'downloading' || (downloadProgress && downloadProgress[`${g.source}_${g.id}_${ep.index}`]) ? (
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <View style={styles.progressBarBackground}>
                              <View style={[styles.progressBarFill, { width: `${Math.round((ep.progress || downloadProgress[`${g.source}_${g.id}_${ep.index}`] || 0) * 100)}%` }]} />
                            </View>
                          </View>
                        ) : null}
                        <View style={{ width: 120, flexDirection: 'row' }}>
                          <StyledButton text="下载" onPress={() => downloadQueuedEpisode(g.groupId, ep.index)} disabled={ep.status === 'downloading' || ep.status === 'completed' || currentDownloadId === `${g.source}_${g.id}_${ep.index}`} style={{ marginRight: 6 }} />
                          <StyledButton text="取消" variant="ghost" onPress={() => cancelQueuedEpisode(g.groupId, ep.index)} />
                        </View>
                      </View>
                    ))}
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
            items.map((item) => (
              <View key={item.id} style={[styles.card, { marginBottom: spacing }]}> 
                <TouchableOpacity onPress={() => handlePlayCached(item.fileUri, item.title)}>
                  <Image source={{ uri: item.poster }} style={styles.poster} />
                </TouchableOpacity>
                <View style={styles.content}>
                  <ThemedText style={styles.title} numberOfLines={2}>{item.title}</ThemedText>
                  <ThemedText style={styles.meta}>{item.source_name} · 第 {item.episodeIndex + 1} 集</ThemedText>
                  <ThemedText style={styles.meta}>已缓存 {item.totalEpisodes} 集</ThemedText>
                  {downloadProgress && downloadProgress[item.id] != null && downloadProgress[item.id] < 1 ? (
                    <View style={styles.progressWrap}>
                      <View style={styles.progressBarBackground}>
                        <View style={[styles.progressBarFill, { width: `${Math.round((downloadProgress[item.id] || 0) * 100)}%` }]} />
                      </View>
                      <ThemedText style={styles.progressText}>{Math.round((downloadProgress[item.id] || 0) * 100)}%</ThemedText>
                    </View>
                  ) : null}
                  <View style={styles.actions}>
                    <StyledButton
                      text="播放"
                      variant="primary"
                      onPress={() => handlePlayCached(item.fileUri, item.title)}
                      style={styles.actionButton}
                      disabled={currentDownloadId === item.id}
                    />
                    <StyledButton
                      text="删除"
                      variant="ghost"
                      onPress={() => removeCacheItem(item.id)}
                      style={styles.actionButton}
                    />
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
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
  progressText: {
    color: '#ddd',
    fontSize: 12,
    minWidth: 36,
    textAlign: 'right',
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
});
