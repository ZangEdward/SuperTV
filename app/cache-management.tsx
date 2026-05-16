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
                  <View style={styles.actions}>
                    <StyledButton
                      text="播放"
                      variant="primary"
                      onPress={() => handlePlayCached(item.fileUri, item.title)}
                      style={styles.actionButton}
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
