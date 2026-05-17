import React, { useEffect, useRef, useCallback, memo, useMemo, useState } from "react";
import { StyleSheet, TouchableOpacity, BackHandler, AppState, AppStateStatus, View, ScrollView, Text, Dimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Video } from "expo-av";
import { useKeepAwake } from "expo-keep-awake";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { PlayerControls } from "@/components/PlayerControls";
import { EpisodeSelectionModal } from "@/components/EpisodeSelectionModal";
import { SourceSelectionModal } from "@/components/SourceSelectionModal";
import { SpeedSelectionModal } from "@/components/SpeedSelectionModal";
import { CastModal } from "@/components/CastModal";
import { SeekingBar } from "@/components/SeekingBar";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import { ArrowLeft, Sun, User, Settings2, ArrowUpDown, Zap, Layers, CheckCircle2 } from "lucide-react-native";
import { ArtIconCast } from "@/components/ArtIcons";
import useDetailStore from "@/stores/detailStore";
import { useTVRemoteHandler } from "@/hooks/useTVRemoteHandler";
import Toast from "react-native-toast-message";
import usePlayerStore, { selectCurrentEpisode } from "@/stores/playerStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useVideoHandlers } from "@/hooks/useVideoHandlers";
import { LinearGradient } from 'expo-linear-gradient';
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
  } = useLocalSearchParams<{
    episodeIndex: string;
    position?: string;
    source?: string;
    id?: string;
    title?: string;
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

  // Tabs for mobile
  const [activeTab, setActiveTab] = useState<'episodes' | 'sources'>('episodes');
  const [isReverse, setIsReverse] = useState(false);
  const [sortType, setSortType] = useState<'original' | 'speed' | 'name'>('original');

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
    if (source && id && title) {
      loadVideo({ source, id, episodeIndex: initialEpIndex, position, title });
    }
    return () => reset();
  }, [initialEpIndex, source, position, setVideoRef, reset, loadVideo, id, title]);

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
    const list = detail.episodes.map((url, i) => ({ index: i, url }));
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

  if (!detail) return <VideoLoadingAnimation showProgressBar />;

  const renderMobileLayout = () => (
    <View style={styles.mobileContainer}>
      <View style={styles.customHeader}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerTitle}>SuperTV</Text>
        </TouchableOpacity>
        <View style={styles.headerIcons}>
          <Sun size={24} color="white" style={{ marginRight: 20 }} />
          <User size={24} color="white" />
        </View>
      </View>

      <View style={styles.playerSection}>
        <TouchableOpacity activeOpacity={1} style={styles.videoWrapper} onPress={onScreenPress}>
          {currentEpisode?.url ? (
            <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} />
          ) : (
            <LoadingContainer style={styles.loadingContainer} currentEpisode={currentEpisode} />
          )}

          {showControls && (
            <View style={styles.mobileOverlay}>
              <TouchableOpacity style={styles.overlayIcon} onPress={() => setShowCastModal(true)}>
                <ArtIconCast size={24} color="white" />
              </TouchableOpacity>
            </View>
          )}

          <SeekingBar />
          {currentEpisode?.url && isLoading && (
            <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#00bb5e" /></View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.bottomSection}>
        <View style={styles.mainCard}>
          <View style={styles.tabsHeader}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'episodes' && styles.tabBtnActive]}
              onPress={() => setActiveTab('episodes')}
            >
              <Text style={[styles.tabText, activeTab === 'episodes' && styles.tabTextActive]}>选集</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'sources' && styles.tabBtnActive]}
              onPress={() => setActiveTab('sources')}
            >
              <Text style={[styles.tabText, activeTab === 'sources' && styles.tabTextActive]}>换源</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'episodes' ? (
            <View style={styles.tabContent}>
              <View style={styles.filterRow}>
                <View style={styles.rangeSelector}><Text style={styles.rangeText}>1-{detail.episodes.length}</Text></View>
                <TouchableOpacity onPress={() => setIsReverse(!isReverse)}>
                  <ArrowUpDown size={20} color={isReverse ? "#00bb5e" : "#aaa"} />
                </TouchableOpacity>
              </View>
              <View style={styles.episodeGrid}>
                {episodes.map((ep) => (
                  <TouchableOpacity key={ep.index} style={styles.episodeItem} onPress={() => handleEpisodePress(ep.index)}>
                    <LinearGradient
                      colors={ep.index === currentEpisodeIndex ? ['#00bb5e', '#009a4d'] : ['#222', '#222']}
                      style={styles.episodeGradient}
                    >
                      <Text style={[styles.episodeText, ep.index !== currentEpisodeIndex && { color: '#aaa' }]}>
                        {(ep.index + 1).toString().padStart(2, '0')}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.tabContent}>
              <View style={styles.sourceActions}>
                <TouchableOpacity style={styles.speedBtn}><Zap size={16} color="#00bb5e" /><Text style={styles.speedText}>视频源测速</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.speedBtn, { backgroundColor: '#1a73e8' }]}><CheckCircle2 size={16} color="white" /><Text style={[styles.speedText, { color: 'white' }]}>手动测速</Text></TouchableOpacity>
              </View>
              <View style={styles.sourceList}>
                {sortedSources.map((item, idx) => (
                  <TouchableOpacity key={idx} style={[styles.sourceItem, source === item.source && styles.sourceItemActive]} onPress={() => handleSourcePress(item)}>
                    <Image source={{ uri: item.poster }} style={styles.sourcePoster} />
                    <View style={styles.sourceInfo}>
                      <View style={styles.sourceHeader}>
                        <Text style={styles.sourceTitle} numberOfLines={1}>{item.title}</Text>
                        {source === item.source && <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>当前源</Text></View>}
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
          <ThemedText style={styles.detailTitle}>{detail.title}</ThemedText>
          <ThemedText style={styles.detailDesc} numberOfLines={3}>{detail.desc}</ThemedText>
        </View>
      </ScrollView>
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
  customHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 45, paddingBottom: 10 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#00bb5e' },
  headerIcons: { flexDirection: 'row' },
  playerSection: { width: '100%', aspectRatio: 16/9, backgroundColor: '#111' },
  videoWrapper: { flex: 1 },
  videoPlayer: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  mobileOverlay: { position: 'absolute', top: 20, right: 20, zIndex: 10 },
  overlayIcon: { padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  bottomSection: { flex: 1 },
  mainCard: { margin: 16, backgroundColor: '#111', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
  tabsHeader: { flexDirection: 'row', height: 48, backgroundColor: '#1a1a1a' },
  tabBtn: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#111' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#888' },
  tabTextActive: { color: '#00bb5e' },
  tabContent: { padding: 16 },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  rangeSelector: { backgroundColor: '#1a1a1a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#00bb5e' },
  rangeText: { color: '#00bb5e', fontSize: 13, fontWeight: '600' },
  episodeGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  episodeItem: { width: '20%', aspectRatio: 1, padding: 4 },
  episodeGradient: { flex: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  episodeText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  sourceActions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  speedBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a', paddingVertical: 8, borderRadius: 8, gap: 6 },
  speedText: { color: '#00bb5e', fontSize: 13, fontWeight: '500' },
  sourceList: { gap: 10 },
  sourceItem: { flexDirection: 'row', backgroundColor: '#1a1a1a', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: '#222' },
  sourceItemActive: { borderColor: '#00bb5e', backgroundColor: 'rgba(0, 187, 94, 0.05)' },
  sourcePoster: { width: 50, height: 70, borderRadius: 4 },
  sourceInfo: { flex: 1, marginLeft: 10, justifyContent: 'space-between' },
  sourceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourceTitle: { color: 'white', fontSize: 14, fontWeight: '600', flex: 1 },
  currentBadge: { backgroundColor: '#00bb5e', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  currentBadgeText: { color: 'white', fontSize: 9, fontWeight: 'bold' },
  sourceSubHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sourceSourceName: { color: '#aaa', fontSize: 11 },
  sourceCount: { color: '#666', fontSize: 10, marginLeft: 'auto' },
  sourceFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourceLatency: { color: '#00bb5e', fontSize: 11 },
  resBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, gap: 3 },
  resText: { color: '#00bb5e', fontSize: 10, fontWeight: 'bold' },
  footerInfo: { padding: 16, paddingTop: 0, paddingBottom: 30 },
  detailTitle: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 6 },
  detailDesc: { color: '#888', fontSize: 13, lineHeight: 18 },
});
