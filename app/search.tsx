import React, { useState, useRef, useEffect, useMemo } from "react";
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
    selectedSource, selectedYear, selectedTitle, yearSortOrder, setFilters
  } = useSearchStore();

  const textInputRef = useRef<TextInput>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const { showModal: showRemoteModal, lastMessage, targetPage, clearMessage } = useRemoteControlStore();
  const { remoteInputEnabled } = useSettingsStore();
  const router = useRouter();

  // 响应式布局配置
  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  useEffect(() => {
    loadHistory();
    // 自动聚焦
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
    Alert.alert("清空搜索历史", "确定要清空所有搜索历史吗？此操作无法撤销。", [
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

  // --- 核心逻辑：筛选与聚合 (Selene 1:1 复刻) ---
  const filteredResults = useMemo(() => {
    let list = [...results];
    if (selectedSource !== 'all') list = list.filter(r => r.source_name === selectedSource);
    if (selectedYear !== 'all') list = list.filter(r => r.year === selectedYear);
    if (selectedTitle !== 'all') list = list.filter(r => r.title === selectedTitle);

    if (yearSortOrder !== 'none') {
      list.sort((a, b) => {
        const yA = parseInt(a.year) || 0;
        const yB = parseInt(b.year) || 0;
        return yearSortOrder === 'desc' ? yB - yA : yA - yB;
      });
    }
    return list;
  }, [results, selectedSource, selectedYear, selectedTitle, yearSortOrder]);

  const aggregatedResults = useMemo(() => {
    if (!useAggregatedView) return filteredResults;
    const groups = new Map<string, SearchResult & { sourceCount: number }>();
    filteredResults.forEach(r => {
      const key = `${r.title.trim().toLowerCase()}_${r.year}_${r.episodes?.length || 0}`;
      if (!groups.has(key)) {
        groups.set(key, { ...r, sourceCount: 1 });
      } else {
        const existing = groups.get(key)!;
        existing.sourceCount += 1;
        if (r.id > existing.id) {
          // 保留 ID 较大的作为主显，但维持计数
          const count = existing.sourceCount;
          Object.assign(existing, r);
          existing.sourceCount = count;
        }
      }
    });
    return Array.from(groups.values());
  }, [filteredResults, useAggregatedView]);

  const sourceOptions = useMemo(() => {
    const sources = Array.from(new Set(results.map(r => r.source_name))).sort();
    return ['all', ...sources];
  }, [results]);

  const yearOptions = useMemo(() => {
    const years = Array.from(new Set(results.map(r => r.year))).filter(y => !!y).sort().reverse();
    return ['all', ...years];
  }, [results]);

  const renderItem = ({ item }: { item: SearchResult & { sourceCount?: number }; index: number }) => (
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
      from={useAggregatedView ? "agg" : "search"} // 关键：Selene 风格角标
    />
  );

  const dynamicStyles = createResponsiveStyles(deviceType, spacing);

  const renderHistory = () => (
    <View style={dynamicStyles.historyContainer}>
      <View style={dynamicStyles.sectionHeader}>
        <View style={dynamicStyles.sectionTitleRow}>
          <ThemedText style={dynamicStyles.sectionTitle}>搜索历史</ThemedText>
        </View>
        {history.length > 0 && (
          <TouchableOpacity onPress={clearHistory}>
            <ThemedText style={dynamicStyles.clearText}>清空</ThemedText>
          </TouchableOpacity>
        )}
      </View>
      {history.length === 0 ? (
        <View style={dynamicStyles.emptyHistory}>
          <History size={64} color="#222" />
          <ThemedText style={{ color: '#555', marginTop: 16 }}>暂无搜索历史</ThemedText>
          <ThemedText style={{ color: '#333', marginTop: 4 }}>开始搜索你喜欢的内容吧</ThemedText>
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

  const renderFilters = () => (
    <View style={dynamicStyles.filterSection}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={dynamicStyles.filterScroll}>
        <TouchableOpacity
          style={dynamicStyles.filterPill}
          onPress={() => {
            const nextIdx = (sourceOptions.indexOf(selectedSource) + 1) % sourceOptions.length;
            setFilters({ selectedSource: sourceOptions[nextIdx] });
          }}
        >
          <ThemedText style={[dynamicStyles.filterLabel, selectedSource !== 'all' && dynamicStyles.filterLabelActive]}>
            来源
          </ThemedText>
          <ArrowDownUp size={12} color={selectedSource !== 'all' ? '#27ae60' : '#888'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={dynamicStyles.filterPill}
          onPress={() => {
            const nextIdx = (yearOptions.indexOf(selectedYear) + 1) % yearOptions.length;
            setFilters({ selectedYear: yearOptions[nextIdx] });
          }}
        >
          <ThemedText style={[dynamicStyles.filterLabel, selectedYear !== 'all' && dynamicStyles.filterLabelActive]}>
            年份
          </ThemedText>
          <ArrowDownUp size={12} color={selectedYear !== 'all' ? '#27ae60' : '#888'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={dynamicStyles.filterPill}
          onPress={() => {
            const next: any = yearSortOrder === 'none' ? 'desc' : yearSortOrder === 'desc' ? 'asc' : 'none';
            setFilters({ yearSortOrder: next });
          }}
        >
          <ThemedText style={[dynamicStyles.filterLabel, yearSortOrder !== 'none' && dynamicStyles.filterLabelActive]}>
            年份排序
          </ThemedText>
          {yearSortOrder === 'desc' ? <ArrowDown10 size={14} color="#27ae60" /> :
           yearSortOrder === 'asc' ? <ArrowUp10 size={14} color="#27ae60" /> :
           <ArrowDownUp size={14} color="#888" />}
        </TouchableOpacity>
      </ScrollView>
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
                style={[dynamicStyles.switchTrack, useAggregatedView && { backgroundColor: '#27ae60' }]}
              >
                <View style={[dynamicStyles.switchThumb, useAggregatedView && { transform: [{ translateX: 14 }] }]} />
              </TouchableOpacity>
            </View>
          </View>

          {results.length > 0 && renderFilters()}

          {searchProgress.total > 0 && !searchProgress.isComplete && (
            <View style={dynamicStyles.loadingBarBg}>
              <View style={[dynamicStyles.loadingBarFill, { width: `${(searchProgress.completed / searchProgress.total) * 100}%` }]} />
            </View>
          )}

          {loading && aggregatedResults.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
               <VideoLoadingAnimation />
            </View>
          ) : error && aggregatedResults.length === 0 ? (
            <View style={[commonStyles.center, { flex: 1, paddingBottom: 100 }]}>
               <FolderSearch size={64} color="#e74c3c" />
               <ThemedText style={dynamicStyles.errorText}>{error}</ThemedText>
               <StyledButton text="重试" onPress={onSearchPress} style={{ marginTop: 20 }} />
            </View>
          ) : aggregatedResults.length === 0 && searchProgress.isComplete ? (
            <View style={[commonStyles.center, { flex: 1, paddingBottom: 100 }]}>
               <FolderSearch size={64} color="#222" />
               <ThemedText style={{ color: '#7f8c8d', marginTop: 16, fontSize: 18, fontWeight: '500' }}>未找到结果</ThemedText>
               <ThemedText style={{ color: '#555', marginTop: 8 }}>请尝试更换关键词</ThemedText>
            </View>
          ) : (
            <CustomScrollView
              data={aggregatedResults}
              renderItem={renderItem}
              loading={loading && aggregatedResults.length === 0}
              error={error}
            />
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
  const isMobile = deviceType === "mobile";

  return StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: deviceType === "tv" ? 40 : 0,
      backgroundColor: '#121212',
    },
    searchHeader: {
      flexDirection: "row",
      paddingHorizontal: spacing + 4,
      paddingVertical: 14,
      alignItems: "center",
    },
    inputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 44,
      backgroundColor: "#1c1c1e",
      borderRadius: 22,
      borderWidth: 1,
      borderColor: "transparent",
    },
    input: {
      flex: 1,
      paddingLeft: 8,
      color: "white",
      fontSize: 15,
    },
    searchCircleBtn: {
      width: 44,
      height: 44,
      marginLeft: 10,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 22,
      backgroundColor: Colors.dark.primary,
    },
    qrCircleBtn: {
      width: 44,
      height: 44,
      marginLeft: 10,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 22,
      backgroundColor: '#2c2c2e',
    },
    historyContainer: {
      paddingHorizontal: spacing + 8,
      paddingTop: 10,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 16,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#fff',
    },
    clearText: {
      fontSize: 14,
      color: '#7f8c8d',
    },
    emptyHistory: {
      height: 300,
      justifyContent: 'center',
      alignItems: 'center',
    },
    historyList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    historyPillWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#1e1e1e',
      borderRadius: 20,
      paddingLeft: 16,
      paddingRight: 8,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: '#333',
    },
    historyPill: {
      marginRight: 4,
    },
    historyText: {
      fontSize: 14,
      color: '#ffffff',
    },
    historyDelete: {
      padding: 2,
    },
    resultsTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingHorizontal: spacing + 10,
      paddingVertical: 10,
    },
    resultsTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: 'white',
    },
    progressText: {
      fontSize: 14,
      color: '#7f8c8d',
      marginLeft: 8,
    },
    aggToggleWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    aggLabel: {
      fontSize: 14,
      color: '#7f8c8d',
      fontWeight: '500',
    },
    switchTrack: {
      width: 32,
      height: 18,
      backgroundColor: '#3a3a3c',
      borderRadius: 9,
      padding: 2,
    },
    switchThumb: {
      width: 14,
      height: 14,
      backgroundColor: 'white',
      borderRadius: 7,
    },
    filterSection: {
      paddingHorizontal: spacing + 6,
      marginBottom: 12,
    },
    filterScroll: {
      flexGrow: 0,
    },
    filterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 16,
      marginRight: 10,
      gap: 4,
    },
    filterLabel: {
      fontSize: 13,
      color: '#7f8c8d',
    },
    filterLabelActive: {
      color: '#27ae60',
      fontWeight: '500',
    },
    loadingBarBg: {
      height: 2,
      backgroundColor: "#1c1c1e",
      marginHorizontal: spacing + 10,
      marginBottom: 10,
      borderRadius: 1,
      overflow: "hidden",
    },
    loadingBarFill: {
      height: "100%",
      backgroundColor: '#27ae60',
    },
    errorText: {
      color: "#e74c3c",
      fontSize: 15,
      marginTop: 16,
      textAlign: "center",
    },
  });
};

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
  const isMobile = deviceType === "mobile";
  const minTouchTarget = DeviceUtils.getMinTouchTargetSize();

  return StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: deviceType === "tv" ? 50 : 0,
    },
    searchContainer: {
      flexDirection: "row",
      paddingHorizontal: spacing,
      marginBottom: 12,
      alignItems: "center",
      paddingTop: isMobile ? 10 : 0,
    },
    inputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      height: 46,
      backgroundColor: "#1c1c1e",
      borderRadius: 12,
      marginRight: 10,
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    input: {
      flex: 1,
      paddingLeft: 16,
      color: "white",
      fontSize: 16,
    },
    searchButton: {
      width: 46,
      height: 46,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 12,
      backgroundColor: Colors.dark.primary,
    },
    qrButton: {
      width: 46,
      height: 46,
      marginLeft: 10,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 12,
      backgroundColor: '#2c2c2e',
    },
    historyContainer: {
      paddingHorizontal: spacing,
      paddingTop: 10,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: 'white',
    },
    clearText: {
      fontSize: 14,
      color: '#888',
    },
    emptyHistory: {
      height: 100,
      justifyContent: 'center',
      alignItems: 'center',
    },
    historyList: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    historyPillWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#2c2c2e',
      borderRadius: 20,
      paddingLeft: 14,
      paddingRight: 8,
      paddingVertical: 6,
    },
    historyPill: {
      marginRight: 4,
    },
    historyText: {
      fontSize: 14,
      color: '#ddd',
    },
    historyDelete: {
      padding: 4,
    },
    resultsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing,
      paddingVertical: 10,
    },
    resultsTitle: {
      fontSize: 17,
      fontWeight: 'bold',
      color: 'white',
    },
    progressMiniText: {
      fontSize: 14,
      color: '#888',
      marginLeft: 6,
    },
    aggToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    aggLabel: {
      fontSize: 14,
      color: '#888',
      fontWeight: '600',
    },
    switchBg: {
      width: 32,
      height: 18,
      backgroundColor: '#3a3a3c',
      borderRadius: 9,
      padding: 2,
    },
    switchDot: {
      width: 14,
      height: 14,
      backgroundColor: 'white',
      borderRadius: 7,
    },
    filterScroll: {
      paddingHorizontal: spacing,
      marginBottom: 10,
      flexGrow: 0,
    },
    filterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: '#1c1c1e',
      marginRight: 8,
      gap: 4,
    },
    filterPillActive: {
      backgroundColor: 'rgba(0,187,94,0.1)',
      borderColor: 'rgba(0,187,94,0.3)',
      borderWidth: 1,
    },
    filterLabel: {
      fontSize: 13,
      color: '#888',
    },
    filterLabelActive: {
      color: Colors.dark.primary,
      fontWeight: '600',
    },
    progressBarBg: {
      height: 2,
      backgroundColor: "#1c1c1e",
      marginHorizontal: spacing,
      marginBottom: 10,
      borderRadius: 1,
      overflow: "hidden",
    },
    progressBarFill: {
      height: "100%",
      backgroundColor: Colors.dark.primary,
    },
    errorText: {
      color: "#ff4444",
      fontSize: 16,
      marginTop: 16,
      textAlign: "center",
    },
  });
};

  const content = (
    <ThemedView style={[commonStyles.container, dynamicStyles.container]}>
      {renderSearchContent()}
    </ThemedView>
  );

  if (deviceType === 'tv') {
    return content;
  }

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader title="搜索" showBackButton={false} />
      {content}
    </ResponsiveNavigation>
  );
}

const createResponsiveStyles = (deviceType: string, spacing: number) => {
  const isMobile = deviceType === "mobile";
  const minTouchTarget = DeviceUtils.getMinTouchTargetSize();

  return StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: deviceType === "tv" ? 50 : 0,
    },
    searchContainer: {
      flexDirection: "row",
      paddingHorizontal: spacing,
      marginBottom: spacing,
      alignItems: "center",
      paddingTop: isMobile ? spacing / 2 : 0,
    },
    inputContainer: {
      flex: 1,
      height: isMobile ? minTouchTarget : 50,
      backgroundColor: "#2c2c2e",
      borderRadius: isMobile ? 8 : 8,
      marginRight: spacing / 2,
      borderWidth: 2,
      borderColor: "transparent",
      justifyContent: "center",
    },
    input: {
      flex: 1,
      paddingHorizontal: spacing,
      color: "white",
      fontSize: isMobile ? 16 : 18,
    },
    searchButton: {
      width: isMobile ? minTouchTarget : 50,
      height: isMobile ? minTouchTarget : 50,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: isMobile ? 8 : 8,
      marginRight: deviceType !== "mobile" ? spacing / 2 : 0,
    },
    qrButton: {
      width: isMobile ? minTouchTarget : 50,
      height: isMobile ? minTouchTarget : 50,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: isMobile ? 8 : 8,
    },
    errorText: {
      color: "red",
      fontSize: isMobile ? 14 : 16,
      textAlign: "center",
    },
    progressContainer: {
      paddingHorizontal: spacing,
      marginBottom: spacing / 2,
    },
    progressText: {
      fontSize: 12,
      color: "#888",
      marginBottom: 4,
    },
    progressBarBg: {
      height: 2,
      backgroundColor: "#2c2c2e",
      borderRadius: 1,
      overflow: "hidden",
    },
    progressBarFill: {
      height: "100%",
      backgroundColor: Colors.dark.primary,
    },
  });
};
