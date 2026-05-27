import React, { useEffect, useRef, useCallback, memo, useMemo, useState } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  View,
  ScrollView,
  Text,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Video } from "expo-av";
import { activateKeepAwakeAsync, deactivateKeepAwakeAsync } from "expo-keep-awake";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedView } from "@/components/ThemedView";
import { PlayerControls } from "@/components/PlayerControls";
import { EpisodeSelectionModal } from "@/components/EpisodeSelectionModal";
import { SourceSelectionModal } from "@/components/SourceSelectionModal";
import { SpeedSelectionModal } from "@/components/SpeedSelectionModal";
import { CastModal } from "@/components/CastModal";
import { SeekingBar } from "@/components/SeekingBar";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import { ArrowLeft, Cast, Download, Zap } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import useDetailStore from "@/stores/detailStore";
import { api, SearchResult } from "@/services/api";
import { useTVRemoteHandler } from "@/hooks/useTVRemoteHandler";
import usePlayerStore, { selectCurrentEpisode } from "@/stores/playerStore";
import useCacheStore from "@/stores/cacheStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useVideoHandlers } from "@/hooks/useVideoHandlers";
import { StyledButton } from "@/components/StyledButton";
import { parseEpisode } from "@/utils/episode";
import { SpeedTestService } from "@/services/speedTestService";
import * as ScreenOrientation from "expo-screen-orientation";

const LoadingContainer = memo(({ style }: { style: any; currentEpisode: any }) => (
  <View style={style}>
    <VideoLoadingAnimation showProgressBar />
  </View>
));

export default function PlayScreen() {
  const videoRef = useRef<Video>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deviceType } = useResponsiveLayout();
  const isMobile = deviceType === "mobile";
  const isTV = deviceType === "tv";
  const params = useLocalSearchParams<{
    episodeIndex: string;
    position?: string;
    source?: string;
    id?: string;
    title?: string;
    fileUri?: string;
  }>();

  const [isReverse, setIsReverse] = useState(false);
  const [isInitFailed, setIsInitFailed] = useState(false);
  const [fuzzyResults, setFuzzyResults] = useState<SearchResult[]>([]);
  const [activeTab, setActiveTab] = useState<'episodes' | 'sources' | 'desc'>('episodes');

  // [投屏控制] 移动端/平板端在投屏状态下跳转到投屏控制页
  const isCasting = usePlayerStore(state => state.isCasting);
  const castingDevice = usePlayerStore(state => state.castingDevice);
  useEffect(() => {
    if ((isMobile || deviceType === 'tablet') && isCasting && castingDevice) {
      router.replace('/cast-control');
    }
  }, [isMobile, deviceType, isCasting, castingDevice, router]);

  const detail = useDetailStore(state => state.detail);
  const searchResults = useDetailStore(state => state.searchResults);
  const setDetail = useDetailStore(state => state.setDetail);
  const detailError = useDetailStore(state => state.error);
  const detailLoading = useDetailStore(state => state.loading);
  const isOptimizing = useDetailStore(state => state.isOptimizing);
  const optimizeSources = useDetailStore(state => state.optimizeSources);

  const status = usePlayerStore(state => state.status);
  const isLoading = usePlayerStore(state => state.isLoading);
  const showControls = usePlayerStore(state => state.showControls);
  const showCastModal = usePlayerStore(state => state.showCastModal);
  const initialPosition = usePlayerStore(state => state.initialPosition);
  const introEndTime = usePlayerStore(state => state.introEndTime);
  const playbackRate = usePlayerStore(state => state.playbackRate);
  const currentEpisodeIndex = usePlayerStore(state => state.currentEpisodeIndex);
  const isFullscreen = usePlayerStore(state => state.isFullscreen);
  const setVideoRef = usePlayerStore(state => state.setVideoRef);
  const handlePlaybackStatusUpdate = usePlayerStore(state => state.handlePlaybackStatusUpdate);
  const setShowControls = usePlayerStore(state => state.setShowControls);
  const setShowCastModal = usePlayerStore(state => state.setShowCastModal);
  const reset = usePlayerStore(state => state.reset);
  const loadVideo = usePlayerStore(state => state.loadVideo);
  const setIsFullscreen = usePlayerStore(state => state.setIsFullscreen);
  const currentEpisode = usePlayerStore(selectCurrentEpisode);

  const downloadEpisode = useCacheStore(state => state.downloadEpisode);

  useTVRemoteHandler();

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

  const isDetailMatching = useMemo(() => {
    if (!detail) return false;
    if (!!params.fileUri) return true;
    const detailId = String(detail.id || "");
    const paramId = String(params.id || "");
    // 精确匹配：id 和 source 都匹配
    if ((detailId === paramId || detailId === "0" || paramId === "0") && detail.source === params.source) {
      return true;
    }
    // [优化源匹配] 经过测速优选或失败回退后，源可能已切换
    // 只要标题一致即可播放（episodes 可能在后台加载中）
    const paramTitle = (params.title || "").replace(/\s+/g, '').toLowerCase();
    const detailTitle = (detail.title || "").replace(/\s+/g, '').toLowerCase();
    if (detailTitle === paramTitle || detailTitle.includes(paramTitle) || paramTitle.includes(detailTitle)) {
      return true;
    }
    return false;
  }, [detail, params.id, params.source, params.fileUri, params.title]);

  const episodes = useMemo(() => {
    if (!detail || !Array.isArray(detail.episodes)) return [];
    const list = detail.episodes.map((raw, i) => ({ ...parseEpisode(raw, i), index: i }));
    return isReverse ? [...list].reverse() : list;
  }, [detail, isReverse]);

  const gesture = useMemo(() => {
    if (typeof Gesture?.Tap !== "function") return null;
    return Gesture.Tap()
      .maxDuration(250)
      .runOnJS(true)
      .onEnd(() => {
        const { showControls, setShowControls } = usePlayerStore.getState();
        setShowControls(!showControls);
      });
  }, []);

  const videoElement = useMemo(() => {
    // 确保 episode 存在且 url 不为空，否则不要渲染 Video 组件
    if (currentEpisode && currentEpisode.url && currentEpisode.url.trim() !== "") {
      return <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} />;
    }
    // 否则显示加载动画
    return <LoadingContainer style={styles.loadingContainer} currentEpisode={currentEpisode} />;
  }, [currentEpisode, videoProps]);

  const videoContent = useMemo(() => (
    <View style={styles.videoWrapper}>
      {videoElement}
      <SeekingBar />
      {currentEpisode?.url && isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#00bb5e" />
        </View>
      )}
    </View>
  ), [videoElement, currentEpisode?.url, isLoading]);

  const handleDownloadPress = useCallback(() => {
    const source = params.source || detail?.source;
    const id = params.id || detail?.id?.toString();
    const title = params.title || detail?.title;
    if (!currentEpisode?.url || !source || !id || !title) return;
    downloadEpisode({
      source,
      source_name: detail?.source_name || source,
      title: detail?.title || title,
      poster: detail?.poster || "",
      id,
      episodeIndex: currentEpisodeIndex,
      episodeTitle: currentEpisode.title,
      episodeUrl: currentEpisode.url,
      totalEpisodes: episodes.length,
    });
  }, [currentEpisode, currentEpisodeIndex, episodes.length, params, detail, downloadEpisode]);

  const safeUnload = useCallback(async () => {
    try {
      await videoRef.current?.unloadAsync();
    } catch (e) {}
  }, []);

  const handleEpisodePress = useCallback(async (idx: number) => {
    const source = params.source || detail?.source;
    const id = params.id || detail?.id?.toString();
    const title = params.title || detail?.title;
    if (idx === currentEpisodeIndex || !source || !id || !title) return;
    await safeUnload();
    loadVideo?.({ source, id, episodeIndex: idx, title });
  }, [currentEpisodeIndex, params, detail, loadVideo, safeUnload]);

  const handleSourcePress = useCallback(async (item: any) => {
    const sourceKey = params.source || detail?.source;
    if (!item || !item.source || item.source === sourceKey) return;

    // 切换源时保留当前播放进度
    const currentPos = status?.isLoaded ? status.positionMillis : undefined;

    try {
      await safeUnload();
      // 使用 await 确保状态同步
      if (typeof setDetail === 'function') {
        await setDetail(item);
      }

      if (typeof loadVideo === 'function') {
        loadVideo({
          source: item.source,
          id: (item.id || "").toString(),
          episodeIndex: currentEpisodeIndex,
          title: item.title || detail?.title || params.title || "播放",
          position: currentPos,
        });
      }
    } catch (e) {
      console.error("Switch source failed:", e);
    }
  }, [detail, params.source, params.title, safeUnload, setDetail, loadVideo, currentEpisodeIndex, status]);

  useEffect(() => {
    const doKeepAwake = async () => {
      try {
        if (status?.isLoaded && status?.isPlaying) {
          if (typeof activateKeepAwakeAsync === 'function') {
            await activateKeepAwakeAsync();
          }
        } else {
          if (typeof deactivateKeepAwakeAsync === 'function') {
            await deactivateKeepAwakeAsync();
          }
        }
      } catch (e) {}
    };
    doKeepAwake();
  }, [status?.isLoaded, status?.isPlaying]);

  useEffect(() => {
    return () => {
      if (typeof deactivateKeepAwakeAsync === 'function') {
        try {
          const p = deactivateKeepAwakeAsync();
          if (p && typeof p.catch === 'function') {
            p.catch(() => {});
          }
        } catch (e) {}
      }
    };
  }, []);

  useEffect(() => {
    setVideoRef?.(videoRef);
    setShowCastModal?.(false);
    const initialEpIndex = parseInt(params.episodeIndex || "0", 10);
    const position = params.position ? parseInt(params.position, 10) : undefined;

    if (params.fileUri) {
      loadVideo?.({
        source: params.source || "local",
        id: params.id || "local",
        episodeIndex: initialEpIndex,
        position,
        title: params.title || "离线播放",
        fileUri: params.fileUri,
      });
    } else if (params.source && params.id && params.title) {
      loadVideo?.({
        source: params.source,
        id: params.id,
        episodeIndex: initialEpIndex,
        position,
        title: params.title,
      });
    }

    // [逻辑升级] 已根据要求关闭进入播放页后的自动测速优化
    // const optimizeTimer = setTimeout(() => {
    //   const state = useDetailStore.getState();
    //   if (state.searchResults.length > 0 && !state.isOptimizing) {
    //     state.optimizeSources().catch(() => {});
    //   }
    // }, 1000);

    return () => {
      // clearTimeout(optimizeTimer);
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (typeof reset === 'function') reset();
        if (isMobile && ScreenOrientation?.lockAsync) {
          const promise = ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
          if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {});
          }
        }
      } catch (e) {}
    };
  }, [isMobile, reset]);

  useEffect(() => {
    const isLocalFile = !!params.fileUri;
    if (!isLocalFile && !detail && !detailLoading && !detailError) {
      const timer = setTimeout(() => {
        if (!useDetailStore.getState().detail) setIsInitFailed(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else if (detail) {
      setIsInitFailed(false);
    }
  }, [detail, detailLoading, detailError, params.fileUri]);

  // [模糊推荐] 确定无法播放时，搜索近似结果推荐给用户
  useEffect(() => {
    if (!isInitFailed || !params.title) return;
    const searchTitle = params.title;
    setFuzzyResults([]);
    api.searchVideos(searchTitle).then(res => {
      if (res?.results) {
        // 去除当前正在找的剧名本身
        const filtered = res.results.filter(r => {
          const rTitle = (r.title || "").replace(/\s+/g, '').toLowerCase();
          const qTitle = (searchTitle || "").replace(/\s+/g, '').toLowerCase();
          return rTitle !== qTitle && !rTitle.includes(qTitle);
        });
        setFuzzyResults(filtered.slice(0, 20));
      }
    }).catch(() => {});
  }, [isInitFailed, params.title]);

  useEffect(() => {
    const backAction = () => {
      if (showCastModal) {
        setShowCastModal?.(false);
        return true;
      }
      if (isFullscreen) {
        if (typeof ScreenOrientation?.lockAsync === 'function') {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
        }
        setIsFullscreen?.(false);
        return true;
      }
      if (showControls && deviceType === "tv") {
        setShowControls?.(false);
        return true;
      }
      router.back();
      return true;
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", backAction);

    return () => {
      try {
        if (subscription && typeof subscription.remove === 'function') {
          subscription.remove();
        } else {
          BackHandler.removeEventListener("hardwareBackPress", backAction);
        }
      } catch (e) {}
    };
  }, [showControls, showCastModal, isFullscreen, deviceType, router, setShowCastModal, setIsFullscreen, setShowControls]);

  const isLocalFile = !!params.fileUri;
  if (!isLocalFile && !detail && isInitFailed) {
    return (
      <ThemedView style={[styles.tvContainer, { justifyContent: "center", alignItems: "center", backgroundColor: isTV ? "black" : "#151718" }]}>
        <View style={{ alignItems: "center", paddingHorizontal: 20, maxWidth: 800, width: '100%' }}>
          <Text style={{ color: "#ff8c00", fontSize: isTV ? 28 : 20, marginBottom: 8, textAlign: "center" }}>
            😅 不好意思，视频失踪啦
          </Text>
          <Text style={{ color: "#aaa", fontSize: isTV ? 18 : 14, marginBottom: 24, textAlign: "center" }}>
            没有找到「{params.title || ""}」的播放源
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
            <StyledButton text="返回" onPress={() => router.back()} variant="ghost" />
            <StyledButton text="去搜索" onPress={() => {
              router.back();
              setTimeout(() => router.push({ pathname: "/search", params: { q: params.title } }), 300);
            }} />
          </View>

          {fuzzyResults.length > 0 && (
            <>
              <Text style={{ color: "#888", fontSize: isTV ? 16 : 13, marginBottom: 12, alignSelf: 'flex-start' }}>
                可以推荐你看看这些：
              </Text>
              <ScrollView style={{ width: '100%', maxHeight: isTV ? 500 : 300 }} showsVerticalScrollIndicator={true}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                  {fuzzyResults.map((item, idx) => (
                    <TouchableOpacity
                      key={`${item.source}-${item.id}-${idx}`}
                      style={{
                        backgroundColor: '#1a1a2e',
                        borderRadius: 8,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        marginBottom: 4,
                        width: isTV ? '30%' : '45%',
                        borderWidth: 1,
                        borderColor: '#333',
                      }}
                      onPress={() => {
                        router.push({
                          pathname: "/detail",
                          params: { source: 'all', q: item.title },
                        });
                      }}
                    >
                      <Text style={{ color: "#ddd", fontSize: isTV ? 15 : 13, fontWeight: '600' }} numberOfLines={2}>
                        {item.title}
                      </Text>
                      {item.source_name && (
                        <Text style={{ color: "#666", fontSize: 11, marginTop: 4 }}>{item.source_name}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )}

          {fuzzyResults.length === 0 && (
            <Text style={{ color: "#555", fontSize: isTV ? 14 : 12, marginTop: 8 }}>
              正在搜索类似内容...
            </Text>
          )}
        </View>
      </ThemedView>
    );
  }

  if (!isLocalFile && (!detail || !isDetailMatching)) {
    return (
      <ThemedView style={[styles.tvContainer, { backgroundColor: isTV ? "black" : "#151718", justifyContent: "center", alignItems: "center" }]}>
        <VideoLoadingAnimation showProgressBar />
      </ThemedView>
    );
  }

  const source = params.source || detail?.source;

  const renderMobileLayout = () => (
    <View style={[styles.mobileContainer, isFullscreen && styles.fullscreenContainer]}>
      {!isFullscreen && (
        <View style={[styles.customHeader, { paddingTop: Math.max((insets?.top || 0), 10), backgroundColor: '#151718' }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{detail?.title || params?.title || "播放"}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.overlayIcon} onPress={handleDownloadPress}>
              <Download size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.overlayIcon, { marginLeft: 8 }]} onPress={() => setShowCastModal?.(true)}>
              <Cast size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={isFullscreen ? styles.playerSectionFullscreen : [styles.playerSection, { marginTop: 0 }]}>
        {gesture ? (
          <GestureDetector gesture={gesture}>
            <View style={{ flex: 1 }}>{videoContent}</View>
          </GestureDetector>
        ) : (
          <TouchableOpacity activeOpacity={1} onPress={() => setShowControls(!showControls)} style={{ flex: 1 }}>
            {videoContent}
          </TouchableOpacity>
        )}
        {showControls && <PlayerControls showControls={showControls} setShowControls={setShowControls} />}
      </View>

      {!isFullscreen && (
        <View style={[styles.mobileBottomBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.mobileTabBar}>
            {(['episodes', 'sources', 'desc'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.mobileTabItem, activeTab === tab && styles.mobileTabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.mobileTabLabel, activeTab === tab && styles.mobileTabLabelActive]}>
                  {tab === 'episodes' ? '选集' : tab === 'sources' ? '播放源' : '详情'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'episodes' && (
            <ScrollView style={styles.episodeScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.episodeScrollContent}>
                {episodes.map((ep) => (
                  <TouchableOpacity
                    key={ep.index}
                    style={[
                      styles.mobileEpItem,
                      ep.index === currentEpisodeIndex && styles.mobileEpItemActive,
                    ]}
                    onPress={() => handleEpisodePress(ep.index)}
                  >
                    <Text style={[styles.mobileEpText, ep.index === currentEpisodeIndex && styles.mobileEpTextActive]}>
                      {ep.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          {activeTab === 'sources' && (
            <ScrollView style={styles.episodeScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.sourceHeader}>
                <Text style={styles.sourceHeaderText}>共 {searchResults?.length || 0} 个播放源</Text>
                <TouchableOpacity
                  style={[styles.optimizeBtn, isOptimizing && styles.optimizeBtnDisabled]}
                  onPress={() => { if (!isOptimizing) optimizeSources(); }}
                  disabled={isOptimizing}
                >
                  {isOptimizing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Zap size={14} color="#fff" fill="#fff" />
                  )}
                  <Text style={styles.optimizeBtnText}>
                    {isOptimizing ? '测速中...' : '一键优化'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.episodeScrollContent}>
                {(searchResults || []).map((item, idx) => {
                  if (!item) return null;
                  const isSelected = source === item.source;
                  return (
                    <TouchableOpacity
                      key={`${item.source}-${idx}`}
                      style={[
                        styles.mobileEpItem,
                        { minWidth: '45%' },
                        isSelected && styles.mobileEpItemActive,
                      ]}
                      onPress={() => handleSourcePress(item)}
                    >
                      <View style={{ alignItems: 'center' }}>
                        <Text style={[styles.mobileEpText, isSelected && { color: '#fff' }]} numberOfLines={1}>
                          {item.source_name}
                        </Text>
                        {(item.speed !== undefined && item.speed > 0) ? (
                          <Text style={{ fontSize: 9, color: isSelected ? 'rgba(255,255,255,0.8)' : '#888', marginTop: 2 }}>
                            {SpeedTestService.formatSpeed(item.speed)} · {Math.round(item.latency || 0)}ms
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 9, color: '#555', marginTop: 2 }}>待测速</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {activeTab === 'desc' && (
            <ScrollView style={styles.descScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.descText}>{detail?.desc || '暂无简介'}</Text>
              <View style={styles.metaInfo}>
                <Text style={styles.metaText}>{detail?.year} · {detail?.type_name}</Text>
              </View>
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );

  return (
    <ThemedView style={{ flex: 1, backgroundColor: isFullscreen || isTV ? "black" : "#151718" }}>
      <StatusBar hidden={isFullscreen} translucent={isFullscreen} style="light" animated={true} />
      {isTV ? (
        <ThemedView focusable style={styles.tvContainer}>
          <View style={styles.videoWrapper}>
            <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} />
            <SeekingBar />
          </View>
          {showControls && <PlayerControls showControls={showControls} setShowControls={setShowControls} />}
        </ThemedView>
      ) : renderMobileLayout()}
      <EpisodeSelectionModal />
      <SourceSelectionModal />
      <SpeedSelectionModal />
      {!isTV && <CastModal />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tvContainer: { flex: 1 },
  mobileContainer: { flex: 1 },
  customHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: "bold", color: "#00bb5e", marginHorizontal: 8 },
  headerActions: { flexDirection: "row", alignItems: "center" },
  overlayIcon: { padding: 6, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 20 },
  playerSection: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "transparent" },
  playerSectionFullscreen: { flex: 1, backgroundColor: "#000" },
  videoWrapper: { flex: 1 },
  videoPlayer: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(21, 23, 24, 0.7)" },
  mobileBottomBar: { flex: 1, paddingHorizontal: 10, paddingTop: 4 },
  mobileTabBar: { flexDirection: 'row', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  mobileTabItem: { paddingVertical: 10, paddingHorizontal: 16, marginRight: 8 },
  mobileTabActive: { borderBottomWidth: 2, borderBottomColor: '#00bb5e' },
  mobileTabLabel: { color: '#888', fontSize: 15, fontWeight: '600' },
  mobileTabLabelActive: { color: '#00bb5e' },
  descScroll: { flex: 1 },
  descText: { color: '#aaa', fontSize: 14, lineHeight: 22 },
  metaInfo: { marginTop: 12, paddingBottom: 30 },
  metaText: { color: '#555', fontSize: 12 },
  episodeScroll: { flex: 1, marginBottom: 12 },
  episodeScrollContent: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 60 },
  sourceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingRight: 4 },
  sourceHeaderText: { color: '#888', fontSize: 13 },
  optimizeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00bb5e', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, gap: 4 },
  optimizeBtnDisabled: { backgroundColor: '#2a5a3a' },
  optimizeBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  mobileEpItem: { backgroundColor: "#1a1a1a", paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8, marginRight: 8, marginBottom: 8, justifyContent: 'center', minWidth: 50, borderWidth: 1, borderColor: '#222' },
  mobileEpItemActive: { backgroundColor: "#00bb5e" },
  mobileEpText: { color: "#999", fontSize: 13, fontWeight: "600", textAlign: 'center' },
  mobileEpTextActive: { color: "#fff" },
  fullscreenContainer: { paddingTop: 0, paddingHorizontal: 0 },
});
