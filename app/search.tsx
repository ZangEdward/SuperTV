import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { View, TextInput, StyleSheet, Alert, Keyboard, TouchableOpacity, ScrollView, Animated } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import VideoCard from "@/components/VideoCard";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import { api, SearchResult } from "@/services/api";
import { Search, QrCode, History, FolderSearch, ArrowDown10, ArrowUp10, ArrowDownUp, X } from "lucide-react-native";
import { StyledButton } from "@/components/StyledButton";
import { useRemoteControlStore } from "@/stores/remoteControlStore";
import { RemoteControlModal } from "@/components/RemoteControlModal";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/Colors";
import CustomScrollView from "@/components/CustomScrollView";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";
import { DeviceUtils } from "@/utils/DeviceUtils";
import useSearchStore from "@/stores/searchStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Logger from '@/utils/Logger';

const logger = Logger.withTag('SearchScreen');
const HISTORY_KEY = "search_history_v2";

export default function SearchScreen() {
  const {
    keyword, results, loading, error, setKeyword, search, searchProgress,
    useAggregatedView, setUseAggregatedView,
    yearSortOrder
  } = useSearchStore();

  const textInputRef = useRef<TextInput>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const { showModal: showRemoteModal, lastMessage, targetPage, clearMessage } = useRemoteControlStore();
  const { remoteInputEnabled } = useSettingsStore();
  const router = useRouter();

  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  useEffect(() => {
    loadHistory();
    setTimeout(() => textInputRef.current?.focus(), 100);
  }, []);

  const loadHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch (e) {}
  };

  const saveHistory = async (newHistory: string[]) => {
    try {
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      setHistory(newHistory);
    } catch (e) {}
  };

  const addHistoryItem = (item: string) => {
    if (!item.trim()) return;
    const filtered = history.filter(h => h !== item.trim());
    const updated = [item.trim(), ...filtered].slice(0, 20);
    saveHistory(updated);
  };

  const clearHistory = () => {
    Alert.alert("清空搜索历史", "确定要清空所有搜索历史吗？", [
      { text: "取消", style: "cancel" },
      { text: "清空", style: "destructive", onPress: () => saveHistory([]) }
    ]);
  };

  const removeHistoryItem = (item: string) => {
    saveHistory(history.filter(h => h !== item));
  };

  useEffect(() => {
    if (lastMessage && targetPage === 'search') {
      const realMessage = lastMessage.split("_")[0];
      setKeyword(realMessage);
      handleSearchInternal(realMessage);
      clearMessage();
    }
  }, [lastMessage, targetPage]);

  const handleSearchInternal = (text?: string) => {
    const term = text || keyword;
    if (!term.trim()) return;
    addHistoryItem(term.trim());
    Keyboard.dismiss();
    search(term);
  };

  const onSearchPress = () => handleSearchInternal();

  const handleQrPress = () => {
    if (!remoteInputEnabled) {
      Alert.alert("远程输入未启用", "请先在设置页面中启用远程输入功能", [
        { text: "取消", style: "cancel" },
        { text: "去设置", onPress: () => router.push("/settings") },
      ]);
      return;
    }
    showRemoteModal('search');
  };

  const filteredResults = useMemo(() => {
    let list = [...results];
    if (yearSortOrder !== 'none') {
      list.sort((a, b) => {
        const yA = parseInt(a.year) || 0;
        const yB = parseInt(b.year) || 0;
        return yearSortOrder === 'desc' ? yB - yA : yA - yB;
      });
    }
    return list;
  }, [results, yearSortOrder]);

  const aggregatedResults = useMemo(() => {
    if (!useAggregatedView) return filteredResults;

    const groups = new Map<string, SearchResult & { sourceCount: number }>();
    filteredResults.forEach(r => {
      // [智能聚合 Key]：去除清晰度标签、剔除所有空格，确保“火影 忍者”与“火影忍者”聚合
      const titleClean = r.title
        .replace(/\[.*?\]|【.*?】|高清版|蓝光版/g, '')
        .replace(/\s+/g, '') // 物理移除标题中所有空格
        .trim()
        .toLowerCase();
      const key = `${titleClean}_${r.year || '0'}`;

      if (!groups.has(key)) {
        groups.set(key, { ...r, sourceCount: 1 });
      } else {
        const existing = groups.get(key)!;
        existing.sourceCount += 1;
        // 保留信息更全（集数更多）的版本作为展示封面
        if ((r.episodes?.length || 0) > (existing.episodes?.length || 0)) {
           const count = existing.sourceCount;
           Object.assign(existing, r);
           existing.sourceCount = count;
        }
      }
    });
    return Array.from(groups.values());
  }, [filteredResults, useAggregatedView]);

  const renderItem = useCallback(({ item }: { item: SearchResult & { sourceCount?: number }; index: number }) => (
    <VideoCard
      id={item.id.toString()}
      source={item.source}
      title={item.title}
      poster={item.poster}
      year={item.year}
      sourceName={item.source_name}
      totalEpisodes={item.episodes?.length}
      sourceCount={item.sourceCount}
      api={api}
      from={useAggregatedView ? "agg" : "search"}
    />
  ), [useAggregatedView]);

  const dynamicStyles = createResponsiveStyles(deviceType, spacing);

  const renderHistory = () => (
    <View style={dynamicStyles.historyContainer}>
      <View style={dynamicStyles.sectionHeader}>
        <View style={dynamicStyles.sectionTitleRow}>
          <History size={18} color="#ccc" style={{ marginRight: 8 }} />
          <ThemedText style={dynamicStyles.sectionTitle}>搜索历史</ThemedText>
        </View>
        {history.length > 0 && (
          <TouchableOpacity onPress={clearHistory} style={dynamicStyles.clearBtn}>
            <ThemedText style={dynamicStyles.clearText}>清空</ThemedText>
          </TouchableOpacity>
        )}
      </View>
      {history.length === 0 ? (
        <View style={dynamicStyles.emptyHistory}>
          <History size={64} color="#222" />
          <ThemedText style={{ color: '#555', marginTop: 16 }}>暂无搜索历史</ThemedText>
        </View>
      ) : (
        <View style={dynamicStyles.historyList}>
          {history.map((item, idx) => (
            <View key={idx} style={dynamicStyles.historyPillWrapper}>
              <TouchableOpacity
                style={dynamicStyles.historyPill}
                onPress={() => {
                  setKeyword(item);
                  handleSearchInternal(item);
                }}
              >
                <ThemedText style={dynamicStyles.historyText}>{item}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={dynamicStyles.historyDelete} onPress={() => removeHistoryItem(item)}>
                <X size={12} color="#888" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderSearchContent = () => (
    <>
      <View style={dynamicStyles.searchHeader}>
        <View style={[dynamicStyles.inputContainer, isInputFocused && { borderColor: Colors.dark.primary }]}>
          <Search size={18} color="#888" style={{ marginLeft: 12 }} />
          <TextInput
            ref={textInputRef}
            style={dynamicStyles.input}
            placeholder="搜索电影、剧集..."
            placeholderTextColor="#555"
            value={keyword}
            onChangeText={setKeyword}
            onSubmitEditing={onSearchPress}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            returnKeyType="search"
          />
          {keyword.length > 0 && (
            <TouchableOpacity onPress={() => setKeyword('')} style={{ padding: 10 }}>
              <X size={18} color="#888" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={dynamicStyles.searchCircleBtn} onPress={onSearchPress}>
          <Search size={20} color="white" />
        </TouchableOpacity>
        {deviceType !== 'mobile' && (
          <TouchableOpacity style={dynamicStyles.qrCircleBtn} onPress={handleQrPress}>
            <QrCode size={20} color="white" />
          </TouchableOpacity>
        )}
      </View>

      {results.length === 0 && !loading ? (
        renderHistory()
      ) : (
        <View style={{ flex: 1 }}>
          <View style={dynamicStyles.resultsTitleRow}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <ThemedText style={dynamicStyles.resultsTitle}>搜索结果</ThemedText>
              {searchProgress.total > 0 && (
                <ThemedText style={dynamicStyles.progressText}>
                  {`${searchProgress.completed}/${searchProgress.total}`}
                </ThemedText>
              )}
            </View>

            <View style={dynamicStyles.aggToggleWrapper}>
              <ThemedText style={[dynamicStyles.aggLabel, useAggregatedView && { color: 'white' }]}>聚合</ThemedText>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setUseAggregatedView(!useAggregatedView)}
                style={[dynamicStyles.switchTrack, useAggregatedView && { backgroundColor: Colors.dark.primary }]}
              >
                <View style={[dynamicStyles.switchThumb, useAggregatedView && { transform: [{ translateX: 14 }] }]} />
              </TouchableOpacity>
            </View>
          </View>

          {aggregatedResults.length === 0 && searchProgress.total > 0 && !searchProgress.isComplete ? (
            <View style={dynamicStyles.centerProgressWrapper}>
               <ThemedText style={dynamicStyles.searchingText}>全网激进检索中...</ThemedText>
               <View style={dynamicStyles.mainProgressBarBg}>
                 <View style={[dynamicStyles.mainProgressBarFill, { width: `${(searchProgress.completed / searchProgress.total) * 100}%` }]} />
               </View>
               <ThemedText style={dynamicStyles.progressPercentage}>
                 {Math.round((searchProgress.completed / searchProgress.total) * 100)}%
               </ThemedText>
            </View>
          ) : aggregatedResults.length === 0 && searchProgress.isComplete ? (
            <View style={[commonStyles.center, { flex: 1, paddingBottom: 100 }]}>
               <FolderSearch size={64} color="#222" />
               <ThemedText style={{ color: '#7f8c8d', marginTop: 16, fontSize: 18, fontWeight: '500' }}>未找到结果</ThemedText>
            </View>
          ) : (
            <>
              {searchProgress.total > 0 && !searchProgress.isComplete && (
                <View style={dynamicStyles.loadingBarBg}>
                  <View style={[dynamicStyles.loadingBarFill, { width: `${(searchProgress.completed / searchProgress.total) * 100}%` }]} />
                </View>
              )}
              <CustomScrollView
                data={aggregatedResults}
                renderItem={renderItem}
                loading={loading && aggregatedResults.length === 0}
                error={error}
              />
            </>
          )}
        </View>
      )}
      <RemoteControlModal />
    </>
  );

  const content = (
    <ThemedView style={[commonStyles.container, dynamicStyles.container]}>
      {renderSearchContent()}
    </ThemedView>
  );

  if (deviceType === 'tv') return content;

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="搜索" showBackButton={false} />
      {content}
    </ResponsiveNavigation>
  );
}

const createResponsiveStyles = (deviceType: string, spacing: number) => {
  return StyleSheet.create({
    container: { flex: 1, paddingTop: deviceType === "tv" ? 40 : 0, backgroundColor: '#121212' },
    searchHeader: { flexDirection: "row", paddingHorizontal: spacing + 4, paddingVertical: 14, alignItems: "center" },
    inputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 44, backgroundColor: "#1c1c1e", borderRadius: 22, borderWidth: 1, borderColor: "transparent" },
    input: { flex: 1, paddingLeft: 8, color: "white", fontSize: 15 },
    searchCircleBtn: { width: 44, height: 44, marginLeft: 10, justifyContent: "center", alignItems: "center", borderRadius: 22, backgroundColor: Colors.dark.primary },
    qrCircleBtn: { width: 44, height: 44, marginLeft: 10, justifyContent: "center", alignItems: "center", borderRadius: 22, backgroundColor: '#2c2c2e' },
    historyContainer: { paddingHorizontal: spacing + 8, paddingTop: 10 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: '#fff' },
    clearText: { fontSize: 14, color: '#7f8c8d' },
    emptyHistory: { height: 300, justifyContent: 'center', alignItems: 'center' },
    historyList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    historyPillWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', borderRadius: 20, paddingLeft: 16, paddingRight: 8, paddingVertical: 8, borderWidth: 1, borderColor: '#333' },
    historyPill: { marginRight: 4 },
    historyText: { fontSize: 14, color: '#ffffff' },
    historyDelete: { padding: 2 },
    resultsTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: spacing + 10, paddingVertical: 10 },
    resultsTitle: { fontSize: 18, fontWeight: '600', color: 'white' },
    progressText: { fontSize: 14, color: '#7f8c8d', marginLeft: 8 },
    aggToggleWrapper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    aggLabel: { fontSize: 14, color: '#7f8c8d', fontWeight: '500' },
    switchTrack: { width: 32, height: 18, backgroundColor: '#3a3a3c', borderRadius: 9, padding: 2 },
    switchThumb: { width: 14, height: 14, backgroundColor: 'white', borderRadius: 7 },
    centerProgressWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
    searchingText: { fontSize: 16, color: '#7f8c8d', marginBottom: 20, fontWeight: '600', letterSpacing: 1 },
    mainProgressBarBg: { width: '70%', height: 6, backgroundColor: '#1c1c1e', borderRadius: 3, overflow: 'hidden' },
    mainProgressBarFill: { height: '100%', backgroundColor: Colors.dark.primary, borderRadius: 3 },
    progressPercentage: { marginTop: 12, fontSize: 14, color: Colors.dark.primary, fontWeight: 'bold' },
    errorText: { color: "#e74c3c", fontSize: 15, marginTop: 16, textAlign: "center" },
    loadingBarBg: { height: 2, backgroundColor: "#1c1c1e", marginHorizontal: spacing + 10, marginBottom: 10, borderRadius: 1, overflow: "hidden" },
    loadingBarFill: { height: "100%", backgroundColor: Colors.dark.primary },
  });
};
