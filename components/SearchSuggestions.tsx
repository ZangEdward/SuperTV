import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Search } from "lucide-react-native";
import { api } from "@/services/api";

interface SearchSuggestionsProps {
  query: string;
  isVisible: boolean;
  onSelect: (suggestion: string) => void;
  onClose: () => void;
  maxHeight?: number;
}

interface SuggestionItem {
  text: string;
  type?: string;
  score?: number;
}

/** atianqi 拼音联想 API（与 TV 搜索共用） */
async function fetchPinyinSuggestions(key: string): Promise<string[]> {
  try {
    const url = `https://tv.aiseet.atianqi.com/i-tvbin/qtv_video/search/get_search_smart_box?format=json&page_num=0&page_size=20&key=${encodeURIComponent(key)}`;
    console.log('[ATIANQI_DEBUG] Fetching:', url);
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
    if (!res.ok) { console.log('[ATIANQI_DEBUG] HTTP', res.status); return []; }
    const json = await res.json();
    console.log('[ATIANQI_DEBUG] Res keys:', Object.keys(json));
    const groupData = json?.data?.search_data?.vecGroupData?.[0]?.group_data || [];
    console.log('[ATIANQI_DEBUG] group_data:', groupData.length);
    return groupData.map((g: any) =>
      g?.dtReportInfo?.reportData?.keyword_txt || ''
    ).filter(Boolean).slice(0, 15);
  } catch (e: any) {
    console.log('[ATIANQI_DEBUG] Error:', e?.message || e);
    return [];
  }
}

export default function SearchSuggestions({
  query,
  isVisible,
  onSelect,
  onClose,
  maxHeight = 250,
}: SearchSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 挂载时缓存一批默认建议作为匹配池
  useEffect(() => {
    api.getSearchSuggestions('').then(res => {
      if (Array.isArray(res)) setTrending(res.map(r => typeof r === 'string' ? r : r.text));
    }).catch(() => {});
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    const qLower = q.toLowerCase();

    // 1. 先在热词池中文字匹配（最快）
    const trendingHits = trending.filter(t => t.toLowerCase().includes(qLower));

    // 2. atianqi 拼音联想（服务端将 "gqwy" 转为 "怪奇物语"）
    let pinyinHits: string[] = [];
    if (/^[a-z]{2,}$/i.test(qLower.replace(/\s+/g, ''))) {
      try { pinyinHits = await fetchPinyinSuggestions(q); } catch { /* ignore */ }
    }

    // 3. 后台搜索建议
    let backendHits: string[] = [];
    if (pinyinHits.length === 0) {
      try {
        const result = await api.getSearchSuggestions(q);
        if (Array.isArray(result) && result.length > 0) {
          backendHits = result.map(item => typeof item === 'string' ? item : item.text || '');
        }
      } catch { /* ignore */ }
    }

    // 4. SearchDetailPool 文字匹配
    const poolHits: string[] = [];
    try {
      const { SearchDetailPool } = require('@/stores/searchStore');
      const seen = new Set<string>();
      SearchDetailPool.forEach((val: any) => {
        const title = (val?.title || '').trim();
        if (!title || seen.has(title)) return;
        seen.add(title);
        if (title.toLowerCase().includes(qLower)) poolHits.push(title);
      });
    } catch { /* ignore */ }

    // 5. 合并去重（热词优先）
    const merged: SuggestionItem[] = [];
    const added = new Set<string>();
    for (const t of [...trendingHits, ...pinyinHits, ...backendHits, ...poolHits]) {
      if (!added.has(t)) { added.add(t); merged.push({ text: t }); }
    }
    setSuggestions(merged.slice(0, 12));
  }, [trending]);

  useEffect(() => {
    if (!query.trim() || !isVisible || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchSuggestions(query);
    }, 200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, isVisible, fetchSuggestions]);

  if (!isVisible || suggestions.length === 0) return null;

  return (
    <View style={[styles.container, { maxHeight }]}>
      <ScrollView
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        {suggestions.map((suggestion, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.item}
            onPress={() => {
              setSuggestions([]);
              onSelect(suggestion.text);
            }}
          >
            <View style={styles.iconWrapper}>
                <Search size={14} color="#00bb5e" />
            </View>
            <Text numberOfLines={1} style={styles.text}>
              {suggestion.text}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: "#151718",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#222",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f1f",
  },
  iconWrapper: {
    marginRight: 12,
    padding: 6,
    backgroundColor: 'rgba(0, 187, 94, 0.1)',
    borderRadius: 6,
  },
  text: {
    color: "#e1e1e1",
    fontSize: 15,
    flex: 1,
  },
});
