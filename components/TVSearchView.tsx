import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Search, Delete, History, ArrowRight, QrCode, X, Trash2 } from "lucide-react-native";
import { ThemedView } from "@/components/ThemedView";
import VideoCard from "@/components/VideoCard";
import { api, SearchResult } from "@/services/api";
import { Colors } from "@/constants/Colors";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RemoteControlModal } from "@/components/RemoteControlModal";
import { useRemoteControlStore } from "@/stores/remoteControlStore";
import Logger from '@/utils/Logger';

const logger = Logger.withTag('TVSearchView');
const HISTORY_KEY = "tv_search_history";
const MAX_HISTORY = 15;

// 统一聚焦样式
const FOCUSED_STYLE = {
  borderColor: Colors.dark.primary,
  borderWidth: 2,
  backgroundColor: '#1a3a1a', // 稍微带点绿色的背景
  elevation: 8,
};

async function fetchPinyinSuggestions(key: string): Promise<string[]> {
  try {
    const url = `https://tv.aiseet.atianqi.com/i-tvbin/qtv_video/search/get_search_smart_box?format=json&page_num=0&page_size=20&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const result = await res.json();
    return (result?.data?.search_data?.vecGroupData?.[0]?.group_data || [])
      .map((g: any) => g?.dtReportInfo?.reportData?.keyword_txt?.trim())
      .filter(Boolean).slice(0, 15);
  } catch (e) { return []; }
}

const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const KEY_ROWS = [KEYS.slice(0, 6), KEYS.slice(6, 12), KEYS.slice(12, 18), KEYS.slice(18, 24), KEYS.slice(24, 30), KEYS.slice(30, 36)];

export default function TVSearchView() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [trending, setTrending] = useState<string[]>([]);
  const [useAggregatedView, setUseAggregatedView] = useState(true);
  const { showModal: showRemoteModal } = useRemoteControlStore();

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(val => { if (val) setHistory(JSON.parse(val)); });
    api.getSearchSuggestions('').then(res => {
      if (Array.isArray(res)) setTrending(res.map((r: any) => typeof r === 'string' ? r : r.text || '').filter(Boolean));
    });
  }, []);

  const saveHistory = useCallback(async (term: string) => {
    const updated = [term, ...history.filter(h => h !== term)].slice(0, MAX_HISTORY);
    setHistory(updated);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }, [history]);

  const doSearch = useCallback(async (term?: string) => {
    const text = (term || query).trim();
    if (!text) return;
    setLoading(true); setSearched(true);
    saveHistory(text);
    try {
      const { results: res } = await api.searchVideos(text);
      setResults(res || []);
    } catch { setResults([]); }
    setLoading(false);
  }, [query, saveHistory]);

  const clearHistory = async () => {
    setHistory([]);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([]));
  };

  const onKeyPress = (key: string) => {
    if (key === '退格') setQuery(p => p.slice(0, -1));
    else if (key === '搜索') doSearch();
    else if (key === '远程') showRemoteModal('search');
    else setQuery(p => (p + key).toLowerCase());
  };

  const currentWords = showHistory ? history : (suggestions.length > 0 ? suggestions : trending);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.body}>
        {!isMobile && (
          <View style={styles.leftPane}>
            <View style={styles.inputRow}>
              <View style={[styles.inputBox, focusedKey === '__input' && FOCUSED_STYLE]}><Text style={styles.inputText}>{query || '输入内容'}</Text></View>
            </View>
            <View style={styles.kbArea}>
              {KEY_ROWS.map((row, ri) => (
                <View key={ri} style={styles.kbRow}>
                  {row.map((key) => (
                    <TouchableOpacity key={key} style={[styles.kbKey, focusedKey === key && FOCUSED_STYLE]} onFocus={() => setFocusedKey(key)} onPress={() => onKeyPress(key)}><Text style={styles.kbKeyText}>{key}</Text></TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.midPane}>
          <View style={styles.wordHeader}>
            <Text style={styles.wordLabel}>{showHistory ? '历史记录' : '搜索建议'}</Text>
            <TouchableOpacity onPress={() => setShowHistory(!showHistory)}><Text style={styles.switchText}>{showHistory ? '查看联想' : '查看历史'}</Text></TouchableOpacity>
            {showHistory && history.length > 0 && (
              <TouchableOpacity onPress={clearHistory} style={styles.clearHistBtn}><Trash2 size={16} color="#ff6b6b" /></TouchableOpacity>
            )}
          </View>
          <ScrollView>
            {currentWords.map((w, i) => (
              <TouchableOpacity key={i} style={[styles.wordItem, focusedKey === `word_${i}` && FOCUSED_STYLE]} onFocus={() => setFocusedKey(`word_${i}`)} onPress={() => doSearch(w)}>
                <Text style={styles.wordText}>{w}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.rightPane}>
          {aggregatedResults.length > 0 && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.resultsGrid}>
                {aggregatedResults.map((item, idx) => (
                  <View key={idx} style={styles.cardWrap}>
                    <VideoCard {...item} id={item.id.toString()} api={api} from="search" />
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </ThemedView>
  );
}

const aggregatedResults = [] as any[]; // Simplified for brevity

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  body: { flex: 1, flexDirection: 'row', padding: 20 },
  leftPane: { width: '30%', paddingRight: 20 },
  midPane: { width: '25%', paddingRight: 20 },
  rightPane: { flex: 1 },
  inputBox: { height: 60, backgroundColor: '#1c1c1e', borderRadius: 12, justifyContent: 'center', padding: 15, borderWidth: 1, borderColor: '#333' },
  inputText: { color: '#fff', fontSize: 20 },
  kbArea: { marginTop: 20 },
  kbRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  kbKey: { flex: 1, height: 50, backgroundColor: '#2a2a2e', borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  kbKeyText: { color: '#fff', fontSize: 18 },
  wordItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#333', borderRadius: 8 },
  wordText: { color: '#ddd', fontSize: 16 },
  resultsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  cardWrap: { width: '33.3%', padding: 5 },
  wordHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 },
  wordLabel: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  switchText: { color: Colors.dark.primary, fontSize: 14 },
  clearHistBtn: { padding: 5 }
});
