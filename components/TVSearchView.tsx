import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { Search, Delete, History, ArrowRight, QrCode, X } from "lucide-react-native";
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
    console.log('[ATIANQI_DEBUG] Fetching:', url);
    logger.info(`[PINYIN] Fetching: ${url}`);
    // TVBoxOS 使用 OkHttp，默认带 User-Agent；React Native fetch 可能不带，手动加上
    let didTimeout = false;
    const timer = setTimeout(() => { didTimeout = true; }, 5000);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
    });
    clearTimeout(timer);
    if (didTimeout) { console.log('[ATIANQI_DEBUG] Timeout'); return []; }
    if (!res.ok) {
      console.log('[ATIANQI_DEBUG] HTTP status:', res.status);
      logger.warn(`[PINYIN] HTTP ${res.status}`);
      return [];
    }
    const result = await res.json();
    console.log('[ATIANQI_DEBUG] Response keys:', Object.keys(result));
    const hots: string[] = [];
    const groupDataArr = result?.data?.search_data?.vecGroupData?.[0]?.group_data || [];
    console.log('[ATIANQI_DEBUG] group_data count:', groupDataArr.length);
    logger.info(`[PINYIN] Response group_data count: ${groupDataArr.length}`);
    for (const groupData of groupDataArr) {
      const keywordTxt = groupData?.dtReportInfo?.reportData?.keyword_txt;
      if (keywordTxt) {
        hots.push(String(keywordTxt).trim());
      }
    }
    logger.info(`[PINYIN] Parsed ${hots.length} suggestions: ${hots.join(', ')}`);
    return hots.slice(0, 15);
  } catch (e: any) {
    console.log('[ATIANQI_DEBUG] Error:', e?.message || e, e?.stack || '');
    logger.warn(`[PINYIN] Error: ${e?.message || e}`);
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
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [trending, setTrending] = useState<string[]>([]);
  const [useAggregatedView, setUseAggregatedView] = useState(true);
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
    if (query.length < 2) { setSuggestions([]); return; }

    debounceRef.current = setTimeout(async () => {
      const q = query.trim();
      let allHits: string[] = [];

      // 1. 热词池文字匹配（立即、本地、无网络依赖）
      const qLower = q.toLowerCase();
      const trendingHits = trending.filter(t => t.toLowerCase().includes(qLower));
      allHits.push(...trendingHits);

      // 2. atianqi 拼音联想 API
      try {
        const apiHits = await fetchPinyinSuggestions(q);
        if (apiHits.length > 0) {
          for (const h of apiHits) {
            if (!allHits.includes(h)) allHits.push(h);
          }
        }
      } catch (e) { /* ignore */ }

      // 3. 本应用搜索建议 API 兜底
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
    try {
      const { results: res } = await api.searchVideos(text);
      setResults(res || []);
    } catch { setResults([]); }
    setLoading(false);
  }, [query, saveHistory]);

  const aggregatedResults = useMemo(() => {
    if (!useAggregatedView) return results;
    const groups = new Map<string, SearchResult & { sourceCount: number; sources: string[] }>();
    results.forEach(r => {
      const titleClean = r.title
        .replace(/\[.*?\]|【.*?】|高清版|蓝光版/g, '')
        .replace(/\s+/g, '')
        .trim()
        .toLowerCase();
      if (!groups.has(titleClean)) {
        groups.set(titleClean, { ...r, sourceCount: 1, sources: [r.source] });
      } else {
        const existing = groups.get(titleClean)!;
        if (!existing.sources.includes(r.source)) {
          existing.sources.push(r.source);
        }
        existing.sourceCount = existing.sources.length;
        if ((r.episodes?.length || 0) > (existing.episodes?.length || 0)) {
          const sources = existing.sources;
          Object.assign(existing, r);
          existing.sources = sources;
          existing.sourceCount = sources.length;
        }
        if (r.year && r.year !== 'unknown' && (!existing.year || existing.year === 'unknown')) {
          existing.year = r.year;
        }
      }
    });
    return Array.from(groups.values());
  }, [results, useAggregatedView]);

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
      <View style={styles.body}>
        <View style={styles.leftPane}>
          <View style={styles.inputRow}>
            <View style={[styles.inputBox, focusedKey === '__input' && styles.inputBoxFocused]}>
              <Text style={[styles.inputText, query ? { color: '#fff' } : null]}>{query || '输入拼音首字母'}</Text>
            </View>
            {query.length > 0 && (
              <TouchableOpacity
                style={[styles.clearInputBtn, focusedKey === '__clearInput' && styles.kbKeyFocused]}
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
              style={[styles.funcBtn, focusedKey === '__search' && styles.kbKeyFocused]}
              onPress={() => doSearch()}
              onFocus={() => setFocusedKey('__search')}
              onBlur={() => setFocusedKey(null)}
              activeOpacity={0.6}
            >
              <Search size={18} color="#fff" />
              <Text style={styles.funcText}>搜索</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.funcBtn, focusedKey === '__backspace' && styles.kbKeyFocused]}
              onPress={() => onKeyPress('退格')}
              onFocus={() => setFocusedKey('__backspace')}
              onBlur={() => setFocusedKey(null)}
              activeOpacity={0.6}
            >
              <Delete size={18} color="#ff6b6b" />
              <Text style={[styles.funcText, { color: '#ff6b6b' }]}>退格</Text>
            </TouchableOpacity>
          </View>
          {/* 键盘区域：使用强制 focusable 原生属性，并添加透明层调试 */}
          <View
            style={styles.kbArea}
            focusable={false}
          >
            {KEY_ROWS.map((row, ri) => (
              <View key={ri} style={styles.kbRow}>
                {row.map((key) => (
                  <TouchableOpacity
                      key={key}
                      activeOpacity={0.6}
                      style={[
                        styles.kbKey,
                        focusedKey === key && styles.kbKeyFocused
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
                      <Text style={styles.kbKeyText}>{key}</Text>
                    </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.remoteBtn, focusedKey === '__remote' && styles.kbKeyFocused]}
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
            <TouchableOpacity
              style={[styles.switchBtn, focusedKey === '__switch' && styles.kbKeyFocused]}
              onPress={() => setShowHistory(!showHistory)}
              onFocus={() => setFocusedKey('__switch')}
              onBlur={() => setFocusedKey(null)}
              activeOpacity={0.6}
            >
              <ArrowRight size={12} color="#888" />
              <Text style={styles.switchText}>{showHistory ? '联想' : '历史'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.wordList}>
            {currentWords.map((w, i) => (
              <TouchableOpacity
                key={`${w}-${i}`}
                activeOpacity={0.6}
                style={[styles.wordItem, focusedKey === `__word_${i}` && styles.wordItemFocused]}
                onPress={() => onWordPress(w)}
                onFocus={() => setFocusedKey(`__word_${i}`)}
                onBlur={() => setFocusedKey(null)}
              >
                <Text style={styles.wordText} numberOfLines={1}>{w}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.rightPane}>
          {results.length > 0 && (
            <View style={styles.aggToggleRow}>
              <Text style={styles.aggLabel}>聚合</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setUseAggregatedView(!useAggregatedView)}
                style={[styles.aggSwitchTrack, useAggregatedView && { backgroundColor: '#00bb5e' }]}
              >
                <View style={[styles.aggSwitchThumb, useAggregatedView && { transform: [{ translateX: 14 }] }]} />
              </TouchableOpacity>
            </View>
          )}
          {loading ? (
            <View style={styles.centerRow}><VideoLoadingAnimation showProgressBar={false} /></View>
          ) : aggregatedResults.length > 0 ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.resultsGrid}>
                {aggregatedResults.map((item, idx) => (
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
  inputBoxFocused: { borderColor: '#00bb5e', borderWidth: 3, backgroundColor: '#0a2a0a', elevation: 12, zIndex: 999 },
  inputText: { color: '#888', fontSize: 18 },
  funcRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  clearInputBtn: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#2a2a2e', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#3a3a3e' },
  funcBtn: { flex: 1, height: 54, borderRadius: 12, backgroundColor: '#2a2a2e', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6 },
  funcText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  kbArea: { flex: 1, justifyContent: 'center' },
  kbRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  kbKey: { flex: 1, height: 52, borderRadius: 10, backgroundColor: '#2a2a2e', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#3a3a3e' },
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
  remoteBtn: { height: 52, borderRadius: 10, backgroundColor: '#1a2a1a', justifyContent: 'center', alignItems: 'center', marginTop: 6, borderWidth: 2, borderColor: '#2a4a2a' },
  remoteText: { color: '#00bb5e', fontSize: 16, fontWeight: '600' },
  wordHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
  wordLabel: { color: '#aaa', fontSize: 16, fontWeight: '600' },
  switchBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 4, padding: 4 },
  switchText: { color: '#888', fontSize: 14 },
  wordList: { flex: 1 },
  wordItem: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  wordItemFocused: { backgroundColor: '#48484a', borderLeftWidth: 6, borderLeftColor: '#00bb5e', borderWidth: 1, borderColor: '#00bb5e', elevation: 12, zIndex: 999 },
  wordText: { color: '#ddd', fontSize: 16 },
  aggToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8, gap: 8 },
  aggLabel: { color: '#aaa', fontSize: 14, fontWeight: '500' },
  aggSwitchTrack: { width: 32, height: 18, backgroundColor: '#3a3a3c', borderRadius: 9, padding: 2 },
  aggSwitchThumb: { width: 14, height: 14, backgroundColor: 'white', borderRadius: 7 },
  emptyHint: { color: '#555', fontSize: 14, marginTop: 30, textAlign: 'center' },
  centerRow: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  resultsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  cardWrap: { width: '33.333%', padding: 6 },
  emptyText: { color: '#888', fontSize: 16, textAlign: 'center', marginTop: 40 },
});
