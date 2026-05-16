import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import useDetailStore, { SearchResultWithResolution } from "@/stores/detailStore";
import useCacheStore from "@/stores/cacheStore";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { StyledButton } from "@/components/StyledButton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";

export default function CacheScreen() {
  const { q, source, id } = useLocalSearchParams<{ q: string; source?: string; id?: string }>();
  const router = useRouter();
  const { detail, searchResults, loading, error, init, setDetail } = useDetailStore();
  const { downloadEpisode, currentDownloadId } = useCacheStore();
  const [showAllSources, setShowAllSources] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SearchResultWithResolution | null>(null);

  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  useEffect(() => {
    if (q && (!detail || detail.title !== q || searchResults.length === 0)) {
      init(q, source, id);
    }
  }, [q, source, id, detail, init, searchResults.length]);

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
  };

  const handleDownloadEpisode = async (episodeIndex: number) => {
    if (!selectedSource) return;
    const episodeUrl = selectedSource.episodes[episodeIndex];
    await downloadEpisode({
      source: selectedSource.source,
      source_name: selectedSource.source_name,
      title: selectedSource.title,
      poster: selectedSource.poster,
      id: selectedSource.id.toString(),
      episodeIndex,
      episodeTitle: `第 ${episodeIndex + 1} 集`,
      episodeUrl,
      totalEpisodes: selectedSource.episodes.length,
      resolution: selectedSource.resolution,
    });
  };

  if (loading && !detail) {
    return <ActivityIndicator style={styles.loading} size="large" color="#fff" />;
  }

  if (error) {
    return (
      <ResponsiveNavigation>
        <ResponsiveHeader title="缓存" showBackButton />
        <ThemedView style={[commonStyles.safeContainer, commonStyles.center]}>
          <ThemedText type="subtitle" style={styles.errorText}>{error}</ThemedText>
        </ThemedView>
      </ResponsiveNavigation>
    );
  }

  if (!detail) {
    return (
      <ResponsiveNavigation>
        <ResponsiveHeader title="缓存" showBackButton />
        <ThemedView style={[commonStyles.safeContainer, commonStyles.center]}>
          <ThemedText type="subtitle">未加载到详情信息</ThemedText>
        </ThemedView>
      </ResponsiveNavigation>
    );
  }

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="缓存" showBackButton />
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
            <View style={dynamicStyles.sectionHeader}>
              <ThemedText style={dynamicStyles.sectionTitle}>缓存源</ThemedText>
              {!showAllSources && searchResults.length > 5 && (
                <StyledButton text={`显示全部 (${searchResults.length - 5})`} onPress={() => setShowAllSources(true)} variant="ghost" style={dynamicStyles.showAllButton} />
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
                return (
                  <StyledButton
                    key={buttonId}
                    onPress={() => handleDownloadEpisode(index)}
                    variant="primary"
                    style={dynamicStyles.episodeButton}
                    text={
                      currentDownloadId === buttonId
                        ? `下载中 第 ${index + 1} 集...`
                        : `第 ${index + 1} 集`
                    }
                    disabled={currentDownloadId !== null}
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
  });
};
