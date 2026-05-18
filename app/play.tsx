import React, { useEffect, useRef, useCallback, memo, useMemo, useState } from "react";
import { StyleSheet, TouchableOpacity, BackHandler, View, ScrollView, Text, Dimensions, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Video } from "expo-av";
import { useKeepAwake } from "expo-keep-awake";
import { ThemedView } from "@/components/ThemedView";
import { PlayerControls } from "@/components/PlayerControls";
import { EpisodeSelectionModal } from "@/components/EpisodeSelectionModal";
import { SourceSelectionModal } from "@/components/SourceSelectionModal";
import { SpeedSelectionModal } from "@/components/SpeedSelectionModal";
import { CastModal } from "@/components/CastModal";
import { SeekingBar } from "@/components/SeekingBar";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import { ArrowLeft, ArrowUpDown } from "lucide-react-native";
import { ArtIconCast } from "@/components/ArtIcons";
import useDetailStore from "@/stores/detailStore";
import { useTVRemoteHandler } from "@/hooks/useTVRemoteHandler";
import usePlayerStore, { selectCurrentEpisode } from "@/stores/playerStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useVideoHandlers } from "@/hooks/useVideoHandlers";
import Logger from '@/utils/Logger';

const logger = Logger.withTag('PlayScreen');
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const LoadingContainer = memo(({ style, currentEpisode }: { style: any; currentEpisode: any }) => (
  <View style={style}>
    <VideoLoadingAnimation showProgressBar />
  </View>
));

export default function PlayScreen() {
  const videoRef = useRef<Video>(null);
  const router = useRouter();
  useKeepAwake();
  const { deviceType, spacing } = useResponsiveLayout();
  const isMobile = deviceType === 'mobile';

  const {
    episodeIndex: episodeIndexStr,
    position: positionStr,
    source: sourceStr,
    id: videoId,
    title: videoTitle,
    fileUri,
  } = useLocalSearchParams<{
    episodeIndex: string;
    position?: string;
    source?: string;
    id?: string;
    title?: string;
    fileUri?: string;
  }>();

  const initialEpIndex = parseInt(episodeIndexStr || "0", 10);
  const position = positionStr ? parseInt(positionStr, 10) : undefined;

  const { detail, searchResults, setDetail } = useDetailStore();
  const source = sourceStr || detail?.source;
  const id = videoId || detail?.id.toString();
  const title = videoTitle || detail?.title;

  const {
    isLoading,
    showControls,
    initialPosition,
    introEndTime,
    playbackRate,
    currentEpisodeIndex,
    setVideoRef,
    handlePlaybackStatusUpdate,
    setShowControls,
    setShowCastModal,
    reset,
    loadVideo,
  } = usePlayerStore();

  const currentEpisode = usePlayerStore(selectCurrentEpisode);

  const [isReverse, setIsReverse] = useState(false);

  const { videoProps } = useVideoHandlers({
    videoRef,
    currentEpisode,
    initialPosition,
    introEndTime,
    playbackRate,
    handlePlaybackStatusUpdate,
    deviceType,
    detail: detail || undefined,
  });

  const tvRemoteHandler = useTVRemoteHandler();

  useEffect(() => {
    setVideoRef(videoRef);
    setShowCastModal(false);

    if (fileUri) {
      loadVideo({
        source: source || 'local',
        id: id || 'local',
        episodeIndex: 0,
        position,
        title: title || '离线播放',
        fileUri
      });
    } else if (source && id && title) {
      loadVideo({ source, id, episodeIndex: initialEpIndex, position, title });
    }
    return () => reset();
  }, [initialEpIndex, source, position, setVideoRef, reset, loadVideo, id, title, fileUri]);

  const onScreenPress = useCallback(() => {
    if (deviceType === "tv") {
      tvRemoteHandler.onScreenPress();
    } else {
      setShowControls(!showControls);
    }
  }, [deviceType, tvRemoteHandler, setShowControls, showControls]);

  useEffect(() => {
    const backAction = () => {
      if (usePlayerStore.getState().showCastModal) {
        usePlayerStore.getState().setShowCastModal(false);
        return true;
      }
      if (showControls && deviceType === 'tv') {
        setShowControls(false);
        return true;
      }
      router.back();
      return true;
    };
    BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => BackHandler.removeEventListener("hardwareBackPress", backAction);
  }, [showControls, deviceType, setShowControls, router]);

  const episodes = useMemo(() => {
    if (!detail) return [];
    const list = (detail.episodes || []).map((url: string, i: number) => ({ index: i, url }));
    return isReverse ? list.reverse() : list;
  }, [detail, isReverse]);

  const sortedSources = useMemo(() => {
    return searchResults;
  }, [searchResults]);

  const handleEpisodePress = (idx: number) => {
    if (idx === currentEpisodeIndex) return;
    loadVideo({
      source: source!,
      id: id!,
      episodeIndex: idx,
      title: title!
    });
  };

  const handleSourcePress = (item: any) => {
    if (item.source === source) return;
    setDetail(item);
    loadVideo({
      source: item.source,
      id: item.id.toString(),
      episodeIndex: currentEpisodeIndex,
      title: item.title
    });
  };

  const isLocalFile = !!fileUri;

  // 本地缓存文件播放：无需 detail 数据
  if (!isLocalFile && !detail) {
    return <VideoLoadingAnimation showProgressBar />;
  }

  const renderMobileLayout = () => (
    <View style={styles.mobileContainer}>
      {/* 顶部栏 */}
      <View style={styles.customHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{detail?.title || title || '播放'}</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.overlayIcon} onPress={() => setShowCastModal(true)}>
            <ArtIconCast size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 视频播放区 */}
      <View style={styles.playerSection}>
        <TouchableOpacity activeOpacity={1} style={styles.videoWrapper} onPress={onScreenPress}>
          {currentEpisode?.url ? (
            <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} />
          ) : (
            <LoadingContainer style={styles.loadingContainer} currentEpisode={currentEpisode} />
          )}
          <SeekingBar />
          {currentEpisode?.url && isLoading && (
            <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#00bb5e" /></View>
          )}
        </TouchableOpacity>
      </View>

      {/* 底部简化的选集 + 换源 */}
      <View style={styles.mobileBottomBar}>
        {/* 集数选择 */}
        <View style={styles.mobileSection}>
          <View style={styles.mobileSectionHeader}>
            <Text style={styles.mobileSectionTitle}>选集</Text>
            <View style={styles.rangeSelector}>
              <Text style={styles.rangeText}>1-{detail?.episodes?.length || 0}</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.episodeScroll}>
            {episodes.map((ep) => (
              <TouchableOpacity
                key={ep.index}
                style={[styles.mobileEpItem, ep.index === currentEpisodeIndex && styles.mobileEpItemActive]}
                onPress={() => handleEpisodePress(ep.index)}
              >
                <Text style={[styles.mobileEpText, ep.index === currentEpisodeIndex && styles.mobileEpTextActive]}>
                  {(ep.index + 1).toString()}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* 源选择 */}
        <View style={styles.mobileSection}>
          <View style={styles.mobileSectionHeader}>
            <Text style={styles.mobileSectionTitle}>播放源</Text>
            <TouchableOpacity onPress={() => setIsReverse(!isReverse)} style={styles.reverseBtn}>
              <ArrowUpDown size={16} color={isReverse ? "#00bb5e" : "#888"} />
              <Text style={[styles.reverseText, isReverse && { color: '#00bb5e' }]}>{isReverse ? '倒序' : '正序'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sourceScroll}>
            {sortedSources.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.mobileSourceItem, source === item.source && styles.mobileSourceItemActive]}
                onPress={() => handleSourcePress(item)}
              >
                <Text style={[styles.mobileSourceText, source === item.source && styles.mobileSourceTextActive]} numberOfLines={1}>
                  {item.source_name}
                </Text>
                <Text style={styles.mobileSourceEpisodes}>{item.episodes?.length || 0}集</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );

  const renderTVLayout = () => (
    <ThemedView focusable style={styles.tvContainer}>
      <TouchableOpacity activeOpacity={1} style={styles.videoWrapper} onPress={onScreenPress}>
        {currentEpisode?.url ? (
          <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} />
        ) : (
          <LoadingContainer style={styles.loadingContainer} currentEpisode={currentEpisode} />
        )}
        {showControls && <PlayerControls showControls={showControls} setShowControls={setShowControls} />}
        <SeekingBar />
        {currentEpisode?.url && isLoading && (
          <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#00bb5e" /></View>
        )}
      </TouchableOpacity>
    </ThemedView>
  );

  return (
    <ThemedView style={{ flex: 1, backgroundColor: 'black' }}>
      {isMobile ? renderMobileLayout() : renderTVLayout()}
      <EpisodeSelectionModal />
      <SourceSelectionModal />
      <SpeedSelectionModal />
      {isMobile && <CastModal />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tvContainer: { flex: 1 },
  mobileContainer: { flex: 1, backgroundColor: '#000' },
  customHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingTop: 45, paddingBottom: 8 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: 'bold', color: '#00bb5e', marginHorizontal: 8 },
  headerIcons: { flexDirection: 'row' },
  overlayIcon: { padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  playerSection: { width: '100%', aspectRatio: 16/9, backgroundColor: '#111' },
  videoWrapper: { flex: 1 },
  videoPlayer: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },

  mobileBottomBar: { flex: 1, paddingHorizontal: 12, paddingTop: 10 },
  mobileSection: { marginBottom: 12 },
  mobileSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mobileSectionTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  rangeSelector: { backgroundColor: '#1a1a1a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#00bb5e' },
  rangeText: { color: '#00bb5e', fontSize: 12, fontWeight: '600' },
  reverseBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reverseText: { color: '#888', fontSize: 13 },

  episodeScroll: { maxHeight: 48, marginBottom: 4 },
  mobileEpItem: { backgroundColor: '#1a1a1a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 8 },
  mobileEpItemActive: { backgroundColor: '#00bb5e' },
  mobileEpText: { color: '#aaa', fontSize: 14, fontWeight: '600' },
  mobileEpTextActive: { color: '#fff' },

  sourceScroll: { maxHeight: 44 },
  mobileSourceItem: { backgroundColor: '#1a1a1a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  mobileSourceItemActive: { borderColor: '#00bb5e', borderWidth: 1, backgroundColor: 'rgba(0,187,94,0.1)' },
  mobileSourceText: { color: '#ccc', fontSize: 13, maxWidth: 100 },
  mobileSourceTextActive: { color: '#00bb5e', fontWeight: '700' },
  mobileSourceEpisodes: { color: '#666', fontSize: 11 },
});
