import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform } from "react-native";
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

async function fetchPinyinSuggestions(key: string): Promise<string[]> {
  try {
    const url = `https://tv.aiseet.atianqi.com/i-tvbin/qtv_video/search/get_search_smart_box?format=json&page_num=0&page_size=20&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
    });
    if (!res.ok) return [];
    const result = await res.json();
    const hots: string[] = [];
    const groupDataArr = result?.data?.search_data?.vecGroupData?.[0]?.group_data || [];
    for (const groupData of groupDataArr) {
      const keywordTxt = groupData?.dtReportInfo?.reportData?.keyword_txt;
      if (keywordTxt) {
        hots.push(String(keywordTxt).trim());
      }
    }
    return hots.slice(0, 15);
  } catch (e: any) {
    return [];
  }
}

const KEYS = [
  'A','B','C','D','E','F',
  'G','H','I','J','K','L',
  'M','N','O','P','Q','R',
  'S','T','U','V','W','X',
  'Y','Z','0','1','2','3',
  '4','5','6','7','8','9',
];
const KEY_ROWS = [
  KEYS.slice(0, 6),
  KEYS.slice(6, 12),
  KEYS.slice(12, 18),
  KEYS.slice(18, 24),
  KEYS.slice(24, 30),
  KEYS.slice(30, 36),
];

export default function TVSearchView() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [displayResults, setDisplayResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [trending, setTrending] = useState<string[]>([]);
  const [searchPhase, setSearchPhase] = useState<'idle' | 'fuzzy' | 'exact'>('idle');
  const { showModal: showRemoteModal } = useRemoteControlStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const msg = useRemoteControlStore.getState().lastMessage;
    if (msg) {
        const cleanMsg = msg.split('_')[0];
        setQuery(cleanMsg);
        doSearch(cleanMsg);
        useRemoteControlStore.getState().clearMessage();
    }
  }, [useRemoteControlStore.getState().lastMessage]);

  useEffect(() => {
    api.getSearchSuggestions('').then(res => {
      if (Array.isArray(res)) {
        setTrending(res.map((r: any) => typeof r === 'string' ? r : r.text || '').filter(Boolean));
      }
    }).catch(() => {});
    AsyncStorage.getItem(HISTORY_KEY).then(val => { if (val) setHistory(JSON.parse(val)); });
    // 确保初始聚焦在输入框
    setTimeout(() => setFocusedKey('__input'), 200);
  }, []);

  useEffect(() => {
    setDisplayResults(results.slice(0, 20));
  }, [results]);

  const loadMore = () => {
    if (displayResults.length < processedResults.length) {
      setDisplayResults(processedResults.slice(0, displayResults.length + 20));
    }
  };

  const processedResults = useMemo(() => {
    const map = new Map<string, SearchResult>();
    results.forEach(item => {
      const key = item.title.replace(/\s+/g, '');
      if (!map.has(key)) {
        map.set(key, item);
      } else {
        const existing = map.get(key)!;
        if ((item.episodes?.length || 0) > (existing.episodes?.length || 0)) {
          map.set(key, item);
        }
      }
    });
    return Array.from(map.values());
  }, [results]);

  useEffect(() => {
    setDisplayResults(processedResults.slice(0, 20));
  }, [processedResults]);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      const q = query.trim();
      let allHits: string[] = [];

      const qLower = q.toLowerCase();
      const trendingHits = trending.filter(t => t.toLowerCase().includes(qLower));
      allHits.push(...trendingHits);

      try {
        const apiHits = await fetchPinyinSuggestions(q);
        if (apiHits.length > 0) {
          for (const h of apiHits) {
            if (!allHits.includes(h)) allHits.push(h);
          }
        }
      } catch (e) { /* ignore */ }

      if (allHits.length < 5) {
        try {
          const backendSug = await api.getSearchSuggestions(q);
          if (Array.isArray(backendSug)) {
            for (const item of backendSug) {
              const text = typeof item === 'string' ? item : (item.text || '');
              if (text && !allHits.includes(text)) allHits.push(text);
            }
          }
        } catch (e) { /* ignore */ }
      }

      if (allHits.length > 0) {
        setSuggestions(allHits.slice(0, 15));
      }
    }, 50);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, trending]);

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

    setSearchPhase('exact');
    try {
      const { results: res } = await api.searchVideos(text);
      setResults(res || []);
      setSearchPhase('idle');
    } catch {
      setResults([]);
      setSearchPhase('fuzzy');
      // 可以添加模糊搜索逻辑
      setSearchPhase('idle');
    }
    setLoading(false);
  }, [query, saveHistory]);

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

  const onKeyPress = (key: string) => {
    if (key === '退格') setQuery(prev => prev.slice(0, -1));
    else if (key === '远程') showRemoteModal();
    else if (key !== '搜索') setQuery(prev => (prev + key).slice(0, 20));
  };

  const currentWords = showHistory ? history : (suggestions.length > 0 ? suggestions : trending);
  const wordLabel = showHistory ? '搜索历史' : (suggestions.length > 0 ? '拼音联想' : '搜索建议');

  return (
    <ThemedView style={styles.container}>
      <View style={styles.body}>
        <View style={styles.leftPane}>
          <View style={styles.inputRow}>
            <View style={[styles.inputBox, focusedKey === '__input' && styles.focused]}>
              <Text style={[styles.inputText, query ? { color: '#fff' } : null]}>{query || '输入拼音首字母'}</Text>
            </View>
            {query.length > 0 && (
              <TouchableOpacity
                style={[styles.clearInputBtn, focusedKey === '__clearInput' && styles.focused]}
                onPress={() => { setQuery(''); setResults([]); setSearched(false); setSuggestions([]); }}
                onFocus={() => setFocusedKey('__clearInput')}
                onBlur={() => setFocusedKey(null)}
                activeOpacity={0.6}
              >
                <X size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.funcRow}>
            <TouchableOpacity
              style={[styles.funcBtn, focusedKey === '__search' && styles.focused]}
              onPress={() => doSearch()}
              onFocus={() => setFocusedKey('__search')}
              onBlur={() => setFocusedKey(null)}
              activeOpacity={0.6}
            >
              <Search size={18} color="#fff" />
              <Text style={styles.funcText}>搜索</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.funcBtn, focusedKey === '__backspace' && styles.focused]}
              onPress={() => onKeyPress('退格')}
              onFocus={() => setFocusedKey('__backspace')}
              onBlur={() => setFocusedKey(null)}
              activeOpacity={0.6}
            >
              <Delete size={18} color="#ff6b6b" />
              <Text style={[styles.funcText, { color: '#ff6b6b' }]}>退格</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.kbArea}>
            {KEY_ROWS.map((row, ri) => (
              <View key={ri} style={styles.kbRow}>
                {row.map((key) => (
                  <TouchableOpacity
                      key={key}
                      activeOpacity={0.6}
                      style={[
                        styles.kbKey,
                        focusedKey === key && styles.focused
                      ]}
                      onFocus={() => setFocusedKey(key)}
                      onBlur={() => setFocusedKey(null)}
                      onPress={() => onKeyPress(key)}
                    >
                      <Text style={styles.kbKeyText}>{key}</Text>
                    </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.remoteBtn, focusedKey === '__remote' && styles.focused]}
            onPress={() => onKeyPress('远程')}
            onFocus={() => setFocusedKey('__remote')}
            onBlur={() => setFocusedKey(null)}
            activeOpacity={0.6}
          >
            <Text style={styles.remoteText}>远程输入</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.midPane}>
          <View style={styles.wordHeader}>
            <Text style={styles.wordLabel}>{wordLabel}</Text>
            <View style={{ flexDirection: 'row', gap: 4, marginLeft: 'auto' }}>
                {showHistory && (
                  <TouchableOpacity
                    style={[styles.smallBtn, focusedKey === '__clearHistory' && styles.focused]}
                    onPress={clearHistory}
                    onFocus={() => setFocusedKey('__clearHistory')}
                    onBlur={() => setFocusedKey(null)}
                    activeOpacity={0.6}
                  >
                    <Trash2 size={14} color="#ff6b6b" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.switchBtn, focusedKey === '__switch' && styles.focused]}
                  onPress={() => setShowHistory(!showHistory)}
                  onFocus={() => setFocusedKey('__switch')}
                  onBlur={() => setFocusedKey(null)}
                  activeOpacity={0.6}
                >
                  <ArrowRight size={12} color="#888" />
                  <Text style={styles.switchText}>{showHistory ? '联想' : '历史'}</Text>
                </TouchableOpacity>
            </View>
          </View>
          <View style={styles.wordGrid}>
            {currentWords
              .map(w => w.replace(/\s+/g, ''))
              .filter((w, i, self) => self.indexOf(w) === i)
              .slice(0, 9)
              .map((w, i) => (
              <TouchableOpacity
                key={`${w}-${i}`}
                activeOpacity={0.6}
                style={[
                    styles.wordButton,
                    focusedKey === `__word_${i}` && styles.focused
                ]}
                onFocus={() => setFocusedKey(`__word_${i}`)}
                onBlur={() => setFocusedKey(null)}
                onPress={() => onWordPress(w)}
              >
                <Text style={styles.wordButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{w}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.rightPane}>
          {loading ? (
            <View style={styles.centerRow}><VideoLoadingAnimation showProgressBar={false} /></View>
          ) : displayResults.length > 0 ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              onScroll={({nativeEvent}) => {
                const isCloseToBottom = nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >= nativeEvent.contentSize.height - 100;
                if (isCloseToBottom) loadMore();
              }}
              scrollEventThrottle={400}
            >
              <View style={styles.resultsGrid}>
                {displayResults.map((item, idx) => (
                  <View key={`${item.source}-${item.id}-${idx}`} style={styles.cardWrap}>
                    <VideoCard
                      id={item.id.toString()}
                      source={item.source}
                      title={item.title}
                      poster={item.poster}
                      year={item.year}
                      sourceName={item.source_name}
                      totalEpisodes={item.episodes?.length}
                      sourceCount={(item as any).sourceCount}
                      api={api}
                      from="search"
                      style={{ width: 120, height: 180 }}
                      containerStyle={{ width: 120, height: 180 }}
                    />
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : searched ? <Text style={styles.emptyText}>未找到 "{query}" 相关内容</Text> : null}
        </View>
      </View>
      <RemoteControlModal />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  body: { flex: 1, flexDirection: 'row', paddingTop: 12 },
  leftPane: { width: '30%', paddingHorizontal: 10, paddingTop: 8 },
  midPane: { width: '22%', paddingHorizontal: 8, paddingTop: 8, borderLeftWidth: 1, borderLeftColor: '#222' },
  rightPane: { flex: 1, paddingHorizontal: 10, paddingTop: 8, borderLeftWidth: 1, borderLeftColor: '#222' },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  inputBox: { flex: 1, height: 52, backgroundColor: '#1c1c1e', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 2, borderColor: '#333' },
  focused: { borderColor: '#00bb5e', borderWidth: 3, backgroundColor: '#0a2a0a', elevation: 12, zIndex: 999, shadowColor: '#00bb5e', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10 },
  inputText: { color: '#888', fontSize: 18 },
  funcRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  clearInputBtn: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#2a2a2e', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#3a3a3e' },
  funcBtn: { flex: 1, height: 54, borderRadius: 12, backgroundColor: '#2a2a2e', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 },
  funcText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  kbArea: { flex: 1, justifyContent: 'center' },
  kbRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  kbKey: { flex: 1, height: 52, borderRadius: 10, backgroundColor: '#2a2a2e', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#3a3a3e' },
  kbKeyText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  remoteBtn: { height: 52, borderRadius: 10, backgroundColor: '#1a2a1a', justifyContent: 'center', alignItems: 'center', marginTop: 6, borderWidth: 2, borderColor: '#2a4a2a' },
  remoteText: { color: '#00bb5e', fontSize: 16, fontWeight: '600' },
  wordHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
  wordLabel: { color: '#aaa', fontSize: 16, fontWeight: '600' },
  smallBtn: { padding: 8, borderRadius: 8, backgroundColor: '#2a2a2e' },
  switchBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, borderRadius: 8, backgroundColor: '#2a2a2e' },
  switchText: { color: '#888', fontSize: 14 },
  wordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wordButton: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 8, backgroundColor: '#2a2a2e', borderWidth: 2, borderColor: '#3a3a3e', width: '100%', alignItems: 'center' },
  wordButtonText: { color: '#ddd', fontSize: 16 },
  centerRow: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  resultsGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  // 每行两列布局，适当增加间距
  cardWrap: { width: '50%', padding: 8, alignItems: 'center' },
  emptyText: { color: '#888', fontSize: 16, textAlign: 'center', marginTop: 40 },
});
