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

        // 2. 拼音首字母模式 (如果全是字母，可能是拼音首字母)
        if (trimmed.all { it.isLetter() }) {
            // 保持原样，上面已经添加了
        }

        // 3. 中文数字归一化变体 (例: 第四季 -> 第4季)
        val numNormalized = normalizeChineseNumbers(noSpaces)
        if (numNormalized != noSpaces) variants.add(numNormalized)

        // 4. 渐进式搜索 (1 2 3 -> 123, 12)
        val parts = trimmed.split("\\s+".toRegex())
        if (parts.size > 1) {
            for (i in parts.size - 1 downTo 1) {
                val term = parts.take(i).joinToString("")
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
