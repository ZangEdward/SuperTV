package com.supertv.app.utils

import com.supertv.app.model.SearchResult

object SearchUtils {

    /**
     * 清理标题：去空格、去特殊字符、统一小写
     */
    fun cleanTitle(title: String): String {
        return title.replace("\\s+".toRegex(), "")
            .replace("[\\p{Punct}\\p{IsPunct}]+".toRegex(), "") // 使用更通用的正则表达式清理符号
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
     * 生成模糊词变体 (对齐 supertvold generateFuzzyTerms)
     * 例如 "海贼王第1季" -> ["海贼王第1季", "海贼王"]
     */
    fun generateFuzzyTerms(term: String): List<String> {
        val variants = mutableListOf<String>()
        val cleaned = cleanTitle(term)
        if (cleaned.isNotBlank()) variants.add(cleaned)

        // 去除季/集后缀：Regex 对齐 JS 版
        val seasonRemoved = cleaned.replace("第[一二三四五六七八九十\\d]+[季部期集].*$".toRegex(), "")
        if (seasonRemoved.isNotBlank() && seasonRemoved != cleaned) {
            variants.add(seasonRemoved)
        }
        return variants.distinct()
    }

    /**
     * 生成增强的搜索变体列表 (对齐 supertvold generateSearchVariants)
     */
    fun generateSearchVariants(query: String): List<String> {
        val variants = mutableListOf<String>()
        val trimmed = query.trim()
        if (trimmed.isBlank()) return variants

        // 1. 原始查询
        variants.add(trimmed)

        // 2. 去除所有空格
        val noSpaces = trimmed.replace("\\s+".toRegex(), "")
        if (noSpaces != trimmed) variants.add(noSpaces)

        // 3. 中文数字归一化
        val numNormalized = normalizeChineseNumbers(noSpaces)
        if (numNormalized != noSpaces) variants.add(numNormalized)

        // 4. 空格相关变体
        if (trimmed.contains(" ")) {
            val words = trimmed.split("\\s+".toRegex()).filter { it.isNotBlank() }
            if (words.size >= 2) {
                val mainKeyword = words[0]
                val lastKeyword = words.last()
                if (lastKeyword.contains(Regex("[第季集部篇章]"))) {
                    val combined = mainKeyword + lastKeyword
                    if (!variants.contains(combined)) variants.add(combined)
                }
                val withColon = trimmed.replace(" ", "：")
                if (!variants.contains(withColon)) variants.add(withColon)
                if (mainKeyword.length > 1 && !variants.contains(mainKeyword)) {
                    variants.add(mainKeyword)
                }
            }
        }

        // 5. 渐进式搜索词 (对齐 JS progressiveSearchTerms)
        val parts = trimmed.split("\\s+".toRegex())
        if (parts.size > 1) {
            for (i in parts.size downTo 1) {
                val term = parts.take(i).joinToString("").replace("\\s+".toRegex(), "")
                if (term.isNotBlank() && !variants.contains(term)) {
                    variants.add(term)
                }
            }
        }

        return variants.distinct()
    }

    /**
     * 将中文数字归一化为阿拉伯数字
     */
    fun normalizeChineseNumbers(str: String): String {
        val map = mapOf(
            '一' to '1', '二' to '2', '三' to '3', '四' to '4', '五' to '5',
            '六' to '6', '七' to '7', '八' to '8', '九' to '9', '零' to '0',
            '〇' to '0', '两' to '2'
        )
        val sb = StringBuilder()
        for (char in str) {
            sb.append(map[char] ?: char)
        }
        return sb.toString()
    }

    /**
     * 增强标题匹配逻辑：对齐 supertvold titleMatches，支持包含功能
     */
    fun titleMatches(searchTitle: String, targetTitle: String): Boolean {
        val s = cleanTitle(searchTitle)
        val t = cleanTitle(targetTitle)
        
        if (s.isBlank() || t.isBlank()) return false

        // 1. 物理精准匹配
        if (s == t) return true
        
        // 2. 归一化中文数字后匹配
        val sNorm = normalizeChineseNumbers(s)
        val tNorm = normalizeChineseNumbers(t)
        if (sNorm == tNorm) return true
        
        // 3. 相互包含匹配 (核心修复：蘑菇搜索应该有的包含功能)
        if (t.contains(s) || s.contains(t)) return true
        
        // 4. 归一化后相互包含
        if (tNorm.contains(sNorm) || sNorm.contains(tNorm)) return true
        
        return false
    }

    /**
     * 生成去尾搜索词列表 (向下兼容)
     */
    fun generateTailTrimTerms(query: String): List<String> {
        return generateSearchVariants(query)
    }

    /**
     * 获取去尾标题：去除最后一个空格及其后面的内容
     */
    fun getTailTrimTitle(title: String): String {
        if (!title.contains(" ")) return title
        return title.substringBeforeLast(" ").trim()
    }

    /**
     * 合并剧集列表 (模仿 supertvold mergeEpisodes)
     * 将多个来源的剧集进行对齐合并
     */
    fun mergeEpisodes(baseEpisodes: List<com.supertv.app.model.Episode>, otherEpisodes: List<com.supertv.app.model.Episode>): List<com.supertv.app.model.Episode> {
        if (baseEpisodes.isEmpty()) return otherEpisodes
        if (otherEpisodes.isEmpty()) return baseEpisodes

        val result = baseEpisodes.toMutableList()
        val baseTitles = baseEpisodes.map { it.title.trim() }.toSet()

        otherEpisodes.forEach { other ->
            if (!baseTitles.contains(other.title.trim())) {
                // 如果基础列表中没有这个标题，且 URL 不为空，则尝试添加
                if (other.url.isNotBlank()) {
                    result.add(other)
                }
            }
        }
        
        // 简单排序：尝试按标题中的数字排序
        return result.sortedBy { ep ->
            val num = Regex("\\d+").find(ep.title)?.value?.toIntOrNull() ?: 999
            num
        }
    }
}
