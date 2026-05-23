import React, { useEffect, useRef, useCallback, memo, useMemo, useState } from "react";
// Forced sync commit
import { StyleSheet, TouchableOpacity, BackHandler, View, ScrollView, Text, Dimensions, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Video } from "expo-av";
import { useKeepAwake, activateKeepAwakeAsync, deactivateKeepAwakeAsync } from "expo-keep-awake";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { PlayerControls } from "@/components/PlayerControls";
import { EpisodeSelectionModal } from "@/components/EpisodeSelectionModal";
import { SourceSelectionModal } from "@/components/SourceSelectionModal";
import { SpeedSelectionModal } from "@/components/SpeedSelectionModal";
import { CastModal } from "@/components/CastModal";
import { SeekingBar } from "@/components/SeekingBar";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import { ArrowLeft, ArrowUpDown, Download, Cast } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import useDetailStore from "@/stores/detailStore";
import { useTVRemoteHandler } from "@/hooks/useTVRemoteHandler";
import usePlayerStore, { selectCurrentEpisode } from "@/stores/playerStore";
import useCacheStore from "@/stores/cacheStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { useVideoHandlers } from "@/hooks/useVideoHandlers";
import { StyledButton } from "@/components/StyledButton";
import * as ScreenOrientation from 'expo-screen-orientation';
import Logger from '@/utils/Logger';

const logger = Logger.withTag('PlayScreen');
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// 注册全局 Toast 引用，防止某些参考路径下 ReferenceError
(globalThis as any).Toast = Toast;

const LoadingContainer = memo(({ style, currentEpisode }: { style: any; currentEpisode: any }) => (
  <View style={style}>
    <VideoLoadingAnimation showProgressBar />
  </View>
));

export default function PlayScreen() {
  const videoRef = useRef<Video>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deviceType, spacing, isPortrait } = useResponsiveLayout();
  const isMobile = deviceType === 'mobile';
  const isMobileLandscape = isMobile && !isPortrait;

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
  const isLocalFile = !!fileUri;

  const { detail, searchResults, setDetail, error: detailError, loading: detailLoading } = useDetailStore();

  // 关键修复：增加校验，确保当前 store 中的 detail 与路由参数匹配
  // 如果不匹配，说明是上一个视频的残余数据，应视为加载中
  const isDetailMatching = useMemo(() => {
    if (!detail) return false;
    if (isLocalFile) return true;
    return detail.id.toString() === videoId && detail.source === sourceStr;
  }, [detail, videoId, sourceStr, isLocalFile]);

  const source = sourceStr || detail?.source;
  const id = videoId || detail?.id.toString();
  const title = videoTitle || detail?.title;

  const {
    status: playbackStatus,
    isLoading,
    showControls,
    showCastModal,
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
    isFullscreen,
    setIsFullscreen,
  } = usePlayerStore();

  // 根据播放状态控制屏幕常亮
  useEffect(() => {




    try {
      if (playbackStatus?.isLoaded && (playbackStatus as any)?.isPlaying) {
        if (typeof activateKeepAwakeAsync === 'function') {
          activateKeepAwakeAsync().catch(() => {});
        }
      } else {
        if (typeof deactivateKeepAwakeAsync === 'function') {
          deactivateKeepAwakeAsync().catch(() => {});
        }
      }
    } catch (e) {
      console.error('[PlayScreen] KeepAwake effect error:', e);
    }
    return () => {
      try {
        if (typeof deactivateKeepAwakeAsync === 'function') {
          deactivateKeepAwakeAsync().catch(() => {});
        }
      } catch (e) {
        console.error('[PlayScreen] KeepAwake cleanup error:', e);
      }
    };
  }, [playbackStatus?.isLoaded, (playbackStatus as any)?.isPlaying]);

  const { downloadEpisode } = useCacheStore();
  const currentEpisode = usePlayerStore(selectCurrentEpisode);

  const [isReverse, setIsReverse] = useState(false);
  const [isInitFailed, setIsInitFailed] = useState(false);

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
    if (typeof setVideoRef === 'function') {
      setVideoRef(videoRef);
    }

    if (typeof setShowCastModal === 'function') {
      setShowCastModal(false);
    }

    try {
      if (typeof loadVideo !== 'function') {
        return;
      }
      if (fileUri) {
        loadVideo({
          source: sourceStr || 'local',
          id: videoId || 'local',
          episodeIndex: initialEpIndex,
          position,
          title: videoTitle || '离线播放',
          fileUri
        });
      } else if (sourceStr && videoId && videoTitle) {
        // Use router params for initial load to avoid dependency on 'detail' which changes during load
        loadVideo({ source: sourceStr, id: videoId, episodeIndex: initialEpIndex, position, title: videoTitle });
      }
    } catch (e) {
      console.error('[PlayScreen] loadVideo error:', e);
    }
  }, [initialEpIndex, sourceStr, videoId, videoTitle, position, setVideoRef, loadVideo, fileUri]);

  // Handle unmount cleanup separately to avoid resetting on every param update
  useEffect(() => {
    return () => {
      reset();
      if (isMobile) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
      }
    };
  }, [reset, isMobile]);

  // 检测初始化失败：detail为null且detailStore已完成加载
  useEffect(() => {
    if (!isLocalFile && !detail && !detailLoading && !detailError) {
      const timer = setTimeout(() => {
        const currentDetail = useDetailStore.getState().detail;
        if (!currentDetail) {
          setIsInitFailed(true);
        }
      }, 1500);
      return () => clearTimeout(timer);
    } else if (detail) {
      setIsInitFailed(false);
    }
  }, [detail, detailLoading, detailError, isLocalFile]);

  const onScreenPress = useCallback(() => {
    if (deviceType === "tv") {
      tvRemoteHandler.onScreenPress();
    } else {
      setShowControls(!showControls);
    }
  }, [deviceType, tvRemoteHandler, setShowControls, showControls]);

  useEffect(() => {
    const backAction = () => {
      if (showCastModal) {
        setShowCastModal(false);
        return true;
      }
      if (isFullscreen) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
        setIsFullscreen(false);
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
  }, [showControls, showCastModal, isFullscreen, deviceType, setShowControls, setShowCastModal, setIsFullscreen, router]);

  const episodes = useMemo(() => {
    if (!detail || !Array.isArray(detail.episodes)) return [];
    const list = detail.episodes.map((url: string, i: number) => ({ index: i, url }));
    return isReverse ? [...list].reverse() : list;
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

  const handleDownloadCurrent = () => {
    // 防御性检查：双重确保 Toast 可用（预防因模块加载时序导致的全局引用失败）
    const safeToast = (globalThis as any).Toast || Toast;
    if (!safeToast) {
      logger.error('[handleDownloadCurrent] Toast 对象不可用，无法显示提示');
      try {
        // 兜底：如果连 Toast 都没有，至少用日志记录错误
        downloadEpisode({
          source: source as string,
          source_name: detail?.source_name || source as string,
          title: title as string,
          poster: detail?.poster || '',
          id: id as string,
          episodeIndex: currentEpisodeIndex,
          episodeTitle: `第 ${currentEpisodeIndex + 1} 集`,
          episodeUrl: currentEpisode!.url,
          totalEpisodes: episodes?.length || 1,
          resolution: (detail as any)?.resolution || null,
        });
      } catch (innerErr) {
        logger.error('[handleDownloadCurrent] 兜底下载也失败:', innerErr);
      }
      return;
    }
    try {
      if (!currentEpisode || !currentEpisode.url || !source || !id || !title) {

        safeToast.show({ type: "error", text1: "下载失败", text2: "缺少必要参数，无法下载" });
        return;
      }
      const episodeTitle = `第 ${currentEpisodeIndex + 1} 集`;

      safeToast.show({ type: "info", text1: "添加下载", text2: `${title} ${episodeTitle} 已加入下载队列` });

      const downloadParams = {
        source,
        source_name: detail?.source_name || source,
        title,
        poster: detail?.poster || '',
        id,
        episodeIndex: currentEpisodeIndex,
        episodeTitle,
        episodeUrl: currentEpisode.url,
        totalEpisodes: episodes?.length || 1,
        resolution: (detail as any)?.resolution || null,
      };

      logger.info("[handleDownloadCurrent] Params:", JSON.stringify(downloadParams));
      downloadEpisode(downloadParams);
    } catch (e) {
      logger.error("[handleDownloadCurrent] Error:", e);
      Toast.show({ type: "error", text1: "点击下载出错", text2: String(e) });
    }
  };

  // 如果初始化失败（detail为null且无法获取），显示错误页面
  if (!isLocalFile && !detail && isInitFailed) {
    return (
      <ThemedView style={[styles.tvContainer, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }]}>
        <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
          <Text style={{ color: '#ff4444', fontSize: 18, marginBottom: 12, fontWeight: '600' }}>无法加载播放源</Text>
          <Text style={{ color: '#aaa', fontSize: 14, marginBottom: 24, textAlign: 'center', lineHeight: 20 }}>
            该视频的播放源可能已过期或不可用{'\n'}请尝试从详情页重新选择播放源
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StyledButton text="返回" onPress={() => router.back()} variant="ghost" />
            <StyledButton
              text="从详情页打开"
              onPress={() => {
                if (title) {
                  router.replace({
                    pathname: '/detail',
                    params: { q: title, source: source || '', id: id || '' }
                  });
                } else {
                  router.back();
                }
              }}
              variant="primary"
            />
          </View>
        </View>
      </ThemedView>
    );
  }

  // 关键修复：如果详情不匹配或者正在加载，显示加载页
  if (!isLocalFile && (!detail || !isDetailMatching)) {
    if (detailError) {
      return (
        <ThemedView style={[styles.tvContainer, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }]}>
          <Text style={{ color: 'white', marginBottom: 20, fontSize: 16 }}>{detailError}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StyledButton text="返回" onPress={() => router.back()} variant="ghost" />
            <StyledButton
              text="从详情页打开"
              onPress={() => {
                if (title) {
                  router.replace({
                    pathname: '/detail',
                    params: { q: title, source: source || '', id: id || '' }
                  });
                } else {
                  router.back();
                }
              }}
              variant="primary"
            />
          </View>
        </ThemedView>
      );
    }

    return (
      <ThemedView style={[styles.tvContainer, { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }]}>
        <VideoLoadingAnimation showProgressBar />
        {/* TV端需要一个焦点元素防止切换页面时崩溃 */}
        {deviceType === 'tv' && (
           <TouchableOpacity focusable={true} style={{ position: 'absolute', opacity: 0 }} />
        )}
      </ThemedView>
    );
  }

  const renderMobileLayout = () => (
    <View style={[styles.mobileContainer, isFullscreen && styles.fullscreenContainer]}>
      {/* 顶部栏 - 仅在非全屏显示 */}
      {!isFullscreen && (
        <View style={styles.customHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{detail?.title || title || '播放'}</Text>
          <View style={styles.headerIcons}>
            {currentEpisode?.url && !isLocalFile && isMobile && (
              <TouchableOpacity style={styles.overlayIcon} onPress={handleDownloadCurrent}>
                <Download size={18} color="white" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.overlayIcon} onPress={() => setShowCastModal(true)}>
              <Cast size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 视频播放区 */}
      <View style={isFullscreen ? styles.playerSectionFullscreen : [styles.playerSection, { marginTop: 10 }]}>
        <TouchableOpacity activeOpacity={1} style={styles.videoWrapper} onPress={onScreenPress}>
          {currentEpisode?.url ? (
            <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} />
          ) : isLoading ? (
            <LoadingContainer style={styles.loadingContainer} currentEpisode={currentEpisode} />
          ) : (
            <View style={styles.loadingContainer}>
              <Text style={{ color: 'white', marginBottom: 12 }}>无法获取播放链接</Text>
              <StyledButton
                text="重试"
                onPress={() => loadVideo({ source: source || '', id: id || '', episodeIndex: initialEpIndex, position, title: title || '' })}
              />
            </View>
          )}
          {showControls && <PlayerControls showControls={showControls} setShowControls={setShowControls} />}
          <SeekingBar />
          {currentEpisode?.url && isLoading && (
            <View style={styles.loadingOverlay}><ActivityIndicator size="large" color="#00bb5e" /></View>
          )}
        </TouchableOpacity>
      </View>

      {/* 底部简化的选集 + 换源 - 仅在非全屏显示，方便快速切换 */}
      {!isFullscreen && (
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
                <ArrowUpDown size={14} color={isReverse ? "#00bb5e" : "#888"} />
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
      )}
    </View>
  );

  const renderTVLayout = () => (
    <ThemedView focusable style={styles.tvContainer}>
      <TouchableOpacity activeOpacity={1} style={styles.videoWrapper} onPress={onScreenPress}>
        {currentEpisode?.url ? (
          <Video ref={videoRef} style={styles.videoPlayer} {...videoProps} />
        ) : isLoading ? (
          <LoadingContainer style={styles.loadingContainer} currentEpisode={currentEpisode} />
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={{ color: 'white', marginBottom: 20, fontSize: 24 }}>无法获取播放链接</Text>
            <StyledButton
              text="重试"
              onPress={() => loadVideo({ source: source || '', id: id || '', episodeIndex: initialEpIndex, position, title: title || '' })}
            />
          </View>
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
      <StatusBar hidden={isFullscreen ? !showControls : false} animated={true} />
      {deviceType === 'tv' ? renderTVLayout() : renderMobileLayout()}
      <EpisodeSelectionModal />
      <SourceSelectionModal />
      <SpeedSelectionModal />
      {deviceType !== 'tv' && <CastModal />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tvContainer: { flex: 1 },
  mobileContainer: { flex: 1, backgroundColor: '#000' },
  customHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingTop: 40, paddingBottom: 4 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: 'bold', color: '#00bb5e', marginHorizontal: 8 },
  headerIcons: { flexDirection: 'row', gap: 4 },
  overlayIcon: { padding: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20 },
  playerSection: { width: '100%', aspectRatio: 16/9, backgroundColor: '#000' },
  videoWrapper: { flex: 1 },
  videoPlayer: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },

  mobileBottomBar: { flex: 1, paddingHorizontal: 10, paddingTop: 8 },
  mobileSection: { marginBottom: 10 },
  mobileSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  mobileSectionTitle: { color: '#eee', fontSize: 14, fontWeight: '600' },
  rangeSelector: { backgroundColor: '#1a1a1a', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderLeftWidth: 2, borderLeftColor: '#00bb5e' },
  rangeText: { color: '#00bb5e', fontSize: 11, fontWeight: '600' },
  reverseBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  reverseText: { color: '#777', fontSize: 12 },

  episodeScroll: { maxHeight: 40, marginBottom: 2 },
  mobileEpItem: { backgroundColor: '#1a1a1a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 6 },
  mobileEpItemActive: { backgroundColor: '#00bb5e' },
  mobileEpText: { color: '#999', fontSize: 13, fontWeight: '600' },
  mobileEpTextActive: { color: '#fff' },

  sourceScroll: { maxHeight: 38 },
  mobileSourceItem: { backgroundColor: '#1a1a1a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, marginRight: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  mobileSourceItemActive: { borderColor: '#00bb5e', borderWidth: 1, backgroundColor: 'rgba(0,187,94,0.08)' },
  mobileSourceText: { color: '#bbb', fontSize: 12, maxWidth: 90 },
  mobileSourceTextActive: { color: '#00bb5e', fontWeight: '700' },
  mobileSourceEpisodes: { color: '#555', fontSize: 10 },
  // Fullscreen Styles
  fullscreenContainer: {
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  playerSectionFullscreen: {
    flex: 1,
    backgroundColor: '#000',
  },
});
