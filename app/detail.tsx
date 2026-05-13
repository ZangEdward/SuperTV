import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, ScrollView, ActivityIndicator } from "react-native";
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

export default function DetailScreen() {
  const { q, source, id } = useLocalSearchParams<{ q: string; source?: string; id?: string }>();
  const router = useRouter();

  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  const {
    detail,
    searchResults,
    sourcesTop5,
    latencies,
    loading,
    error,
    allSourcesLoaded,
    init,
    setDetail,
    abort,
    isFavorited,
    toggleFavorite,
  } = useDetailStore();

  const [showAllSources, setShowAllSources] = useState(false);

  useEffect(() => {
    if (q) init(q, source, id);
    return () => abort();
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

  const getLatencyText = (source: string) => {
    const ms = latencies[source];
    if (ms === undefined) return "测速中...";
    if (ms === Infinity) return "超时";
    return `${ms} ms`;
  };

  if (loading) return <VideoLoadingAnimation showProgressBar={false} />;

  if (error) {
    const content = (
      <ThemedView style={[commonStyles.safeContainer, commonStyles.center]}>
        <ThemedText type="subtitle" style={commonStyles.textMedium}>{error}</ThemedText>
      </ThemedView>
    );
    return deviceType === "tv" ? content : (
      <ResponsiveNavigation>
        <ResponsiveHeader title="详情" showBackButton />
        {content}
      </ResponsiveNavigation>
    );
  }

  if (!detail) {
    const content = (
      <ThemedView style={[commonStyles.safeContainer, commonStyles.center]}>
        <ThemedText type="subtitle">未找到详情信息</ThemedText>
      </ThemedView>
    );
    return deviceType === "tv" ? content : (
      <ResponsiveNavigation>
        <ResponsiveHeader title="详情" showBackButton />
        {content}
      </ResponsiveNavigation>
    );
  }

  const dynamicStyles = createResponsiveStyles(deviceType, spacing);

  // ⭐ 选择显示前 5 个还是全部源
  const sourcesToShow = showAllSources ? searchResults : sourcesTop5;

  const renderSources = () => (
    <>
      <View style={dynamicStyles.sourceList}>
        {sourcesToShow.map((item, index) => {
          const isSelected = detail?.source === item.source;
          return (
            <StyledButton
              key={index}
              onPress={() => setDetail(item)}
              isSelected={isSelected}
              style={dynamicStyles.sourceButton}
            >
              <ThemedText style={dynamicStyles.sourceButtonText}>
                {item.source_name}（{getLatencyText(item.source)}）
              </ThemedText>

              {item.episodes.length > 1 && (
                <View style={[dynamicStyles.badge, isSelected && dynamicStyles.selectedBadge]}>
                  <Text style={dynamicStyles.badgeText}>
                    {item.episodes.length > 99 ? "99+" : `${item.episodes.length}`} 集
                  </Text>
                </View>
              )}

              {item.resolution && (
                <View style={[dynamicStyles.badge, { backgroundColor: "#666" }, isSelected && dynamicStyles.selectedBadge]}>
                  <Text style={dynamicStyles.badgeText}>{item.resolution}</Text>
                </View>
              )}
            </StyledButton>
          );
        })}
      </View>

      {/* ⭐ 展开 / 收起按钮 */}
      {searchResults.length > 5 && (
        <StyledButton
          onPress={() => setShowAllSources(!showAllSources)}
          style={{ marginTop: 10, alignSelf: "center" }}
        >
          <ThemedText style={{ color: "white" }}>
            {showAllSources ? "收起源列表" : `展开全部源（共 ${searchResults.length} 个）`}
          </ThemedText>
        </StyledButton>
      )}
    </>
  );

  const renderDetailContent = () => {
    if (deviceType === "mobile") {
      return (
        <ScrollView style={dynamicStyles.scrollContainer}>
          {/* 海报 */}
          <View style={dynamicStyles.mobileTopContainer}>
            <Image source={{ uri: detail.poster }} style={dynamicStyles.mobilePoster} />
            <View style={dynamicStyles.mobileInfoContainer}>
              <View style={dynamicStyles.titleContainer}>
                <ThemedText style={dynamicStyles.title} numberOfLines={2}>{detail.title}</ThemedText>
                <StyledButton onPress={toggleFavorite} variant="ghost" style={dynamicStyles.favoriteButton}>
                  <FontAwesome name={isFavorited ? "heart" : "heart-o"} size={20} color={isFavorited ? "#feff5f" : "#ccc"} />
                </StyledButton>
              </View>
              <View style={dynamicStyles.metaContainer}>
                <ThemedText style={dynamicStyles.metaText}>{detail.year}</ThemedText>
                <ThemedText style={dynamicStyles.metaText}>{detail.type_name}</ThemedText>
              </View>
            </View>
          </View>

          {/* 描述 */}
          <View style={dynamicStyles.descriptionContainer}>
            <ThemedText style={dynamicStyles.description}>{detail.desc}</ThemedText>
          </View>

          {/* ⭐ 播放源（排序 + 前 5 + 展开） */}
          <View style={dynamicStyles.sourcesContainer}>
            <View style={dynamicStyles.sourcesTitleContainer}>
              <ThemedText style={dynamicStyles.sourcesTitle}>播放源（{searchResults.length}）</ThemedText>
              {!allSourcesLoaded && <ActivityIndicator style={{ marginLeft: 10 }} />}
            </View>

            {renderSources()}
          </View>

          {/* 剧集 */}
          <View style={dynamicStyles.episodesContainer}>
            <ThemedText style={dynamicStyles.episodesTitle}>播放列表</ThemedText>
            <View style={dynamicStyles.episodeList}>
              {detail.episodes.map((episode, index) => (
                <StyledButton
                  key={index}
                  style={dynamicStyles.episodeButton}
                  onPress={() => handlePlay(index)}
                  text={`第 ${index + 1} 集`}
                  textStyle={dynamicStyles.episodeButtonText}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      );
    }

    // ⭐ TV / 平板布局
    return (
      <ScrollView style={dynamicStyles.scrollContainer}>
        <View style={dynamicStyles.topContainer}>
          <Image source={{ uri: detail.poster }} style={dynamicStyles.poster} />
          <View style={dynamicStyles.infoContainer}>
            <View style={dynamicStyles.titleContainer}>
              <ThemedText style={dynamicStyles.title} numberOfLines={1}>{detail.title}</ThemedText>
              <StyledButton onPress={toggleFavorite} variant="ghost" style={dynamicStyles.favoriteButton}>
                <FontAwesome name={isFavorited ? "heart" : "heart-o"} size={24} color={isFavorited ? "#feff5f" : "#ccc"} />
              </StyledButton>
            </View>

            <View style={dynamicStyles.metaContainer}>
              <ThemedText style={dynamicStyles.metaText}>{detail.year}</ThemedText>
              <ThemedText style={dynamicStyles.metaText}>{detail.type_name}</ThemedText>
            </View>

            <ScrollView style={dynamicStyles.descriptionScrollView}>
              <ThemedText style={dynamicStyles.description}>{detail.desc}</ThemedText>
            </ScrollView>
          </View>
        </View>

        <View style={dynamicStyles.bottomContainer}>
          <View style={dynamicStyles.sourcesContainer}>
            <View style={dynamicStyles.sourcesTitleContainer}>
              <ThemedText style={dynamicStyles.sourcesTitle}>选择播放源（{searchResults.length}）</ThemedText>
              {!allSourcesLoaded && <ActivityIndicator style={{ marginLeft: 10 }} />}
            </View>

            {renderSources()}
          </View>

          <View style={dynamicStyles.episodesContainer}>
            <ThemedText style={dynamicStyles.episodesTitle}>播放列表</ThemedText>
            <ScrollView contentContainerStyle={dynamicStyles.episodeList}>
              {detail.episodes.map((episode, index) => (
                <StyledButton
                  key={index}
                  style={dynamicStyles.episodeButton}
                  onPress={() => handlePlay(index)}
                  text={`第 ${index + 1} 集`}
                  textStyle={dynamicStyles.episodeButtonText}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </ScrollView>
    );
  };

  const content = (
    <ThemedView style={[commonStyles.container, { paddingTop: deviceType === "tv" ? 40 : 0 }]}>
      {renderDetailContent()}
    </ThemedView>
  );

  return deviceType === "tv" ? content : (
    <ResponsiveNavigation>
      <ResponsiveHeader title={detail?.title || "详情"} showBackButton />
      {content}
    </ResponsiveNavigation>
  );
}

const createResponsiveStyles = (deviceType: string, spacing: number) => {
  const isTV = deviceType === "tv";
  const isTablet = deviceType === "tablet";
  const isMobile = deviceType === "mobile";

  return StyleSheet.create({
    scrollContainer: { flex: 1 },
    mobileTopContainer: { paddingHorizontal: spacing, paddingTop: spacing, paddingBottom: spacing / 2 },
    mobilePoster: { width: "100%", height: 280, borderRadius: 8, alignSelf: "center", marginBottom: spacing },
    mobileInfoContainer: { flex: 1 },
    descriptionContainer: { paddingHorizontal: spacing, paddingBottom: spacing },
    topContainer: { flexDirection: "row", padding: spacing },
    poster: { width: isTV ? 200 : 160, height: isTV ? 300 : 240, borderRadius: 8 },
    infoContainer: { flex: 1, marginLeft: spacing },
    descriptionScrollView: { height: 150 },
    titleContainer: { flexDirection: "row", alignItems: "center", marginBottom: spacing / 2 },
    title: { paddingTop: 16, fontSize: isMobile ? 20 : isTablet ? 24 : 28, fontWeight: "bold", color: "white", flexShrink: 1 },
    favoriteButton: { padding: 10, marginLeft: 10, backgroundColor: "transparent" },
    metaContainer: { flexDirection: "row", marginBottom: spacing / 2 },
    metaText: { color: "#aaa", marginRight: spacing / 2, fontSize: isMobile ? 12 : 14 },
    description: { fontSize: isMobile ? 13 : 14, color: "#ccc", lineHeight: isMobile ? 18 : 22 },
    bottomContainer: { paddingHorizontal: spacing },
    sourcesContainer: { marginTop: spacing },
    sourcesTitleContainer: { flexDirection: "row", alignItems: "center", marginBottom: spacing / 2 },
    sourcesTitle: { fontSize: isMobile ? 16 : isTablet ? 18 : 20, fontWeight: "bold", color: "white" },
    sourceList: { flexDirection: "row", flexWrap: "wrap" },
    sourceButton: { margin: isMobile ? 4 : 8, minHeight: isMobile ? 36 : 44 },
    sourceButtonText: { color: "white", fontSize: isMobile ? 14 : 16 },
    badge: { backgroundColor: "#666", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 },
    badgeText: { color: "#fff", fontSize: isMobile ? 10 : 12, fontWeight: "bold", paddingBottom: 2.5 },
    selectedBadge: { backgroundColor: "#4c4c4c" },
    episodesContainer: { marginTop: spacing, paddingBottom: spacing * 2 },
    episodesTitle: { fontSize: isMobile ? 16 : isTablet ? 18 : 20, fontWeight: "bold", marginBottom: spacing / 2, color: "white" },
    episodeList: { flexDirection: "row", flexWrap: "wrap" },
    episodeButton: { margin: isMobile ? 3 : 5, minHeight: isMobile ? 32 : 36 },
    episodeButtonText: { color: "white", fontSize: isMobile ? 12 : 14 },
  });
};