import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Search, Delete, ChevronLeft, History, ArrowRight } from "lucide-react-native";
import { ThemedView } from "@/components/ThemedView";
import VideoCard from "@/components/VideoCard";
import { api, SearchResult } from "@/services/api";
import { Colors } from "@/constants/Colors";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Logger from '@/utils/Logger';

const logger = Logger.withTag('TVSearchView');
const HISTORY_KEY = "tv_search_history";
const MAX_HISTORY = 15;

async function fetchPinyinSuggestions(key: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://tv.aiseet.atianqi.com/i-tvbin/qtv_video/search/get_search_smart_box?format=json&page_num=0&page_size=20&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    const json = await res.json();
    const groupData = json?.data?.search_data?.vecGroupData?.[0]?.group_data || [];
    return groupData.map((g: any) => g?.dtReportInfo?.reportData?.keyword_txt || '').filter(Boolean).slice(0, 15);
  } catch { return []; }
}

const ALPHA_KEYS = ['A','B','C','D','E','F','G','H','I','J','K','L','M',
                    'N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
const ALPHA_ROWS = [
  ALPHA_KEYS.slice(0, 6),
  ALPHA_KEYS.slice(6, 12),
  ALPHA_KEYS.slice(12, 18),
  ALPHA_KEYS.slice(18, 24),
  [...ALPHA_KEYS.slice(24), '退格'],
];

export default function TVSearchView() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(val => { if (val) setHistory(JSON.parse(val)); });
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const apiSug = await fetchPinyinSuggestions(query);
      setSuggestions(apiSug);
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const saveHistory = useCallback(async (term: string) => {
    const updated = [term, ...history.filter(h => h !== term)].slice(0, MAX_HISTORY);
    setHistory(updated);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }, [history]);

  const doSearch = useCallback(async (term?: string) => {
    const text = (term || query).trim();
    if (!text) return;
    setLoading(true); setSearched(true); setSuggestions([]);
    saveHistory(text);
    try {
      const { results: res } = await api.searchVideos(text);
      setResults(res || []);
    } catch { setResults([]); }
    setLoading(false);
  }, [query, saveHistory]);

  const onKeyPress = useCallback((key: string) => {
    if (key === '退格') setQuery(p => p.slice(0, -1));
    else if (key === '搜索' || key === '确认') doSearch();
    else if (key === '远程') { /* 远程搜索预留 */ }
    else if (key === '清空') { setQuery(''); setResults([]); setSearched(false); setSuggestions([]); }
    else setQuery(p => p + key.toLowerCase());
  }, [doSearch]);

  const onWordPress = useCallback((word: string) => {
    setQuery(word); doSearch(word);
  }, [doSearch]);

  const clearHistory = () => {
    Alert.alert("清空搜索历史", "确定要清空吗？", [
      { text: "取消", style: "cancel" },
      { text: "清空", style: "destructive", onPress: async () => {
        setHistory([]); await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([]));
      }}
    ]);
  };

  const currentWords = showHistory ? history : suggestions;
  const wordLabel = showHistory ? '搜索历史' : (query.length >= 2 ? '拼音联想' : '搜索建议');

  return (
    <ThemedView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.topBtn}><ChevronLeft size={26} color="#fff" /></TouchableOpacity>
        <Text style={styles.topTitle}>搜索</Text>
        <TouchableOpacity onPress={clearHistory} style={styles.topBtn}>
          {history.length > 0 && <Delete size={18} color="#555" />}
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* 左栏：键盘 (25%) */}
        <View style={styles.leftPane}>
          <View style={styles.inputBox}>
            <Text style={[styles.inputText, query ? { color: '#fff' } : null]}>
              {query || '输入拼音首字母'}
            </Text>
          </View>
          <View style={styles.funcRow}>
            <Pressable
              style={[styles.funcBtn, focusedKey === '__search' && styles.kbKeyFocused]}
              onPress={() => doSearch()}
              onFocus={() => setFocusedKey('__search')}
              onBlur={() => setFocusedKey(null)}
            >
              <Search size={18} color="#fff" />
              <Text style={styles.funcText}>搜索</Text>
            </Pressable>
            <Pressable
              style={[styles.funcBtn, focusedKey === '__clear' && styles.kbKeyFocused]}
              onPress={() => { setQuery(''); setResults([]); setSearched(false); setSuggestions([]); }}
              onFocus={() => setFocusedKey('__clear')}
              onBlur={() => setFocusedKey(null)}
            >
              <Delete size={18} color="#888" />
              <Text style={styles.funcText}>清空</Text>
            </Pressable>
          </View>
          <View style={styles.kbArea}>
            {ALPHA_ROWS.map((row, ri) => (
              <View key={ri} style={styles.kbRow}>
                {row.map((key) => {
                  const isBack = key === '退格';
                  const isFocused = focusedKey === key;
                  return (
                    <Pressable
                      key={key}
                      style={[styles.kbKey, isBack && styles.kbBackKey, isFocused && styles.kbKeyFocused]}
                      onPress={() => onKeyPress(key)}
                      onFocus={() => setFocusedKey(key)}
                      onBlur={() => setFocusedKey(null)}
                    >
                      {isBack ? <Delete size={16} color="#ff6b6b" /> : <Text style={styles.kbKeyText}>{key}</Text>}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          <Pressable
            style={[styles.remoteBtn, focusedKey === '__remote' && styles.kbKeyFocused]}
            onPress={() => onKeyPress('远程')}
            onFocus={() => setFocusedKey('__remote')}
            onBlur={() => setFocusedKey(null)}
          >
            <Text style={styles.remoteText}>远程输入</Text>
          </Pressable>
        </View>

        {/* 中栏：联想/历史 (25%) */}
        <View style={styles.midPane}>
          <View style={styles.wordHeader}>
            <Text style={styles.wordLabel}>{wordLabel}</Text>
            <Pressable
              style={[styles.switchBtn, focusedKey === '__switch' && styles.kbKeyFocused]}
              onPress={() => setShowHistory(!showHistory)}
              onFocus={() => setFocusedKey('__switch')}
              onBlur={() => setFocusedKey(null)}
            >
              <ArrowRight size={12} color="#888" />
              <Text style={styles.switchText}>{showHistory ? '联想' : '历史'}</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.wordList}>
            {currentWords.map((w, i) => (
              <Pressable
                key={`${w}-${i}`}
                style={[styles.wordItem, focusedKey === `__word_${i}` && styles.wordItemFocused]}
                onPress={() => onWordPress(w)}
                onFocus={() => setFocusedKey(`__word_${i}`)}
                onBlur={() => setFocusedKey(null)}
              >
                <Text style={styles.wordText} numberOfLines={1}>{w}</Text>
              </Pressable>
            ))}
            {!searched && currentWords.length === 0 && query.length < 2 && (
              <Text style={styles.emptyHint}>输入拼音首字母获取联想</Text>
            )}
          </ScrollView>
        </View>

        {/* 右栏：搜索结果 (50%) */}
        <View style={styles.rightPane}>
          {loading ? (
            <View style={styles.centerRow}><VideoLoadingAnimation showProgressBar={false} /></View>
          ) : searched && results.length === 0 ? (
            <Text style={styles.emptyText}>未找到 "{query}" 相关内容</Text>
          ) : results.length > 0 ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.resultsGrid}>
                {results.map((item, idx) => (
                  <View key={`${item.source}-${item.id}-${idx}`} style={styles.cardWrap}>
                    <VideoCard id={item.id.toString()} source={item.source} title={item.title}
                      poster={item.poster} year={item.year} sourceName={item.source_name}
                      totalEpisodes={item.episodes?.length} api={api} from="search" />
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  topBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#fff' },
  body: { flex: 1, flexDirection: 'row' },
  leftPane: { width: '25%', paddingHorizontal: 8, paddingTop: 4 },
  midPane: { width: '25%', paddingHorizontal: 6, paddingTop: 4, borderLeftWidth: 1, borderLeftColor: '#222' },
  rightPane: { flex: 1, paddingHorizontal: 8, paddingTop: 4, borderLeftWidth: 1, borderLeftColor: '#222' },
  inputBox: { height: 40, backgroundColor: '#1c1c1e', borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center', marginBottom: 6, borderWidth: 1, borderColor: '#333' },
  inputText: { color: '#666', fontSize: 13 },
  funcRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  funcBtn: { flex: 1, height: 36, borderRadius: 8, backgroundColor: '#2a2a2e', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 4 },
  funcText: { color: '#ccc', fontSize: 12 },
  kbArea: { flex: 1 },
  kbRow: { flexDirection: 'row', gap: 3, marginBottom: 3 },
  kbKey: { flex: 1, height: 34, borderRadius: 6, backgroundColor: '#2a2a2e', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#3a3a3e' },
  kbBackKey: { backgroundColor: '#1e1e22', borderColor: '#4a2020' },
  kbKeyFocused: { borderColor: Colors.dark.primary, borderWidth: 2, backgroundColor: '#0a2a0a' },
  kbKeyText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  remoteBtn: { height: 36, borderRadius: 8, backgroundColor: '#1a2a1a', justifyContent: 'center', alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#2a4a2a' },
  remoteText: { color: '#00bb5e', fontSize: 13, fontWeight: '600' },
  wordHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 4 },
  wordLabel: { color: '#aaa', fontSize: 12, fontWeight: '600' },
  switchBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 2 },
  switchText: { color: '#666', fontSize: 11 },
  wordList: { flex: 1 },
  wordItem: { paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  wordItemFocused: { backgroundColor: '#0a2a0a', borderLeftWidth: 3, borderLeftColor: Colors.dark.primary },
  wordText: { color: '#ccc', fontSize: 13 },
  emptyHint: { color: '#555', fontSize: 12, marginTop: 20, textAlign: 'center' },
  centerRow: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  resultsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  cardWrap: { width: '33.333%', padding: 4 },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 30 },
});
