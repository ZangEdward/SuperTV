import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, StyleSheet, Image, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Text } from "react-native";
import { useRouter } from "expo-router";
import useCacheStore from "@/stores/cacheStore";
import { CacheService } from "@/services/cacheService";
import { PlayRecordManager } from "@/services/storage";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { StyledButton } from "@/components/StyledButton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";
import Toast from "react-native-toast-message";
import { Ionicons } from "@expo/vector-icons";

function PosterPlaceholder({ title, size }: { title: string; size: number }) {
  const initial = title ? title.charAt(0).toUpperCase() : "?";
  const colors = ["#4A90D9", "#7B68EE", "#E91E63", "#FF9800", "#4CAF50", "#00BCD4"];
  const colorIndex =
    title
      .split("")
      .reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    colors.length;
  return (
    <View
      style={[
        {
          width: size,
          height: size * 1.5,
          borderRadius: 8,
          backgroundColor: colors[colorIndex],
          justifyContent: "center",
          alignItems: "center",
        },
      ]}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.4, fontWeight: "bold" }}>{initial}</Text>
    </View>
  );
}

export default function CacheManagementScreen() {
  const router = useRouter();
  const cacheStore = useCacheStore();
  const {
    items,
    loadCache,
    concurrency,
    setConcurrency,
    removeSeries,
    clearCache,
    queue,
    loading,
    error,
  } = cacheStore;
  const [concurrencyOpen, setConcurrencyOpen] = useState(false);
  const responsiveConfig = useResponsiveLayout();
  const { deviceType, spacing } = responsiveConfig;
  const isMobile = deviceType === "mobile";
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const [cacheSize, setCacheSize] = useState<string>("0 MB");
  const [clearing, setClearing] = useState(false);
  const [deletingTitle, setDeletingTitle] = useState<string | null>(null);

  const calculateCacheSize = useCallback(async () => {
    try {
      const totalSize = await CacheService.calculateCacheSize();
      setCacheSize(CacheService.formatBytes(totalSize));
    } catch (e) {
      console.warn("计算缓存大小失败:", e);
    }
  }, []);

  // 初始加载及轮询
  useEffect(() => {
    loadCache();
    calculateCacheSize();
    const timer = setInterval(() => {
      loadCache();
      calculateCacheSize();
    }, 5000);
    return () => clearInterval(timer);
  }, [loadCache, calculateCacheSize]);

  // 合并队列和已下载项去重，仅过滤掉title完全为空的情况
  const combinedCollections = useMemo(() => {
    const map = new Map<string, { title: string; poster: string }>();
    queue.forEach((g) => {
      if (g.title && g.title.trim() !== "" && !map.has(g.title)) {
        map.set(g.title, { title: g.title, poster: g.poster || "" });
      }
    });
    items.forEach((it) => {
      if (it.title && it.title.trim() !== "" && !map.has(it.title)) {
        map.set(it.title, { title: it.title, poster: it.poster || "" });
      }
    });
    return Array.from(map.values());
  }, [items, queue]);

  // 统计计数
  const queuedCount = useMemo(
    () =>
      queue.reduce(
        (count, group) =>
          count +
          group.episodes.filter(
            (ep) =>
              ep.status === "queued" || ep.status === "pending" || ep.status === "downloading"
          ).length,
        0
      ),
    [queue]
  );
  const completedCount = useMemo(() => items.length, [items]);

  const openCollectionDetail = (title?: string) => {
    if (!title) return;
    router.push({
      pathname: "/cache-detail",
      params: { title },
    });
  };

  const handleLongPressDeleteSeries = (title: string) => {
    Alert.alert("删除整部剧集", `确定要删除「${title}」的所有缓存文件吗？此操作不可恢复。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除全部",
        style: "destructive",
        onPress: async () => {
          setDeletingTitle(title);
          try {
            await removeSeries(title);
            await loadCache();
            await calculateCacheSize();
          } finally {
            setDeletingTitle(null);
          }
        },
      },
    ]);
  };

  const handleClearCache = () => {
    Alert.alert("清除缓存", "确定要清除已下载的缓存视频吗？此操作不可撤销。", [
      { text: "取消", style: "cancel" },
      {
        text: "确定",
        onPress: async () => {
          setClearing(true);
          try {
            await clearCache();
            await calculateCacheSize();
          } catch (e) {
            Alert.alert("错误", "清理缓存失败");
          } finally {
            setClearing(false);
          }
        },
      },
    ]);
  };

  const handleClearHistory = () => {
    Alert.alert("清除播放记录", "确定要清除所有播放历史吗？此操作不可撤销。", [
      { text: "取消", style: "cancel" },
      {
        text: "确定",
        onPress: async () => {
          setClearing(true);
          try {
            await PlayRecordManager.clearAll();
            Toast.show({ type: "success", text1: "播放历史已清除" });
          } catch (e) {
            Alert.alert("错误", "清理失败");
          } finally {
            setClearing(false);
          }
        },
      },
    ]);
  };

  const renderPosterCard = (c: { title: string; poster: string }) => {
    const posterSize = isMobile ? 110 : 140;
    const hasValidPoster = c.poster && c.poster.startsWith("http");
    const isDeleting = deletingTitle === c.title;
    return (
      <TouchableOpacity
        key={c.title}
        style={[styles.posterCard, { width: posterSize }]}
        onPress={() => openCollectionDetail(c.title)}
        onLongPress={() => handleLongPressDeleteSeries(c.title)}
        delayLongPress={600}
        activeOpacity={0.7}
        disabled={isDeleting}
      >
        {isDeleting ? (
          <View
            style={[
              styles.posterImage,
              { width: posterSize, height: posterSize * 1.5, justifyContent: 'center', alignItems: 'center', backgroundColor: '#222' },
            ]}
          >
            <ActivityIndicator size="large" color="#00bb5e" />
          </View>
        ) : hasValidPoster ? (
          <Image
            source={{ uri: api.getImageProxyUrl(c.poster) }}
            style={[
              styles.posterImage,
              { width: posterSize, height: posterSize * 1.5 },
            ]}
          />
        ) : (
          <PosterPlaceholder title={c.title} size={posterSize} />
        )}
        <ThemedText style={styles.posterTitle} numberOfLines={2}>
          {c.title}
        </ThemedText>
      </TouchableOpacity>
    );
  };

  // 主体渲染
  const renderContent = () => {
    // 加载中
    if (loading && items.length === 0 && queue.length === 0) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#888" />
          <ThemedText style={{ marginTop: 12, color: "#888" }}>加载缓存数据...</ThemedText>
        </View>
      );
    }

    // 错误状态
    if (error && items.length === 0 && queue.length === 0) {
      return (
        <View style={styles.centerBox}>
          <ThemedText style={{ color: "#ff4d4f", marginBottom: 12 }}>加载失败：{error}</ThemedText>
          <StyledButton text="重试" onPress={loadCache} />
        </View>
      );
    }

    return (
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* —— 操作栏：全部暂停（图标）+ 全部启动（图标）+ 并发下载 —— */}
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => cacheStore.pauseAll()}
          >
            <Ionicons name="pause-circle" size={32} color="#ffaa00" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => cacheStore.resumeAll()}
          >
            <Ionicons name="play-circle" size={32} color="#4CAF50" />
          </TouchableOpacity>

          {/* 并发下载数 - 放在同一排 */}
          <View style={styles.concurrencyContainer}>
            <ThemedText style={styles.concurrencyLabel}>并发：</ThemedText>
            <TouchableOpacity
              style={styles.concurrencyPicker}
              onPress={() => setConcurrencyOpen((prev) => !prev)}
            >
              <ThemedText style={styles.concurrencyValue}>{concurrency}</ThemedText>
              <Ionicons
                name={concurrencyOpen ? "chevron-up" : "chevron-down"}
                size={16}
                color="#aaa"
              />
            </TouchableOpacity>
            {concurrencyOpen && (
              <View style={styles.concurrencyDropdown}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[
                      styles.dropdownItem,
                      val === concurrency && styles.dropdownItemActive,
                    ]}
                    onPress={() => {
                      setConcurrency(val);
                      setConcurrencyOpen(false);
                    }}
                  >
                    <ThemedText
                      style={[
                        styles.dropdownItemText,
                        val === concurrency && styles.dropdownItemTextActive,
                      ]}
                    >
                      {val}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* —— 下载列表标题 + 计数 —— */}
        <View style={styles.listHeader}>
          <ThemedText style={styles.listTitle}>下载列表</ThemedText>
          <ThemedText style={styles.listCount}>
            队列中 {queuedCount} 集，已完成 {completedCount} 集
          </ThemedText>
        </View>

        {/* —— 海报网格 —— */}
        {combinedCollections.length === 0 ? (
          <View style={styles.centerBox}>
            <ThemedText type="subtitle">暂无缓存内容</ThemedText>
            <ThemedText style={{ color: "#666", marginTop: 8 }}>
              去详情页选择剧集进行缓存
            </ThemedText>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {combinedCollections.map((c) => renderPosterCard(c))}
          </View>
        )}

        {/* —— 底部：存储管理 —— */}
        <View style={styles.footerSection}>
          <ThemedText style={styles.sectionTitle}>存储管理</ThemedText>

          <View style={styles.storageRow}>
            <View style={styles.storageInfo}>
              <ThemedText style={styles.storageLabel}>已下载视频占用</ThemedText>
              <ThemedText style={styles.storageValue}>{cacheSize}</ThemedText>
            </View>
            <StyledButton
              onPress={handleClearCache}
              disabled={clearing}
              variant="ghost"
              style={styles.clearButton}
            >
              {clearing ? (
                <ActivityIndicator size="small" color="#ff4d4f" />
              ) : (
                <ThemedText style={{ color: "#ff4d4f", fontWeight: "bold" }}>
                  清除
                </ThemedText>
              )}
            </StyledButton>
          </View>

          <View style={[styles.storageRow, { marginTop: 12 }]}>
            <View style={styles.storageInfo}>
              <ThemedText style={styles.storageLabel}>播放历史记录</ThemedText>
              <ThemedText style={styles.storageSubtitle}>
                清除所有视频的观看进度
              </ThemedText>
            </View>
            <StyledButton
              onPress={handleClearHistory}
              disabled={clearing}
              variant="ghost"
              style={styles.clearButton}
            >
              <ThemedText style={{ color: "#ff4d4f", fontWeight: "bold" }}>
                清除
              </ThemedText>
            </StyledButton>
          </View>
        </View>
      </ScrollView>
    );
  };

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="缓存管理" showBackButton />
      <ThemedView style={[commonStyles.container, styles.container, { padding: spacing }]}>
        {renderContent()}
      </ThemedView>
    </ResponsiveNavigation>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  // ---- 操作栏 ----
  actionBar: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 8,
    alignItems: "center",
  },
  actionButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  // ---- 并发选择器（内嵌在操作栏中） ----
  concurrencyContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1d1d1d",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: "relative",
    zIndex: 10,
    height: 52,
  },
  concurrencyLabel: {
    fontSize: 13,
    color: "#ccc",
    marginRight: 4,
  },
  concurrencyPicker: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  concurrencyValue: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#fff",
    minWidth: 18,
    textAlign: "center",
  },
  concurrencyDropdown: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3a3a3c",
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 8,
    gap: 6,
    zIndex: 100,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  dropdownItem: {
    width: "18%",
    aspectRatio: 1.5,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  dropdownItemActive: {
    backgroundColor: "#4A90D9",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#ccc",
    fontWeight: "500",
  },
  dropdownItemTextActive: {
    color: "#fff",
    fontWeight: "bold",
  },
  // ---- 列表标题 ----
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  listTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#fff",
  },
  listCount: {
    fontSize: 13,
    color: "#aaa",
  },
  // ---- 海报网格 ----
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 12,
  },
  posterCard: {
    alignItems: "center",
    marginRight: 8,
    marginBottom: 8,
  },
  posterImage: {
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
  },
  posterTitle: {
    fontSize: 12,
    color: "#ddd",
    marginTop: 4,
    textAlign: "center",
    width: "100%",
  },
  // ---- 存储管理 ----
  footerSection: {
    marginTop: 32,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    marginBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    color: "#fff",
  },
  storageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
    borderRadius: 10,
  },
  storageInfo: {
    flex: 1,
  },
  storageLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#eee",
  },
  storageValue: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  storageSubtitle: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  clearButton: {
    minWidth: 80,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },
});