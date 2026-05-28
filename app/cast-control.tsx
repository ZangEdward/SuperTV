import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  GestureResponderEvent,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedView } from "@/components/ThemedView";
import usePlayerStore, { selectCurrentEpisode } from "@/stores/playerStore";
import useDetailStore from "@/stores/detailStore";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { LogOut, Play, Pause, SkipBack, SkipForward, Zap, ChevronDown, Tv } from "lucide-react-native";
import { SpeedTestService } from "@/services/speedTestService";
import { dlnaService, DLNADevice } from "@/services/dlnaService";
import { parseEpisode } from "@/utils/episode";
import Toast from "react-native-toast-message";
import { StatusBar } from "expo-status-bar";

const formatTime = (milliseconds: number) => {
  if (!milliseconds && milliseconds !== 0) return "00:00";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

export default function CastControlScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deviceType } = useResponsiveLayout();
  const isMobile = deviceType === "mobile";
  const isTV = deviceType === "tv";

  // TV端不需要投屏控制页（TV本身就是被投屏设备）
  useEffect(() => {
    if (isTV) {
      router.replace('/');
    }
  }, [isTV, router]);

  const [activeTab, setActiveTab] = useState<'episodes' | 'sources'>('episodes');
  const [isReverse, setIsReverse] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const [localSeeking, setLocalSeeking] = useState(false);
  const [localSeekRatio, setLocalSeekRatio] = useState(0);
  const [showDeviceList, setShowDeviceList] = useState(false);

  const status = usePlayerStore(state => state.status);
  const currentEpisodeIndex = usePlayerStore(state => state.currentEpisodeIndex);
  const episodes = usePlayerStore(state => state.episodes);
  const isCasting = usePlayerStore(state => state.isCasting);
  const castingDevice = usePlayerStore(state => state.castingDevice);
  const togglePlayPause = usePlayerStore(state => state.togglePlayPause);
  const playEpisode = usePlayerStore(state => state.playEpisode);
  const stopCast = usePlayerStore(state => state.stopCast);
  const seekToPosition = usePlayerStore(state => state.seekToPosition);
  const syncCastProgress = usePlayerStore(state => state.syncCastProgress);
  const currentEpisode = usePlayerStore(selectCurrentEpisode);

  const detail = useDetailStore(state => state.detail);
  const searchResults = useDetailStore(state => state.searchResults);
  const isOptimizing = useDetailStore(state => state.isOptimizing);
  const optimizeSources = useDetailStore(state => state.optimizeSources);
  const setDetail = useDetailStore(state => state.setDetail);
  const loadVideo = usePlayerStore(state => state.loadVideo);

  const positionMillis = status?.isLoaded ? status.positionMillis : 0;
  const durationMillis = status?.isLoaded ? (status.durationMillis || 0) : 0;
  const progressRatio = localSeeking
    ? localSeekRatio
    : durationMillis > 0
      ? positionMillis / durationMillis
      : 0;
  const isPlaying = status?.isLoaded ? status.isPlaying : false;

  const hasPrevEpisode = currentEpisodeIndex > 0;
  const hasNextEpisode = currentEpisodeIndex < episodes.length - 1;

  // 非投屏状态时安全返回
  useEffect(() => {
    if (!isCasting && !castingDevice) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/");
      }
    }
  }, []); // 仅在挂载时检查一次

  // 定期同步投屏进度
  useEffect(() => {
    if (!isCasting) return;
    const interval = setInterval(() => {
      syncCastProgress();
    }, 3000);
    return () => clearInterval(interval);
  }, [isCasting, syncCastProgress]);

  const handleExitCast = useCallback(async () => {
    try {
      await stopCast();
    } catch (e) {
      // ignore
    }
    // 退出投屏后回到播放页，从当前进度继续播放
    const pos = status?.isLoaded ? status.positionMillis : 0;
    const epIdx = currentEpisodeIndex >= 0 ? currentEpisodeIndex : 0;
    router.replace({
      pathname: "/play",
      params: {
        source: detail?.source || '',
        id: detail?.id?.toString() || '',
        episodeIndex: epIdx.toString(),
        title: detail?.title || videoTitle,
        position: pos.toString(),
        q: detail?.title || videoTitle,
      },
    });
  }, [stopCast, router, status, currentEpisodeIndex, detail, videoTitle]);

  const handlePrevEpisode = useCallback(() => {
    if (hasPrevEpisode) {
      playEpisode(currentEpisodeIndex - 1);
    }
  }, [hasPrevEpisode, playEpisode, currentEpisodeIndex]);

  const handleNextEpisode = useCallback(() => {
    if (hasNextEpisode) {
      playEpisode(currentEpisodeIndex + 1);
    }
  }, [hasNextEpisode, playEpisode, currentEpisodeIndex]);

  const handleProgressTouch = useCallback(
    (e: GestureResponderEvent) => {
      if (barWidth <= 0) return;
      const touchX = e.nativeEvent.locationX;
      const ratio = Math.max(0, Math.min(touchX / barWidth, 1));
      setLocalSeeking(true);
      setLocalSeekRatio(ratio);
    },
    [barWidth],
  );

  const handleProgressRelease = useCallback(
    (e: GestureResponderEvent) => {
      if (barWidth <= 0) return;
      const touchX = e.nativeEvent.locationX;
      const ratio = Math.max(0, Math.min(touchX / barWidth, 1));
      setLocalSeeking(false);
      seekToPosition(ratio, true);
    },
    [barWidth, seekToPosition],
  );

  const formatDuration = durationMillis > 0 ? formatTime(durationMillis) : "00:00";
  const formatPosition = formatTime(positionMillis);

  const videoTitle = detail?.title || "";

  // 确保集数数据可用
  const episodeList = React.useMemo(() => {
    // 优先从 store 获取
    const storeEpisodes = usePlayerStore.getState().episodes;
    if (storeEpisodes && storeEpisodes.length > 0) {
      return storeEpisodes.map((ep, i) => ({ ...ep, index: i }));
    }
    // 回退到 detail 中的数据
    if (detail?.episodes && Array.isArray(detail.episodes)) {
      return detail.episodes.map((raw, i) => ({ ...parseEpisode(raw, i), index: i }));
    }
    return [];
  }, [episodes, detail, isReverse]);

  const sortedEpisodeList = React.useMemo(() => {
    return isReverse ? [...episodeList].reverse() : episodeList;
  }, [episodeList, isReverse]);

  // 点击播放集数
  const handleEpisodePress = useCallback(
    (idx: number) => {
      playEpisode(idx);
    },
    [playEpisode],
  );

  // 切换播放源
  const handleSourcePress = useCallback(
    async (item: any) => {
      const sourceKey = detail?.source;
      if (!item || !item.source || item.source === sourceKey) return;

      const currentPos = status?.isLoaded ? status.positionMillis : undefined;

      try {
        if (typeof setDetail === "function") {
          await setDetail(item);
        }

        if (typeof loadVideo === "function") {
          loadVideo({
            source: item.source,
            id: (item.id || "").toString(),
            episodeIndex: currentEpisodeIndex,
            title: item.title || detail?.title || "播放",
            position: currentPos,
          });
        }
      } catch (e) {
        console.error("Switch source failed:", e);
      }
    },
    [detail, status, setDetail, loadVideo, currentEpisodeIndex],
  );

  return (
    <ThemedView style={styles.container}>
      <StatusBar style="light" animated={true} />

      {/* 顶部栏：关机图标 + 标题(居中) + 收起↑ */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <TouchableOpacity onPress={handleExitCast} style={styles.iconBtn}>
          <LogOut size={20} color="#ff4444" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {videoTitle || "投屏播放"}
          </Text>
        </View>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <ChevronDown size={22} color="white" />
        </TouchableOpacity>
      </View>

      {/* 投屏设备信息（可点击更换设备） */}
      {castingDevice && (
        <TouchableOpacity
          style={styles.castInfoBar}
          onPress={() => setShowDeviceList(true)}
          activeOpacity={0.7}
        >
          <View style={styles.castInfoDot} />
          <Text style={styles.castInfoText}>
            正在投屏到 {castingDevice.name}
          </Text>
          <Text style={styles.changeDeviceText}> 更换</Text>
          <Tv size={14} color="#00bb5e" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      )}

      {/* 主控制区域 */}
      <View style={styles.controlSection}>
        {/* 时间显示 */}
        <Text style={styles.timeDisplay}>
          {formatPosition} / {formatDuration}
        </Text>

        {/* 可拖动进度条 */}
        <View
          style={styles.progressBarContainer}
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={handleProgressTouch}
          onResponderMove={handleProgressTouch}
          onResponderRelease={handleProgressRelease}
        >
          <View style={styles.progressBarBackground} />
          <View style={[styles.progressBarFilled, { width: `${progressRatio * 100}%` }]} />
          <View style={[styles.progressBarThumb, { left: `${progressRatio * 100}%` }]} />
        </View>

        {/* 控制按钮 */}
        <View style={styles.controlButtons}>
          <TouchableOpacity
            onPress={handlePrevEpisode}
            disabled={!hasPrevEpisode}
            style={styles.controlBtn}
          >
            <SkipBack size={28} color={hasPrevEpisode ? "white" : "#444"} />
          </TouchableOpacity>

          <TouchableOpacity onPress={togglePlayPause} style={styles.playBtn}>
            {isPlaying ? (
              <Pause size={36} color="white" />
            ) : (
              <Play size={36} color="white" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleNextEpisode}
            disabled={!hasNextEpisode}
            style={styles.controlBtn}
          >
            <SkipForward size={28} color={hasNextEpisode ? "white" : "#444"} />
          </TouchableOpacity>
        </View>

        {/* 微控制标签 */}
        <View style={styles.controlLabels}>
          <Text style={[styles.controlLabel, !hasPrevEpisode && styles.controlLabelDisabled]}>
            上一集
          </Text>
          <Text style={styles.controlLabel}>
            {isPlaying ? "暂停" : "恢复"}
          </Text>
          <Text style={[styles.controlLabel, !hasNextEpisode && styles.controlLabelDisabled]}>
            下一集
          </Text>
        </View>
      </View>

      {/* 底部选集/播放源 */}
      <View style={[styles.bottomSection, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.tabBar}>
          {(['episodes', 'sources'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                {tab === 'episodes' ? '选集' : '播放源'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'episodes' && (
          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderText}>当前正在播放</Text>
              <TouchableOpacity onPress={() => setIsReverse(prev => !prev)}>
                <Text style={styles.reverseBtnText}>
                  {isReverse ? '正序' : '倒序'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.episodeGrid}>
              {sortedEpisodeList.map((ep) => (
                <TouchableOpacity
                  key={ep.index}
                  style={[
                    styles.episodeItem,
                    ep.index === currentEpisodeIndex && styles.episodeItemActive,
                  ]}
                  onPress={() => handleEpisodePress(ep.index)}
                >
                  <Text
                    style={[
                      styles.episodeText,
                      ep.index === currentEpisodeIndex && styles.episodeTextActive,
                    ]}
                  >
                    {ep.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {activeTab === 'sources' && (
          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.sourceHeader}>
              <Text style={styles.sourceHeaderText}>
                共 {searchResults?.length || 0} 个播放源
              </Text>
              <TouchableOpacity
                style={[styles.optimizeBtn, isOptimizing && styles.optimizeBtnDisabled]}
                onPress={() => {
                  if (!isOptimizing) optimizeSources();
                }}
                disabled={isOptimizing}
              >
                {isOptimizing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Zap size={14} color="#fff" fill="#fff" />
                )}
                <Text style={styles.optimizeBtnText}>
                  {isOptimizing ? "测速中..." : "一键优化"}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.sourceGrid}>
              {(searchResults || []).map((item, idx) => {
                if (!item) return null;
                const isSelected = (detail?.source) === item.source;
                return (
                  <TouchableOpacity
                    key={`${item.source}-${idx}`}
                    style={[
                      styles.sourceItem,
                      isSelected && styles.sourceItemActive,
                    ]}
                    onPress={() => handleSourcePress(item)}
                  >
                    <View style={{ alignItems: "center" }}>
                      <Text
                        style={[styles.sourceName, isSelected && styles.sourceNameActive]}
                        numberOfLines={1}
                      >
                        {item.source_name}
                      </Text>
                      {item.speed !== undefined && item.speed > 0 ? (
                        <Text
                          style={[
                            styles.sourceMeta,
                            isSelected && styles.sourceMetaActive,
                          ]}
                        >
                          {SpeedTestService.formatSpeed(item.speed)} ·{" "}
                          {Math.round(item.latency || 0)}ms
                        </Text>
                      ) : (
                        <Text style={styles.sourceMetaPlaceholder}>待测速</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* 更换投屏设备弹窗 */}
      {showDeviceList && (
        <View style={styles.deviceOverlay}>
          <TouchableOpacity
            style={styles.deviceOverlayBg}
            onPress={() => setShowDeviceList(false)}
          />
          <View style={styles.devicePanel}>
            <Text style={styles.devicePanelTitle}>选择投屏设备</Text>
            <DeviceSelector
              onSelect={() => setShowDeviceList(false)}
              onClose={() => setShowDeviceList(false)}
            />
          </View>
        </View>
      )}
    </ThemedView>
  );
}

/** 内联设备选择器（复用 CastModal 逻辑） */
function DeviceSelector({ onSelect, onClose }: { onSelect: () => void; onClose: () => void }) {
  const [devices, setDevices] = useState<DLNADevice[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const searchTimerRef = useRef<any>(null);
  const mountedRef = useRef(true);
  const { episodes, currentEpisodeIndex, pause, setCastingDevice, castingDevice, stopCast } = usePlayerStore();

  const startSearch = useCallback(async () => {
    setDevices([]);
    setPermDenied(false);
    dlnaService.receivedKeys.clear();
    dlnaService.clearDevices?.();

    const permResult = await requestDlnaPermissions();
    if (!mountedRef.current) return;
    if (permResult !== 'granted') {
      setPermDenied(true);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    dlnaService.searchDevices((found) => {
      if (mountedRef.current) setDevices([...found]);
    });
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setIsSearching(false);
        dlnaService.stopSearch();
      }
    }, 15000);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    startSearch();
    return () => {
      mountedRef.current = false;
      dlnaService.stopSearch();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [startSearch]);

  const handleCast = async (device: DLNADevice) => {
    try {
      await dlnaService.castVideo(device, episodes[currentEpisodeIndex]?.url || '', episodes[currentEpisodeIndex]?.title || '');
      if (!mountedRef.current) return;
      setCastingDevice(device);
      onSelect();
      Toast.show({ type: 'success', text1: '已更换投屏设备', text2: `正在使用 ${device.name}` });
    } catch {
      Toast.show({ type: 'error', text1: '投屏失败', text2: '请重试' });
    }
  };

  return (
    <View>
      {permDenied && (
        <View style={styles.deviceLoadingRow}>
          <Text style={{ color: '#ff6b6b', fontSize: 13, textAlign: 'center' }}>未获取附近设备权限</Text>
          <TouchableOpacity style={{ marginTop: 12 }} onPress={startSearch}>
            <Text style={{ color: '#00bb5e', fontSize: 13, textAlign: 'center' }}>重新申请权限</Text>
          </TouchableOpacity>
        </View>
      )}
      {castingDevice && (
        <TouchableOpacity style={styles.deviceConnectedRow} onPress={async () => {
          await stopCast();
          setCastingDevice(null);
          startSearch();
        }}>
          <Text style={{ color: '#ff4444', fontSize: 13 }}>断开当前连接：{castingDevice.name}</Text>
        </TouchableOpacity>
      )}
      {isSearching && devices.length === 0 && (
        <View style={styles.deviceLoadingRow}>
          <ActivityIndicator size="small" color="#00bb5e" />
          <Text style={{ color: '#888', marginLeft: 8, fontSize: 13 }}>正在搜索设备...</Text>
        </View>
      )}
      {devices.map((d) => (
        <TouchableOpacity key={d.id} style={styles.deviceRow} onPress={() => handleCast(d)}>
          <Tv size={20} color="#00bb5e" />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 14 }}>{d.name}</Text>
            <Text style={{ color: '#666', fontSize: 11 }}>{d.host}</Text>
          </View>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.deviceCloseRow} onPress={onClose}>
        <Text style={{ color: '#888', fontSize: 13 }}>取消</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151718",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: "#151718",
  },
  iconBtn: {
    padding: 8,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  castInfoBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1a2a1a",
  },
  castInfoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00bb5e",
    marginRight: 8,
  },
  castInfoText: {
    color: "#ccc",
    fontSize: 13,
  },
  changeDeviceText: {
    color: "#00bb5e",
    fontSize: 12,
    textDecorationLine: "underline",
    marginLeft: 4,
  },
  controlSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  timeDisplay: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 16,
    letterSpacing: 1,
  },
  progressBarContainer: {
    width: "100%",
    height: 32,
    position: "relative",
    justifyContent: "center",
    marginBottom: 32,
  },
  progressBarBackground: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 2,
  },
  progressBarFilled: {
    position: "absolute",
    left: 0,
    height: 4,
    backgroundColor: "#00bb5e",
    borderRadius: 2,
  },
  progressBarThumb: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#00bb5e",
    marginLeft: -8,
    top: 8,
  },
  controlButtons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
  },
  controlBtn: {
    padding: 8,
  },
  playBtn: {
    backgroundColor: "#00bb5e",
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  controlLabels: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 48,
    marginTop: 8,
  },
  controlLabel: {
    color: "#888",
    fontSize: 12,
    textAlign: "center",
    width: 50,
  },
  controlLabelDisabled: {
    color: "#444",
  },
  bottomSection: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: "#222",
    paddingTop: 4,
  },
  tabBar: {
    flexDirection: "row",
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    paddingHorizontal: 10,
  },
  tabItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#00bb5e",
  },
  tabLabel: {
    color: "#888",
    fontSize: 15,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: "#00bb5e",
  },
  listScroll: {
    flex: 1,
    marginBottom: 8,
  },
  episodeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 10,
    paddingBottom: 40,
  },
  reverseBtn: {
    backgroundColor: "#2a2a2a",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#444",
  },
  reverseBtnText: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "600",
  },
  episodeItem: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    justifyContent: "center",
    minWidth: 50,
    borderWidth: 1,
    borderColor: "#222",
  },
  episodeItemActive: {
    backgroundColor: "#00bb5e",
  },
  episodeText: {
    color: "#999",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  episodeTextActive: {
    color: "#fff",
  },
  sourceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingRight: 18,
  },
  sourceHeaderText: {
    color: "#888",
    fontSize: 13,
  },
  optimizeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#00bb5e",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  optimizeBtnDisabled: {
    backgroundColor: "#2a5a3a",
  },
  optimizeBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  sourceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 10,
    paddingBottom: 40,
  },
  sourceItem: {
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    justifyContent: "center",
    minWidth: "45%",
    borderWidth: 1,
    borderColor: "#222",
  },
  sourceItemActive: {
    backgroundColor: "#00bb5e",
  },
  sourceName: {
    color: "#999",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  sourceNameActive: {
    color: "#fff",
  },
  sourceMeta: {
    fontSize: 9,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
    textAlign: "center",
  },
  sourceMetaActive: {
    color: "rgba(255,255,255,0.9)",
  },
  sourceMetaPlaceholder: {
    fontSize: 9,
    color: "#555",
    marginTop: 2,
    textAlign: "center",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sectionHeaderText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  // 更换设备弹窗
  deviceOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  deviceOverlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  devicePanel: {
    backgroundColor: "#1c1c1e",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: "60%",
  },
  devicePanelTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 16,
  },
  deviceConnectedRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
    marginBottom: 8,
  },
  deviceLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    justifyContent: "center",
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  deviceCloseRow: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
});
