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
     * 常用于搜索结果列表
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
     * 按来源合并：同一标题下，保留每个来源的一个结果
     * 常用于详情页的换源列表
     */
    fun mergeResultsBySource(results: List<SearchResult>, searchTitle: String): List<SearchResult> {
        val cleanSearchTitle = cleanTitle(searchTitle)
        val map = mutableMapOf<String, SearchResult>()
        
        results.forEach { item ->
            val cleanItemTitle = cleanTitle(item.title)
            // 匹配标题 (模仿 supertvold titleMatches)
            if (cleanItemTitle == cleanSearchTitle || cleanItemTitle.contains(cleanSearchTitle) || cleanSearchTitle.contains(cleanItemTitle)) {
                val sourceKey = item.source
                val existing = map[sourceKey]
                // 同一来源下保留集数最多的
                if (existing == null || item.episodes.size > existing.episodes.size) {
                    map[sourceKey] = item
                }
            }
        }
        return map.values.toList()
    }

    /**
     * 生成增强的搜索变体列表 (模仿 supertvold & LunaTV 逻辑)
     */
    fun generateSearchVariants(query: String): List<String> {
        val trimmed = query.trim()
        if (trimmed.isBlank()) return emptyList()

        val variants = mutableListOf<String>()
        variants.add(trimmed)

        // 1. 去除所有空格
        val noSpaces = trimmed.replace("\\s+".toRegex(), "")
        if (noSpaces != trimmed) variants.add(noSpaces)

        // 2. 中文数字归一化变体 (例: 第四季 -> 第4季)
        val numNormalized = normalizeChineseNumbers(noSpaces)
        if (numNormalized != noSpaces) variants.add(numNormalized)

        // 3. 如果包含空格，生成关键词组合 (模仿 JS 版)
        if (trimmed.contains(" ")) {
            val keywords = trimmed.split("\\s+".toRegex()).filter { it.isNotBlank() }
            if (keywords.size >= 2) {
                val mainKeyword = keywords[0]
                val lastKeyword = keywords.last()
                // 如果最后一段包含 第/季/集 等关键字，合并第一段和最后一段
                if (lastKeyword.contains(Regex("[第季集部篇章]"))) {
                    val combined = mainKeyword + lastKeyword
                    if (!variants.contains(combined)) variants.add(combined)
                }
                // 将空格替换为中文冒号
                val withColon = trimmed.replace(" ", "：")
                if (!variants.contains(withColon)) variants.add(withColon)
                // 仅保留第一段（主标题）
                if (mainKeyword.length > 1 && !variants.contains(mainKeyword)) {
                    variants.add(mainKeyword)
                }
            }
        }

        // 4. 渐进式搜索 (从全名开始，逐步去掉最后一个片段)
        val parts = trimmed.split("\\s+".toRegex())
        if (parts.size > 1) {
            for (i in parts.size - 1 downTo 1) {
                val term = parts.take(i).joinToString("").replace("\\s+".toRegex(), "")
                if (term.isNotBlank() && !variants.contains(term)) {
                    variants.add(term)
                }
            }
        }

        return variants.distinct()
    }

    private fun normalizeChineseNumbers(str: String): String {
        val map = mapOf(
            '一' to '1', '二' to '2', '三' to '3', '四' to '4', '五' to '5',
            '六' to '6', '七' to '7', '八' to '8', '九' to '9', '零' to '0'
        )
        val sb = StringBuilder()
        for (char in str) {
            sb.append(map[char] ?: char)
        }
        return sb.toString()
    }

    /**
     * 生成去尾搜索词列表 (向下兼容)
     */
    fun generateTailTrimTerms(query: String): List<String> {
        return generateSearchVariants(query)
    }
}
