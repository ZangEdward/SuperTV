import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Search, Delete, ChevronLeft, History, ArrowRight, QrCode } from "lucide-react-native";
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
    const res = await fetch(
      `https://tv.aiseet.atianqi.com/i-tvbin/qtv_video/search/get_search_smart_box?format=json&page_num=0&page_size=20&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(4000) }
    );
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
  } catch (e) {
    logger.error('Pinyin API Error', e);
    return [];
  }
}

const ALPHA_KEYS = ['A','B','C','D','E','F','G','H','I','J','K','L','M',
                    'N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
const ALPHA_ROWS = [
  ALPHA_KEYS.slice(0, 5),
  ALPHA_KEYS.slice(5, 10),
  ALPHA_KEYS.slice(10, 15),
  ALPHA_KEYS.slice(15, 20),
  ALPHA_KEYS.slice(20, 25),
  [...ALPHA_KEYS.slice(25), '退格'],
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
  const [trending, setTrending] = useState<string[]>([]);
  const { showModal: showRemoteModal } = useRemoteControlStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.getSearchSuggestions('').then(res => {
      if (Array.isArray(res)) {
        setTrending(res.map((r: any) => typeof r === 'string' ? r : r.text || '').filter(Boolean));
      }
    }).catch(() => {});
    AsyncStorage.getItem(HISTORY_KEY).then(val => { if (val) setHistory(JSON.parse(val)); });
    setFocusedKey('__input');
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // 强制输出 query 状态，排查是否未捕获到变化
    logger.info(`[TVSearch] Debounce query: "${query}"`);

    if (!query) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const q = query.trim();
      logger.info(`[TVSearch] Fetching suggestions for: "${q}"`);

      const pinyinHits = await fetchPinyinSuggestions(q);
      logger.info(`[TVSearch] Received ${pinyinHits.length} suggestions`);

      setSuggestions(pinyinHits);
    }, 50);

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
    logger.info(`[TVSearch] Key pressed: ${key}`);
    if (key === '退格') {
      setQuery(p => {
        const next = p.slice(0, -1);
        logger.info(`[TVSearch] Query update: "${next}"`);
        return next;
      });
    } else if (key === '搜索') {
      doSearch();
    } else if (key === '远程') {
      showRemoteModal('search');
    } else if (key === '清空') {
      setQuery('');
      setResults([]);
      setSearched(false);
      setSuggestions([]);
    } else {
      setQuery(p => {
        const next = (p + key).toLowerCase();
        logger.info(`[TVSearch] Query update: "${next}"`);
        return next;
      });
    }
  }, [doSearch, showRemoteModal]);

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

  const currentWords = showHistory ? history : (suggestions.length > 0 ? suggestions : trending);
  const wordLabel = showHistory ? '搜索历史' : (suggestions.length > 0 ? '拼音联想' : '搜索建议');

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
        <View style={styles.leftPane}>
          <View style={[styles.inputBox, focusedKey === '__input' && styles.inputBoxFocused]}>
            <Text style={[styles.inputText, query ? { color: '#fff' } : null]}>{query || '输入拼音首字母'}</Text>
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
          {/* 键盘区域：使用强制 focusable 原生属性，并添加透明层调试 */}
          <View
            style={styles.kbArea}
            focusable={false}
          >
            {ALPHA_ROWS.map((row, ri) => (
              <View key={ri} style={styles.kbRow}>
                {row.map((key) => {
                  const isBack = key === '退格';
                  const isFocused = focusedKey === key;
                  return (
                    <Pressable
                      key={key}
                      focusable={true}
                      style={[
                        styles.kbKey,
                        isBack && styles.kbBackKey,
                        isFocused && styles.kbKeyFocused
                      ]}
                      onFocus={() => {
                        console.log(`[DEBUG_TV] Focus on: ${key}`);
                        setFocusedKey(key);
                      }}
                      onBlur={() => setFocusedKey(null)}
                      onPress={() => {
                        console.log(`[DEBUG_TV] Press: ${key}`);
                        onKeyPress(key);
                      }}
                    >
                      {isBack ? (
                        <Text style={[styles.kbKeyText, { color: '#ff6b6b' }]}>退格</Text>
                      ) : (
                        <Text style={styles.kbKeyText}>{key}</Text>
                      )}
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
          </ScrollView>
        </View>

        <View style={styles.rightPane}>
          {loading ? (
            <View style={styles.centerRow}><VideoLoadingAnimation showProgressBar={false} /></View>
          ) : results.length > 0 ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.resultsGrid}>
                {results.map((item, idx) => (
                  <View key={`${item.source}-${item.id}-${idx}`} style={styles.cardWrap}>
                    <VideoCard id={item.id.toString()} source={item.source} title={item.title} poster={item.poster} year={item.year} sourceName={item.source_name} totalEpisodes={item.episodes?.length} api={api} from="search" />
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
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  topBtn: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 24, fontWeight: '700', color: '#fff' },
  body: { flex: 1, flexDirection: 'row' },
  leftPane: { width: '25%', paddingHorizontal: 12, paddingTop: 8 },
  midPane: { width: '25%', paddingHorizontal: 10, paddingTop: 8, borderLeftWidth: 1, borderLeftColor: '#222' },
  rightPane: { flex: 1, paddingHorizontal: 12, paddingTop: 8, borderLeftWidth: 1, borderLeftColor: '#222' },
  inputBox: { height: 52, backgroundColor: '#1c1c1e', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', marginBottom: 8, borderWidth: 2, borderColor: '#333' },
  inputBoxFocused: { borderColor: '#00bb5e', borderWidth: 3, backgroundColor: '#0a2a0a', elevation: 12, zIndex: 999 },
  inputText: { color: '#888', fontSize: 18 },
  funcRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  funcBtn: { flex: 1, height: 48, borderRadius: 10, backgroundColor: '#2a2a2e', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 },
  funcText: { color: '#fff', fontSize: 16 },
  kbArea: { flex: 1 },
  kbRow: { flexDirection: 'row', gap: 5, marginBottom: 5 },
  kbKey: { flex: 1, height: 48, borderRadius: 8, backgroundColor: '#2a2a2e', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#3a3a3e' },
  kbBackKey: { backgroundColor: '#1e1e22', borderColor: '#4a2020' },
  kbKeyFocused: {
    backgroundColor: '#48484a',
    borderColor: '#00bb5e',
    borderWidth: 3,
    elevation: 12,
    zIndex: 999,
    shadowColor: '#00bb5e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  kbKeyText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  remoteBtn: { height: 48, borderRadius: 10, backgroundColor: '#1a2a1a', justifyContent: 'center', alignItems: 'center', marginTop: 6, borderWidth: 2, borderColor: '#2a4a2a' },
  remoteText: { color: '#00bb5e', fontSize: 16, fontWeight: '600' },
  wordHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
  wordLabel: { color: '#aaa', fontSize: 16, fontWeight: '600' },
  switchBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 4, padding: 4 },
  switchText: { color: '#888', fontSize: 14 },
  wordList: { flex: 1 },
  wordItem: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  wordItemFocused: { backgroundColor: '#48484a', borderLeftWidth: 6, borderLeftColor: '#00bb5e', borderWidth: 1, borderColor: '#00bb5e', elevation: 12, zIndex: 999 },
  wordText: { color: '#ddd', fontSize: 16 },
  emptyHint: { color: '#555', fontSize: 14, marginTop: 30, textAlign: 'center' },
  centerRow: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  resultsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  cardWrap: { width: '33.333%', padding: 6 },
  emptyText: { color: '#888', fontSize: 16, textAlign: 'center', marginTop: 40 },
});
