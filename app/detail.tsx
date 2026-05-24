import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { StyledButton } from "@/components/StyledButton";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import useDetailStore from "@/stores/detailStore";
import { FontAwesome } from "@expo/vector-icons";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpDown, Zap, Info, List, Server, Cpu } from "lucide-react-native";
import { Colors } from "@/constants/Colors";
import useCacheStore from "@/stores/cacheStore";

export default function DetailScreen() {
  const { q, source, id } = useLocalSearchParams<{ q: string; source?: string; id?: string }>();
  const router = useRouter();

  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;
  const isTV = deviceType === 'tv';

  const [activeTab, setActiveTab] = useState<'episodes' | 'sources'>('episodes');

  const [isReverse, setIsReverse] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const {
    detail,
    searchResults,
    loading,
    error,
    allSourcesLoaded,
    init,
    setDetail,
    abort,
    isFavorited,
    toggleFavorite,
    optimizeSources,
  } = useDetailStore();

  const { items, queue } = useCacheStore();

  useEffect(() => {
    if (q) {
      init(q, source, id);
    }
    return () => {
      abort();
    };
  }, [abort, init, q, source, id]);

  const handlePlay = (episodeIndex: number) => {
    if (!detail) return;

    // 检查是否已有缓存
    const { isCached } = getEpCacheStatus(episodeIndex);
    const cachedItem = isCached ? items.find(it => it.episodeIndex === episodeIndex && it.title === detail.title) : null;

    abort();
    router.push({
      pathname: "/play",
      params: {
        q: detail.title,
        source: detail.source,
        id: detail.id.toString(),
        episodeIndex: episodeIndex.toString(),
        title: detail.title,
        fileUri: cachedItem?.fileUri || "", // 如果有缓存则传 fileUri
      },
    });
  };

  // 获取某集的缓存状态
  const getEpCacheStatus = (episodeIndex: number) => {
    if (!detail) return { isCached: false, isDownloading: false };
    const isCached = items.some(it => it.episodeIndex === episodeIndex && it.title === detail.title);
    const isDownloading = queue.some(g =>
      g.title === detail.title &&
      g.episodes.some(ep => ep.index === episodeIndex && ep.status !== 'completed' && ep.status !== 'failed' && ep.status !== 'cancelled')
    );
    return { isCached, isDownloading };
  };

  const handleOpenCache = () => {
    if (!detail) return;
    router.push(
      `/cache?q=${encodeURIComponent(detail.title)}&source=${encodeURIComponent(detail.source)}&id=${encodeURIComponent(detail.id.toString())}`
    );
  };

  const handleOptimize = async () => {
    setIsOptimizing(true);
    try {
      await optimizeSources();
      Alert.alert("优化完成", "已根据当前网络环境为您优选最佳线路。");
    } catch (e) {
      Alert.alert("优化失败", "测速过程中出现错误，请重试。");
    } finally {
      setIsOptimizing(false);
    }
  };

  const episodes = useMemo(() => {
    if (!detail) return [];
    const list = detail.episodes.map((url, i) => ({ index: i, url }));
    return isReverse ? list.reverse() : list;
  }, [detail, isReverse]);

  if (loading && !detail) {
    return (
      <ThemedView style={[commonStyles.container, commonStyles.center, { backgroundColor: '#151718' }]}>
        <VideoLoadingAnimation />
        {deviceType === 'tv' && (
          <TouchableOpacity focusable={true} style={{ position: 'absolute', opacity: 0 }} />
        )}
      </ThemedView>
    );
  }

  if (error && !detail) {
    return (
      <ResponsiveNavigation>
        <ResponsiveHeader title="详情" showBackButton />
        <ThemedView style={[commonStyles.safeContainer, commonStyles.center]}>
          <ThemedText type="subtitle" style={{ color: '#888' }}>{error}</ThemedText>
        </ThemedView>
      </ResponsiveNavigation>
    );
  }

  if (!detail) {
    return (
      <ResponsiveNavigation>
        <ResponsiveHeader title="详情" showBackButton />
        <ThemedView style={[commonStyles.safeContainer, commonStyles.center]}>
          <ThemedText type="subtitle" style={{ color: '#888' }}>未找到相关影片详情</ThemedText>
          <StyledButton
            text="返回重试"
            onPress={() => router.back()}
            style={{ marginTop: 20, minWidth: 120 }}
          />
        </ThemedView>
      </ResponsiveNavigation>
    );
  }

  if (!isTV) {
    return (
      <ResponsiveNavigation>
        <ResponsiveHeader
          title={detail.title}
          showBackButton
          rightElement={
            <TouchableOpacity onPress={toggleFavorite}>
              <FontAwesome name={isFavorited ? "heart" : "heart-o"} size={20} color={isFavorited ? Colors.dark.primary : "#888"} />
            </TouchableOpacity>
          }
        />
        <ThemedView style={styles.container}>
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.posterWrapper}>
              <Image source={{ uri: detail.poster }} style={styles.mainPoster} resizeMode="cover" />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)']}
                style={styles.posterGradient}
              />
              {!isTV && (
                <TouchableOpacity style={styles.cacheAction} onPress={handleOpenCache}>
                  <Info size={18} color="white" />
                  <Text style={styles.cacheText}>下载管理</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.tabSection}>
              <View style={styles.tabBar}>
                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'episodes' && styles.tabItemActive]}
                  onPress={() => setActiveTab('episodes')}
                >
                  <List size={18} color={activeTab === 'episodes' ? Colors.dark.primary : '#888'} />
                  <Text style={[styles.tabLabel, activeTab === 'episodes' && styles.tabLabelActive]}>选集</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'sources' && styles.tabItemActive]}
                  onPress={() => setActiveTab('sources')}
                >
                  <Server size={18} color={activeTab === 'sources' ? Colors.dark.primary : '#888'} />
                  <Text style={[styles.tabLabel, activeTab === 'sources' && styles.tabLabelActive]}>播放源</Text>
                </TouchableOpacity>
              </View>

              {activeTab === 'episodes' ? (
                <View style={styles.tabPane}>
                  <View style={styles.paneHeader}>
                    <Text style={styles.paneTitle}>共 {detail.episodes.length} 集</Text>
                    <TouchableOpacity onPress={() => setIsReverse(!isReverse)}>
                      <ArrowUpDown size={18} color={isReverse ? Colors.dark.primary : "#888"} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.episodeGrid}>
                    {episodes.map((ep) => {
                      const { isCached, isDownloading } = !isTV ? getEpCacheStatus(ep.index) : { isCached: false, isDownloading: false };
                      return (
                        <TouchableOpacity
                          key={ep.index}
                          style={styles.episodeBtn}
                          onPress={() => handlePlay(ep.index)}
                        >
                          <View style={[
                            styles.episodeBox,
                            isCached && styles.episodeBoxCached,
                            isDownloading && styles.episodeBoxDownloading
                          ]}>
                            <Text style={[
                              styles.episodeText,
                              (isCached || isDownloading) && { color: 'white' }
                            ]}>
                              {(ep.index + 1).toString().padStart(2, '0')}
                            </Text>
                            {!isTV && isDownloading && <View style={styles.badgeDownloading} />}
                            {!isTV && isCached && <View style={styles.badgeCached} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <View style={styles.tabPane}>
                  <View style={styles.paneHeader}>
                    <Text style={styles.paneTitle}>可用源 ({searchResults.length})</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {!allSourcesLoaded && <ActivityIndicator size="small" color={Colors.dark.primary} />}
                      <TouchableOpacity
                        onPress={handleOptimize}
                        disabled={isOptimizing}
                        style={styles.mobileOptimizeBtn}
                      >
                        <Cpu size={14} color={Colors.dark.primary} />
                        <Text style={styles.mobileOptimizeText}>{isOptimizing ? "优化中" : "一键优化"}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.sourceGrid}>
                    {searchResults.map((item, idx) => {
                      const isSelected = detail.source === item.source;
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[styles.sourceCard, isSelected && styles.sourceCardActive]}
                          onPress={() => setDetail(item)}
                        >
                          <View style={styles.sourceInfo}>
                            <Text style={[styles.sourceName, isSelected && styles.sourceNameActive]} numberOfLines={1}>{item.source_name}</Text>
                            <Text style={styles.sourceMeta}>
                              {item.episodes.length} 集 · {item.resolution || '自动'}
                              {item.latency !== undefined && item.latency !== Infinity ? ` · ${Math.round(item.latency)}ms` : ''}
                            </Text>
                          </View>
                          {isSelected && <Zap size={14} color={Colors.dark.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.descSection}>
              <Text style={styles.descTitle}>剧情简介</Text>
              <Text style={styles.descText}>{detail.desc || '暂无简介'}</Text>
              <View style={styles.metaInfo}>
                <Text style={styles.metaItem}>{detail.year}</Text>
                <Text style={styles.metaDivider}>·</Text>
                <Text style={styles.metaItem}>{detail.type_name}</Text>
              </View>
            </View>
          </ScrollView>
        </ThemedView>
      </ResponsiveNavigation>
    );
  }

  return (
    <ThemedView style={[commonStyles.container, { paddingTop: isTV ? 60 : 40 }]}>
      <ScrollView style={styles.tvScrollContainer}>
        <View style={styles.tvTopContainer}>
          <Image source={{ uri: detail.poster }} style={styles.tvPoster} />
          <View style={styles.tvInfoContainer}>
            <View style={styles.tvTitleRow}>
              <ThemedText style={styles.tvTitle}>{detail.title}</ThemedText>
              <StyledButton onPress={toggleFavorite} variant="ghost">
                <FontAwesome name={isFavorited ? "heart" : "heart-o"} size={24} color={isFavorited ? "#feff5f" : "#ccc"} />
              </StyledButton>
            </View>
            <ThemedText style={styles.tvMeta}>{detail.year} · {detail.type_name}</ThemedText>
            <ScrollView style={{ height: 120, marginTop: 10 }}>
              <ThemedText style={styles.tvDesc}>{detail.desc}</ThemedText>
            </ScrollView>
          </View>
        </View>
        <View style={styles.tvBottomContainer}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText style={styles.tvSectionTitle}>播放源 ({searchResults.length})</ThemedText>
            <StyledButton
              onPress={handleOptimize}
              disabled={isOptimizing}
              variant="ghost"
              style={styles.optimizeBtn}
            >
              <Cpu size={16} color={Colors.dark.primary} />
              <Text style={styles.optimizeText}>{isOptimizing ? "优化中..." : "线路优化"}</Text>
            </StyledButton>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tvSourceList}>
            {searchResults.map((item, index) => (
              <StyledButton
                key={index}
                onPress={() => setDetail(item)}
                isSelected={detail.source === item.source}
                style={styles.tvSourceBtn}
              >
                <Text style={styles.tvSourceBtnText}>{item.source_name}</Text>
              </StyledButton>
            ))}
          </ScrollView>
          <ThemedText style={styles.tvSectionTitle}>选集</ThemedText>
          <View style={styles.tvEpisodeGrid}>
            {detail.episodes.map((_, index) => {
              const { isCached, isDownloading } = !isTV ? getEpCacheStatus(index) : { isCached: false, isDownloading: false };
              let btnStyle = styles.tvEpisodeBtn;
              if (isDownloading) btnStyle = { ...btnStyle, backgroundColor: 'rgba(244,67,54,0.3)' };
              else if (isCached) btnStyle = { ...btnStyle, backgroundColor: 'rgba(33,150,243,0.3)' };

              return (
                <StyledButton
                  key={index}
                  onPress={() => handlePlay(index)}
                  style={btnStyle}
                >
                  <View style={{ position: 'relative' }}>
                    <Text style={styles.tvSourceBtnText}>{`第 ${index + 1} 集`}</Text>
                    {!isTV && isDownloading && <View style={styles.badgeDownloading} />}
                    {!isTV && isCached && <View style={styles.badgeCached} />}
                  </View>
                </StyledButton>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );

}

const styles = StyleSheet.create({
  tvScrollContainer: { flex: 1, padding: 20 },
  tvTopContainer: { flexDirection: 'row', marginBottom: 30 },
  tvPoster: { width: 200, height: 300, borderRadius: 10 },
  tvInfoContainer: { flex: 1, marginLeft: 30 },
  tvTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tvTitle: { fontSize: 32, fontWeight: 'bold', color: 'white', lineHeight: 42 },
  tvMeta: { fontSize: 18, color: '#aaa', marginTop: 10, lineHeight: 24 },
  tvDesc: { fontSize: 16, color: '#ccc', lineHeight: 26 },
  tvBottomContainer: { marginTop: 20 },
  tvSectionTitle: { fontSize: 24, fontWeight: 'bold', color: 'white', lineHeight: 32, marginVertical: 8 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  optimizeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0, 187, 94, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  optimizeText: { color: Colors.dark.primary, fontSize: 14, fontWeight: 'bold' },
  tvSourceList: { marginBottom: 20 },
  tvSourceBtn: { marginRight: 15, minWidth: 120 },
  tvSourceBtnText: { fontSize: 18, color: 'white', lineHeight: 24 },
  tvEpisodeGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  tvEpisodeBtn: { margin: 10, minWidth: 100 },

  container: { flex: 1, backgroundColor: '#151718' },
  content: { flex: 1 },
  posterWrapper: { width: '100%', height: 240, position: 'relative', backgroundColor: '#151718' },
  mainPoster: { width: '100%', height: '100%', opacity: 0.6 },
  posterGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 100 },
  cacheAction: { position: 'absolute', bottom: 16, right: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
  cacheText: { color: 'white', fontSize: 12, fontWeight: '600' },
  tabSection: { backgroundColor: '#151718', marginTop: -10, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  tabBar: { flexDirection: 'row', height: 50, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: Colors.dark.primary },
  tabLabel: { fontSize: 15, color: '#888', fontWeight: '600' },
  tabLabelActive: { color: Colors.dark.primary },
  tabPane: { padding: 16 },
  paneHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  paneTitle: { color: '#888', fontSize: 13 },
  mobileOptimizeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0, 187, 94, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  episodeBoxCached: {
    borderColor: '#2196F3',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
  },
  episodeBoxDownloading: {
    borderColor: '#F44336',
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
  },
  badgeDownloading: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F44336',
  },
  badgeCached: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2196F3',
  },
  mobileOptimizeText: { color: Colors.dark.primary, fontSize: 11, fontWeight: 'bold' },
  episodeGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  episodeBtn: { width: '20%', aspectRatio: 1, padding: 4 },
  episodeBox: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  episodeText: { color: '#eee', fontSize: 15, fontWeight: 'bold' },
  sourceGrid: { gap: 10 },
  sourceCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  sourceCardActive: { borderColor: Colors.dark.primary, backgroundColor: 'rgba(0, 187, 94, 0.05)' },
  sourceInfo: { flex: 1 },
  sourceName: { color: '#ccc', fontSize: 14, fontWeight: '600' },
  sourceNameActive: { color: 'white' },
  sourceMeta: { color: '#666', fontSize: 11, marginTop: 2 },
  descSection: { padding: 16, borderTopWidth: 8, borderTopColor: '#1a1a1a' },
  descTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  descText: { color: '#888', fontSize: 14, lineHeight: 22 },
  metaInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  metaItem: { color: '#555', fontSize: 12 },
  metaDivider: { color: '#333' },
});
