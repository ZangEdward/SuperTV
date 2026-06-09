package com.supertv.app.utils

import com.supertv.app.model.SearchResult

object SearchUtils {

    /**
     * 清理标题：去空格、去特殊字符、统一小写
     */
    fun cleanTitle(title: String): String {
        return title.replace("\\s+".toRegex(), "")
            .replace("[+·./\\\\()（）【】\\[\\]《》{}：:、;；，,。！？!?\"\"''『』«»\\-—–—_*~`@#$%^&|<>]+".toRegex(), "")
            .lowercase()
    }

    /**
     * 合并搜索结果：按清理后的标题去重，并保留集数最多的项
     */
    fun mergeResults(results: List<SearchResult>): List<SearchResult> {
        val map = mutableMapOf<String, SearchResult>()
        results.forEach { item ->
            val key = cleanTitle(item.title)
            if (key.isBlank()) return@forEach
            
            val existing = map[key]
            if (existing == null || item.episodes.size > existing.episodes.size) {
                map[key] = item
            }
        }
        return map.values.toList().sortedByDescending { it.year }
    }

    /**
     * 生成去尾搜索词列表
     */
    fun generateTailTrimTerms(query: String): List<String> {
        val terms = mutableListOf<String>()
        var current = query.trim()
        while (current.length > 1) {
            current = current.dropLast(1)
            if (current.isNotBlank()) {
                terms.add(current)
            }
        }
        return terms
    }
}
