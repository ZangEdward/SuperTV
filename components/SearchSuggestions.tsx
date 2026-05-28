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
    const isAlpha = /^[a-z]{2,}$/i.test(qLower.replace(/\s+/g, ''));

    // 1. 拼音输入 → 优先 atianqi API（"gqwy" → "怪奇物语"）
    let pinyinHits: string[] = [];
    if (isAlpha) {
      pinyinHits = await fetchPinyinSuggestions(q);
      if (pinyinHits.length > 0) {
        setSuggestions(pinyinHits.map(t => ({ text: t, type: 'pinyin' })));
        return;
      }
    }

    // 2. 非拼音或拼音API无结果 → 后台搜索建议
    try {
      const result = await api.getSearchSuggestions(q);
      if (Array.isArray(result) && result.length > 0) {
        setSuggestions(result.map(item =>
          typeof item === 'string' ? { text: item } : item
        ));
        return;
      }
    } catch { /* fall through */ }

    // 3. 默认建议池文字匹配
    const trendingHits = trending.filter(t => t.toLowerCase().includes(qLower));

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

    // 5. 合并去重
    const merged: SuggestionItem[] = [];
    const added = new Set<string>();
    for (const t of [...trendingHits, ...poolHits]) {
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
    }, 300);
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
