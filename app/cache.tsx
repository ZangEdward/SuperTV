import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import useDetailStore, { SearchResultWithResolution } from "@/stores/detailStore";
import useCacheStore, { GroupedDownload } from "@/stores/cacheStore";
import { Alert } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { StyledButton } from "@/components/StyledButton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";
import Colors from "../constants/Colors";
import Toast from 'react-native-toast-message';

export default function CacheScreen() {
  const { q, source, id } = useLocalSearchParams<{ q: string; source?: string; id?: string }>();
  const router = useRouter();
  const { detail, searchResults, loading, error, init, setDetail } = useDetailStore();
  const { downloadEpisode, currentDownloadId, enqueueSeries, items, queue, loadCache } = useCacheStore();
  const [showAllSources, setShowAllSources] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SearchResultWithResolution | null>(null);
  const [selectedEpisodes, setSelectedEpisodes] = useState<number[]>([]);

  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  useEffect(() => {
    loadCache();
    if (q && (!detail || detail.title !== q || searchResults.length === 0)) {
      init(q, source, id);
    }
  }, [q, source, id, detail, init, searchResults.length, loadCache]);

  useEffect(() => {
    if (detail && detail.source) {
      setSelectedSource(detail);
    }
  }, [detail]);

  const sources = useMemo(
    () => (showAllSources ? searchResults : searchResults.slice(0, 5)),
    [showAllSources, searchResults]
  );

  const dynamicStyles = createResponsiveStyles(deviceType, spacing);

  const handleSelectSource = async (sourceItem: SearchResultWithResolution) => {
    await setDetail(sourceItem);
    setSelectedSource(sourceItem);
    setSelectedEpisodes([]);
  };

  const toggleEpisodeSelection = (episodeIndex: number) => {
    setSelectedEpisodes((prev) => {
      if (prev.includes(episodeIndex)) {
        return prev.filter((index) => index !== episodeIndex);
      }
      return [...prev, episodeIndex];
    });
  };

  const handleSelectAllEpisodes = () => {
    if (!selectedSource) return;
    setSelectedEpisodes(selectedSource.episodes.map((_, index) => index));
  };

  const handleClearSelection = () => {
    setSelectedEpisodes([]);
  };

  const handleBatchCache = () => {
    if (!selectedSource) return;
    const episodeIndexes = selectedEpisodes.length > 0 ? selectedEpisodes : selectedSource.episodes.map((_, index) => index);
    if (!episodeIndexes.length) {
      Alert.alert('请选择要缓存的集数');
      return;
    }
    enqueueSeries({
      source: selectedSource.source,
      id: selectedSource.id.toString(),
      title: selectedSource.title,
      poster: selectedSource.poster,
      episodes: episodeIndexes.map((index) => ({ index, url: selectedSource.episodes[index] })),
    });
    setSelectedEpisodes([]);
  };

  if (loading && !detail) {
    return <ActivityIndicator style={styles.loading} size="large" color="#fff" />;
  }

  if (error) {
    return (
      <ResponsiveNavigation>
        <ResponsiveHeader title="下载" showBackButton />
        <ThemedView style={[commonStyles.safeContainer, commonStyles.center]}>
          <ThemedText type="subtitle" style={styles.errorText}>{error}</ThemedText>
        </ThemedView>
      </ResponsiveNavigation>
    );
  }

  if (!detail) {
    return (
      <ResponsiveNavigation>
        <ResponsiveHeader title="下载" showBackButton />
        <ThemedView style={[commonStyles.safeContainer, commonStyles.center]}>
          <ThemedText type="subtitle">未加载到详情信息</ThemedText>
        </ThemedView>
      </ResponsiveNavigation>
    );
  }

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="下载" showBackButton />
      <ThemedView style={[commonStyles.container, dynamicStyles.container]}> 
        <ScrollView style={dynamicStyles.scrollContainer}>
          <View style={dynamicStyles.detailHeader}>
            <Image source={{ uri: detail.poster }} style={dynamicStyles.poster} />
            <View style={dynamicStyles.headerInfo}>
              <ThemedText style={dynamicStyles.title} numberOfLines={2}>{detail.title}</ThemedText>
              <ThemedText style={dynamicStyles.subtitle}>{detail.type_name} · {detail.year}</ThemedText>
              <StyledButton
                onPress={() => router.push(`/detail?q=${encodeURIComponent(detail.title)}&source=${encodeURIComponent(detail.source)}&id=${encodeURIComponent(detail.id.toString())}`)}
                text="返回详情"
                variant="ghost"
                style={dynamicStyles.returnButton}
              />
            </View>
          </View>
          <View style={dynamicStyles.section}>
            <View style={dynamicStyles.selectionHeader}>
              <ThemedText style={dynamicStyles.sectionTitle}>已选集数</ThemedText>
              <ThemedText style={dynamicStyles.selectionCount}>{selectedEpisodes.length} / {selectedSource?.episodes.length || 0}</ThemedText>
            </View>
            <View style={dynamicStyles.buttonRow}>
              <StyledButton
                text="全选"
                variant="ghost"
                onPress={handleSelectAllEpisodes}
                style={dynamicStyles.filterButton}
              />
              <StyledButton
                text="清除"
                variant="ghost"
                onPress={handleClearSelection}
                style={dynamicStyles.filterButton}
              />
              <StyledButton
                text={`下载${selectedEpisodes.length > 0 ? ` (${selectedEpisodes.length})` : ''}`}
                variant="primary"
                onPress={handleBatchCache}
                style={dynamicStyles.returnButton}
              />
            </View>
          </View>

          <View style={dynamicStyles.section}>
            <View style={dynamicStyles.sectionHeader}>
              <ThemedText style={dynamicStyles.sectionTitle}>资源来源</ThemedText>
              {searchResults.length > 5 && (
                <StyledButton
                  text={showAllSources ? "收起" : `显示全部 (${searchResults.length - 5})`}
                  onPress={() => setShowAllSources(!showAllSources)}
                  variant="ghost"
                  style={dynamicStyles.showAllButton}
                />
              )}
            </View>
            <View style={dynamicStyles.sourceList}>
              {sources.map((item, index) => {
                const isSelected = selectedSource?.source === item.source;
                return (
                  <StyledButton
                    key={item.source}
                    onPress={() => handleSelectSource(item)}
                    isSelected={isSelected}
                    variant={isSelected ? "primary" : "default"}
                    style={dynamicStyles.sourceButton}
                  >
                    <View style={dynamicStyles.sourceButtonContent}>
                      <ThemedText style={dynamicStyles.sourceName}>{item.source_name}</ThemedText>
                      {item.resolution ? <Text style={dynamicStyles.resolutionText}>{item.resolution}</Text> : null}
                    </View>
                  </StyledButton>
                );
              })}
            </View>
          </View>

          <View style={dynamicStyles.section}>
            <ThemedText style={dynamicStyles.sectionTitle}>集数列表</ThemedText>
            <View style={dynamicStyles.episodeList}>
              {selectedSource?.episodes.map((episode, index) => {
                const buttonId = `${selectedSource.source}_${selectedSource.id}_${index}`;
                const isSelected = selectedEpisodes.includes(index);
                const isCached = items.some(it => it.episodeIndex === index && it.title === selectedSource?.title);
                const isDownloading = queue.some(g =>
                  g.title === selectedSource?.title &&
                  g.episodes.some(ep => ep.index === index && (ep.status === 'downloading' || ep.status === 'queued' || ep.status === 'pending' || ep.status === 'paused'))
                );
                const isDisabled = isCached || isDownloading;

                let btnStyle: any = [dynamicStyles.episodeButton];
                let textStyle: any = [isSelected ? dynamicStyles.selectedEpisodeText : undefined];
                let btnText = `第 ${index + 1} 集`;

                if (isCached) {
                  btnStyle.push({ backgroundColor: 'rgba(33, 150, 243, 0.2)', borderColor: '#2196F3' });
                  textStyle.push({ color: '#2196F3' });
                  btnText += ' ✓已缓存';
                } else if (isDownloading) {
                  btnStyle.push({ backgroundColor: 'rgba(244, 67, 54, 0.2)', borderColor: '#F44336' });
                  textStyle.push({ color: '#F44336' });
                  btnText += ' ⏳缓存中';
                } else if (isSelected) {
                  btnStyle.push({ backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary });
                  textStyle.push({ color: '#fff' });
                }

                if (isDisabled) {
                  btnStyle.push({ opacity: 0.8 });
                }

                return (
                  <StyledButton
                    key={buttonId}
                    onPress={() => !isDisabled && toggleEpisodeSelection(index)}
                    style={btnStyle}
                    text={btnText}
                    textStyle={textStyle}
                    disabled={isDisabled}
                  />
                );
              })}
            </View>
          </View>
        </ScrollView>
      </ThemedView>
    </ResponsiveNavigation>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "white",
    fontSize: 16,
  },
});

const createResponsiveStyles = (deviceType: string, spacing: number) => {
  const isMobile = deviceType === "mobile";
  return StyleSheet.create({
    container: {
      flex: 1,
      padding: spacing,
    },
    scrollContainer: {
      flex: 1,
    },
    detailHeader: {
      flexDirection: "row",
      marginBottom: spacing,
    },
    poster: {
      width: isMobile ? 120 : 140,
      height: isMobile ? 180 : 210,
      borderRadius: 10,
      marginRight: spacing,
    },
    headerInfo: {
      flex: 1,
      justifyContent: "space-between",
    },
    title: {
      fontSize: isMobile ? 18 : 20,
      fontWeight: "bold",
      color: "white",
      marginBottom: spacing / 2,
    },
    subtitle: {
      color: "#bbb",
      marginBottom: spacing,
    },
    returnButton: {
      alignSelf: "flex-start",
      minWidth: 120,
    },
    section: {
      marginBottom: spacing,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing / 2,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: "white",
    },
    selectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing / 2,
    },
    selectionCount: {
      color: "#ddd",
      fontSize: 14,
    },
    buttonRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: spacing / 2,
      marginBottom: spacing,
    },
    filterButton: {
      minWidth: 88,
    },
    showAllButton: {
      minHeight: 32,
      minWidth: 120,
    },
    sourceList: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    sourceButton: {
      marginRight: spacing / 2,
      marginBottom: spacing / 2,
      minHeight: 42,
      minWidth: 120,
    },
    sourceButtonContent: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
    },
    sourceName: {
      color: "white",
      fontSize: 14,
      flexShrink: 1,
    },
    resolutionText: {
      color: "#ddd",
      fontSize: 12,
      marginLeft: 8,
    },
    episodeList: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    episodeButton: {
      marginRight: spacing / 2,
      marginBottom: spacing / 2,
      minWidth: 110,
    },
    selectedEpisodeText: {
      fontWeight: "700",
      color: "#fff",
    },
  });
};
