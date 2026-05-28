import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Search, Delete, ChevronLeft, History, Flame, ArrowRight } from "lucide-react-native";
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

// TVBoxOS 式键盘布局：6列，首行功能键各占3列，其余字母每行6个
const KEYBOARD_ROWS: { key: string; span?: number }[][] = [
  [{ key: '远程', span: 3 }, { key: '删除', span: 3 }],
  [{ key: 'Q' }, { key: 'W' }, { key: 'E' }, { key: 'R' }, { key: 'T' }, { key: 'Y' }],
  [{ key: 'U' }, { key: 'I' }, { key: 'O' }, { key: 'P' }, { key: 'A' }, { key: 'S' }],
  [{ key: 'D' }, { key: 'F' }, { key: 'G' }, { key: 'H' }, { key: 'J' }, { key: 'K' }],
  [{ key: 'L' }, { key: 'Z' }, { key: 'X' }, { key: 'C' }, { key: 'V' }, { key: 'B' }],
  [{ key: 'N' }, { key: 'M' }, { key: '搜索', span: 2 }, { key: '清空', span: 2 }],
];

// 搜索建议（取代热词API，使用本应用后端）
async function fetchSuggestions(query?: string): Promise<string[]> {
  try {
    if (query) {
      return await api.getSearchSuggestions(query);
    }
    // 无查询时获取默认建议（传空字符串获取热门推荐）
    return await api.getSearchSuggestions('');
  } catch {
    return [];
  }
}

// 拼音联想API（参考TVBoxOS atianqi）
async function fetchPinyinSuggestions(key: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://tv.aiseet.atianqi.com/i-tvbin/qtv_video/search/get_search_smart_box?format=json&page_num=0&page_size=20&key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(4000) }
    );
    const json = await res.json();
    const groupData = json?.data?.search_data?.vecGroupData?.[0]?.group_data || [];
    return groupData.map((g: any) =>
      g?.dtReportInfo?.reportData?.keyword_txt || ''
    ).filter(Boolean).slice(0, 15);
  } catch {
    return [];
  }
}

export default function TVSearchView() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [trending, setTrending] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [splitWords, setSplitWords] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchSuggestions().then(setTrending);
    AsyncStorage.getItem(HISTORY_KEY).then(val => {
      if (val) setHistory(JSON.parse(val));
    });
  }, []);

  // 搜索意见：拼音API联想 + 搜索建议匹配
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 1) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      // 1. 外部拼音API联想（"gqwy" → "怪奇物语"）
      const apiSug = await fetchPinyinSuggestions(query);
      // 2. 从搜索建议列表中按文字匹配
      const q = query.toLowerCase();
      const matchedTrending = trending.filter(t => t.toLowerCase().includes(q));
      // 3. 合并去重（API 联想优先）
      const merged = [...apiSug];
      for (const t of matchedTrending) {
        if (!merged.includes(t)) merged.push(t);
      }
      setSuggestions(merged.slice(0, 15));
    }, query.length < 2 ? 300 : 200);
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
      const parts = text.split(/[\s,，、;；]+/).filter(Boolean);
      setSplitWords(parts.length > 1 ? parts : []);
      const { results: res } = await api.searchVideos(text);
      const q = text.toLowerCase().replace(/[^a-z]/g, '');
      let filtered = res;
      if (q.length >= 2) {
        filtered = res.filter(r => {
          const title = (r.title || '').replace(/\s+/g, '').toLowerCase();
          if (title.includes(q)) return true;
          return (r.title || '').toLowerCase().includes(q);
        });
      }
      setResults(filtered || []);
    } catch { setResults([]); }
    setLoading(false);
  }, [query, saveHistory]);

  const onKeyPress = useCallback((key: string) => {
    if (key === '删除') setQuery(p => p.slice(0, -1));
    else if (key === '远程') { /* 远程搜索预留 */ }
    else if (key === '搜索') doSearch();
    else if (key === '清空') { setQuery(''); setResults([]); setSearched(false); setSuggestions([]); }
    else setQuery(p => p + key.toLowerCase());
  }, [doSearch]);

  const onSuggestionPress = useCallback((title: string) => {
    setQuery(title); doSearch(title);
  }, [doSearch]);

  const onHistoryPress = onSuggestionPress;

  const clearHistory = () => {
    Alert.alert("清空搜索历史", "确定要清空所有历史记录吗？", [
      { text: "取消", style: "cancel" },
      { text: "清空", style: "destructive", onPress: async () => {
        setHistory([]);
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([]));
      }}
    ]);
  };

  const currentWords = showHistory ? history : suggestions.length > 0 ? suggestions : trending;
  const wordsLabel = showHistory ? '历史 搜索' : suggestions.length > 0 ? '猜你 想搜' : '搜索建议';

  return (
    <ThemedView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.topBtn}>
          <ChevronLeft size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>搜索</Text>
        <TouchableOpacity onPress={clearHistory} style={styles.topBtn}>
          {history.length > 0 && <Delete size={18} color="#555" />}
        </TouchableOpacity>
      </View>

      <View style={styles.inputRow}>
        <View style={styles.inputBox}>
          <Text style={[styles.inputText, query ? { color: '#fff' } : null]}>
            {query || '输入拼音首字母或剧名'}
          </Text>
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={() => doSearch()}>
          <Search size={22} color="#fff" />
        </TouchableOpacity>
        {query.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => onKeyPress('CLEAR')}>
            <Delete size={22} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* 词云区 */}
      {!searched && (
        <View style={styles.wordSection}>
          <View style={styles.wordHeader}>
            {suggestions.length > 0 ? <Search size={14} color="#00bb5e" /> :
             showHistory ? <History size={14} color="#00bb5e" /> : <Flame size={14} color="#ff6b35" />}
            <Text style={styles.wordLabel}>{wordsLabel}</Text>
            <TouchableOpacity onPress={() => setShowHistory(!showHistory)} style={styles.switchBtn}>
              <ArrowRight size={14} color="#888" />
              <Text style={styles.switchText}>{showHistory ? '建议' : '历史'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.wordList}>
            {currentWords.map((word, i) => (
              <TouchableOpacity key={`${word}-${i}`} style={styles.wordItem} onPress={() => onSuggestionPress(word)}>
                <Text style={styles.wordText} numberOfLines={1}>{word}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 键盘（TVBoxOS 式布局） */}
      <View style={styles.keyboard}>
        {KEYBOARD_ROWS.map((row, ri) => (
          <View key={ri} style={styles.kbRow}>
            {row.map((item) => {
              const span = item.span || 1;
              const isFunc = item.key === '远程' || item.key === '删除';
              const isSearch = item.key === '搜索' || item.key === '清空';
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.kbKey,
                    { width: `${(100 / 6) * span}%` },
                    isFunc && styles.kbFuncKey,
                    isSearch && styles.kbSearchKey,
                  ]}
                  onPress={() => onKeyPress(item.key)}
                >
                  {item.key === '远程' ? <Text style={[styles.kbKeyText, { fontSize: 11 }]}>远程</Text> :
                   item.key === '删除' ? <Delete size={18} color="#ff6b6b" /> :
                   item.key === '清空' ? <Text style={styles.kbKeyText}>清空</Text> :
                   <Text style={styles.kbKeyText}>{item.key}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* 搜索结果 */}
      <View style={styles.resultsArea}>
        {loading ? (
          <View style={styles.centerRow}><VideoLoadingAnimation showProgressBar={false} /></View>
        ) : searched && results.length === 0 ? (
          <Text style={styles.emptyText}>未找到 "{query}" 相关内容</Text>
        ) : results.length > 0 ? (
          <>
            {splitWords.length > 0 && (
              <ScrollView horizontal style={styles.splitBar} showsHorizontalScrollIndicator={false}>
                {splitWords.map((w, i) => (
                  <TouchableOpacity key={i} style={styles.splitChip} onPress={() => doSearch(w)}>
                    <Text style={styles.splitText}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.resultsGrid}>
                {results.map((item, idx) => (
                  <View key={`${item.source}-${item.id}-${idx}`} style={styles.cardWrap}>
                    <VideoCard
                      id={item.id.toString()} source={item.source} title={item.title}
                      poster={item.poster} year={item.year} sourceName={item.source_name}
                      totalEpisodes={item.episodes?.length} api={api} from="search"
                    />
                  </View>
                ))}
              </View>
            </ScrollView>
          </>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  topBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#fff' },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 6, gap: 6 },
  inputBox: { flex: 1, height: 42, backgroundColor: '#1c1c1e', borderRadius: 21, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  inputText: { color: '#666', fontSize: 14 },
  searchBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.dark.primary, justifyContent: 'center', alignItems: 'center' },
  clearBtn: { padding: 6 },
  wordSection: { flex: 1, paddingHorizontal: 16, marginBottom: 4 },
  wordHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  wordLabel: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  switchBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 3 },
  switchText: { color: '#666', fontSize: 12 },
  wordList: { flex: 1 },
  wordItem: { paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  wordText: { color: '#ccc', fontSize: 14 },
  keyboard: { paddingHorizontal: 8, marginBottom: 4 },
  kbRow: { flexDirection: 'row', marginBottom: 4, gap: 4 },
  kbKey: { height: 42, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2a2a2e', borderWidth: 1, borderColor: '#3a3a3e', borderRadius: 8 },
  kbFuncKey: { backgroundColor: '#1e1e22' },
  kbSearchKey: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
  kbKeyText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultsArea: { flex: 1, paddingHorizontal: 8 },
  centerRow: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  resultsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 40 },
  cardWrap: { width: '25%', padding: 3 },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 30 },
  splitBar: { marginBottom: 6, maxHeight: 32 },
  splitChip: { backgroundColor: '#1a2a1a', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, marginRight: 6, borderWidth: 1, borderColor: '#2a4a2a' },
  splitText: { color: '#00bb5e', fontSize: 12 },
});
