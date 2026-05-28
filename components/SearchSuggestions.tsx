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

export default function SearchSuggestions({
  query,
  isVisible,
  onSelect,
  onClose,
  maxHeight = 250,
}: SearchSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    try {
      const result = await api.getSearchSuggestions(q);
      if (Array.isArray(result)) {
        const normalized = result.map(item =>
          typeof item === 'string' ? { text: item } : item
        );
        setSuggestions(normalized);
      } else {
        setSuggestions([]);
      }
    } catch {
      setSuggestions([]);
    }
  }, []);

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
