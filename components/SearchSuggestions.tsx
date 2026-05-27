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

export default function SearchSuggestions({
  query,
  isVisible,
  onSelect,
  onClose,
  maxHeight = 250,
}: SearchSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    try {
      const result = await api.getSearchSuggestions(q);
      setSuggestions(result);
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
              onSelect(suggestion);
            }}
          >
            <Search size={14} color="#888" style={{ marginRight: 10 }} />
            <Text numberOfLines={1} style={styles.text}>
              {suggestion}
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
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#333",
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  text: {
    color: "#ccc",
    fontSize: 14,
    flex: 1,
  },
});
