import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator, TouchableOpacity, Dimensions } from "react-native";
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
import { Settings2, ArrowUpDown, Sun, User, Play, Info, Layers, Zap, Clock, CheckCircle2 } from "lucide-react-native";

export default function DetailScreen() {
  const { q, source, id } = useLocalSearchParams<{ q: string; source?: string; id?: string }>();
  const router = useRouter();

  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  const [activeTab, setActiveTab] = useState<'episodes' | 'sources'>('episodes');
  const [isReverse, setIsReverse] = useState(false);
  const [sortType, setSortType] = useState<'original' | 'speed' | 'name'>('original');
  const [showAllSources, setShowAllSources] = useState(false);

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
  } = useDetailStore();

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
    abort();
    router.push({
      pathname: "/play",
      params: {
        q: detail.title,
        source: detail.source,
        id: detail.id.toString(),
        episodeIndex: episodeIndex.toString(),
      },
    });
  };

  const handleOpenCache = () => {
    if (!detail) return;
    router.push(
      `/cache?q=${encodeURIComponent(detail.title)}&source=${encodeURIComponent(detail.source)}&id=${encodeURIComponent(detail.id.toString())}`
    );
  };

  const episodes = useMemo(() => {
    if (!detail) return [];
    const list = [...detail.episodes];
    return isReverse ? list.reverse() : list;
  }, [detail, isReverse]);

  const sortedSources = useMemo(() => {
    const list = [...searchResults];
    if (sortType === 'speed') {
      return list.sort((a, b) => (a.latency || 9999) - (b.latency || 9999));
    } else if (sortType === 'name') {
      return list.sort((a, b) => a.source_name.localeCompare(b.source_name));
    }
    return list;
  }, [searchResults, sortType]);

  if (loading && !detail) {
    return <VideoLoadingAnimation showProgressBar={false} />;
  }

  if (error && !detail) {
    const errorContent = (
      <ThemedView style={[commonStyles.safeContainer, commonStyles.center]}>
        <ThemedText type="subtitle">{error}</ThemedText>
      </ThemedView>
    );
    if (deviceType === 'tv') return errorContent;
    return (
      <ResponsiveNavigation>
        <ResponsiveHeader title="详情" showBackButton />
        {errorContent}
      </ResponsiveNavigation>
    );
  }

  if (!detail) return null;

  // TV Layout
  if (deviceType === 'tv') {
    return (
      <ThemedView style={[commonStyles.container, { paddingTop: 40 }]}>
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
            <ThemedText style={styles.tvSectionTitle}>播放源 ({searchResults.length})</ThemedText>
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
              {detail.episodes.map((_, index) => (
                <StyledButton
                  key={index}
                  onPress={() => handlePlay(index)}
                  style={styles.tvEpisodeBtn}
                  text={`第 ${index + 1} 集`}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  // Mobile Layout (LunaTV Inspired)
  return (
    <ThemedView style={styles.container}>
      <View style={styles.customHeader}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerTitle}>SuperTV</Text>
        </TouchableOpacity>
        <View style={styles.headerIcons}>
          <Sun size={24} color="white" style={{ marginRight: 20 }} />
          <User size={24} color="white" />
        </View>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.previewContainer}>
          <Image source={{ uri: detail.poster }} style={styles.previewImage} resizeMode="cover" />
          <TouchableOpacity style={styles.settingsIcon} onPress={handleOpenCache}>
            <Settings2 size={20} color="white" />
          </TouchableOpacity>
        </View>

        <View style={styles.mainCard}>
          <View style={styles.tabsHeader}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'episodes' && styles.tabBtnActive]}
              onPress={() => setActiveTab('episodes')}
            >
              <ThemedText style={[styles.tabText, activeTab === 'episodes' && styles.tabTextActive]}>选集</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'sources' && styles.tabBtnActive]}
              onPress={() => setActiveTab('sources')}
            >
              <ThemedText style={[styles.tabText, activeTab === 'sources' && styles.tabTextActive]}>换源</ThemedText>
            </TouchableOpacity>
          </View>

          {activeTab === 'episodes' ? (
            <View style={styles.tabContent}>
              <View style={styles.filterRow}>
                <TouchableOpacity style={styles.rangeSelector}>
                  <ThemedText style={styles.rangeText}>1-{detail.episodes.length}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsReverse(!isReverse)}>
                  <ArrowUpDown size={20} color={isReverse ? "#00bb5e" : "#aaa"} />
                </TouchableOpacity>
              </View>
              <View style={styles.episodeGrid}>
                {episodes.map((_, index) => {
                  const actualIndex = isReverse ? detail.episodes.length - 1 - index : index;
                  return (
                    <TouchableOpacity key={index} style={styles.episodeItem} onPress={() => handlePlay(actualIndex)}>
                      <LinearGradient
                        colors={['#00bb5e', '#009a4d']}
                        style={styles.episodeGradient}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      >
                        <Text style={styles.episodeText}>{(actualIndex + 1).toString().padStart(2, '0')}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.tabContent}>
              <View style={styles.sourceActions}>
                <TouchableOpacity style={styles.speedTestBtn}>
                  <Zap size={16} color="#00bb5e" />
                  <Text style={styles.speedTestText}>视频源测速</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.speedTestBtn, { backgroundColor: '#1a73e8' }]}>
                  <CheckCircle2 size={16} color="white" />
                  <Text style={[styles.speedTestText, { color: 'white' }]}>手动测速</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>排序：</Text>
                <View style={styles.sortOptions}>
                  {(['original', 'speed', 'name'] as const).map((type) => (
                    <TouchableOpacity key={type} onPress={() => setSortType(type)} style={[styles.sortBtn, sortType === type && styles.sortBtnActive]}>
                      <Text style={[styles.sortBtnText, sortType === type && styles.sortBtnTextActive]}>{type === 'original' ? '原始' : type === 'speed' ? '速度' : '名称'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.fastFirst}><Zap size={14} color="#fbc02d" /><Text style={styles.fastFirstText}>最快优先</Text></View>
              </View>
              <View style={styles.sourceList}>
                {sortedSources.map((item, index) => (
                  <TouchableOpacity key={index} style={[styles.sourceItem, detail.source === item.source && styles.sourceItemActive]} onPress={() => setDetail(item)}>
                    <Image source={{ uri: item.poster }} style={styles.sourcePoster} />
                    <View style={styles.sourceInfo}>
                      <View style={styles.sourceHeader}>
                        <Text style={styles.sourceTitle} numberOfLines={1}>{item.title}</Text>
                        {detail.source === item.source && <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>当前源</Text></View>}
                      </View>
                      <View style={styles.sourceSubHeader}><Layers size={12} color="#888" /><Text style={styles.sourceSourceName}>{item.source_name}</Text><Text style={styles.sourceCount}>{item.episodes.length} 集</Text></View>
                      <View style={styles.sourceFooter}>
                        <Text style={styles.sourceLatency}>{(item.latency || 0).toFixed(2)} KB/s  {(item.latency ? Math.round(item.latency/2) : 0)}ms</Text>
                        {item.resolution && <View style={styles.resBadge}><Zap size={10} color="#00bb5e" /><Text style={styles.resText}>{item.resolution}</Text></View>}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.footerInfo}>
          <View style={styles.detailHeader}>
            <ThemedText style={styles.detailTitle}>{detail.title}</ThemedText>
            <TouchableOpacity onPress={toggleFavorite}>
              <FontAwesome name={isFavorited ? "heart" : "heart-o"} size={20} color={isFavorited ? "#feff5f" : "#888"} />
            </TouchableOpacity>
          </View>
          <ThemedText style={styles.detailDesc}>{detail.desc}</ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // TV Styles
  tvScrollContainer: { flex: 1, padding: 20 },
  tvTopContainer: { flexDirection: 'row', marginBottom: 30 },
  tvPoster: { width: 200, height: 300, borderRadius: 10 },
  tvInfoContainer: { flex: 1, marginLeft: 30 },
  tvTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tvTitle: { fontSize: 32, fontWeight: 'bold', color: 'white' },
  tvMeta: { fontSize: 18, color: '#aaa', marginTop: 10 },
  tvDesc: { fontSize: 16, color: '#ccc', lineHeight: 24 },
  tvBottomContainer: { marginTop: 20 },
  tvSectionTitle: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 15 },
  tvSourceList: { marginBottom: 20 },
  tvSourceBtn: { marginRight: 15, minWidth: 120 },
  tvSourceBtnText: { fontSize: 18, color: 'white' },
  tvEpisodeGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  tvEpisodeBtn: { margin: 10, minWidth: 100 },

  // Mobile Styles
  container: { flex: 1, backgroundColor: '#000' },
  customHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 45, paddingBottom: 10 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#00bb5e' },
  headerIcons: { flexDirection: 'row' },
  content: { flex: 1 },
  previewContainer: { margin: 16, height: 220, borderRadius: 12, overflow: 'hidden', backgroundColor: '#111', borderWidth: 1, borderColor: '#333' },
  previewImage: { width: '100%', height: '100%', opacity: 0.8 },
  settingsIcon: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  mainCard: { margin: 16, marginTop: 0, backgroundColor: '#111', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
  tabsHeader: { flexDirection: 'row', height: 50, backgroundColor: '#1a1a1a' },
  tabBtn: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#111' },
  tabText: { fontSize: 16, fontWeight: '600', color: '#888' },
  tabTextActive: { color: '#00bb5e' },
  tabContent: { padding: 16 },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  rangeSelector: { backgroundColor: '#1a1a1a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#00bb5e' },
  rangeText: { color: '#00bb5e', fontSize: 14, fontWeight: '600' },
  episodeGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  episodeItem: { width: '20%', aspectRatio: 1, padding: 5 },
  episodeGradient: { flex: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  episodeText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  sourceActions: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  speedTestBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#333', gap: 8 },
  speedTestText: { color: '#00bb5e', fontSize: 14, fontWeight: '500' },
  sortRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sortLabel: { color: '#666', fontSize: 12 },
  sortOptions: { flexDirection: 'row', backgroundColor: '#1a1a1a', borderRadius: 6, padding: 2, flex: 1 },
  sortBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 4 },
  sortBtnActive: { backgroundColor: '#333' },
  sortBtnText: { color: '#888', fontSize: 12 },
  sortBtnTextActive: { color: 'white' },
  fastFirst: { flexDirection: 'row', alignItems: 'center', marginLeft: 10, gap: 4 },
  fastFirstText: { color: '#fbc02d', fontSize: 12 },
  sourceList: { gap: 12 },
  sourceItem: { flexDirection: 'row', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#222' },
  sourceItemActive: { borderColor: '#00bb5e', backgroundColor: 'rgba(0, 187, 94, 0.05)' },
  sourcePoster: { width: 60, height: 80, borderRadius: 6, backgroundColor: '#333' },
  sourceInfo: { flex: 1, marginLeft: 12, justifyContent: 'space-between' },
  sourceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourceTitle: { color: 'white', fontSize: 15, fontWeight: '600', flex: 1 },
  currentBadge: { backgroundColor: '#00bb5e', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  currentBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  sourceSubHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceSourceName: { color: '#aaa', fontSize: 12 },
  sourceCount: { color: '#666', fontSize: 11, marginLeft: 'auto' },
  sourceFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourceLatency: { color: '#00bb5e', fontSize: 12, fontWeight: '500' },
  resBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, gap: 4 },
  resText: { color: '#00bb5e', fontSize: 11, fontWeight: 'bold' },
  footerInfo: { padding: 16, paddingTop: 0, paddingBottom: 40 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  detailTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  detailDesc: { color: '#888', fontSize: 14, lineHeight: 20 },
});
