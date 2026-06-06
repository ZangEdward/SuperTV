package com.supertv.resupertv.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * M3U8 广告过滤服务 - 对应原项目的 m3u8.ts 中的广告过滤逻辑
 *
 * 通过本地代理自动识别并移除流媒体中的广告片段与间隔块
 */
class AdFilterService {

    data class FilterResult(
        val segments: List<String>,
        val adsRemoved: Int = 0,
        val originalCount: Int = 0
    )

    // 广告片段识别模式
    private val adPatterns = listOf(
        Regex("""ad-?\d*""", RegexOption.IGNORE_CASE),
        Regex("""advertisement""", RegexOption.IGNORE_CASE),
        Regex("""promo""", RegexOption.IGNORE_CASE),
        Regex("""commercial""", RegexOption.IGNORE_CASE),
        Regex("""(tvg|logo)-?\d*""", RegexOption.IGNORE_CASE),
        Regex("""\d+s_ad""", RegexOption.IGNORE_CASE),
        Regex("""advert""", RegexOption.IGNORE_CASE),
        Regex("""sponsor""", RegexOption.IGNORE_CASE)
    )

    // 广告时段的持续时间阈值（秒）- 短于此值可能为广告片段
    private val adDurationThreshold = 30.0

    /**
     * 过滤 M3U8 播放列表中的广告片段
     */
    suspend fun filterPlaylist(content: String, baseUrl: String): FilterResult =
        withContext(Dispatchers.IO) {
            val lines = content.lines().toMutableList()
            val filteredLines = mutableListOf<String>()
            var adsRemoved = 0
            var originalCount = 0
            var skipNextUri = false

            var i = 0
            while (i < lines.size) {
                val line = lines[i].trim()

                when {
                    line.startsWith("#EXTINF") -> {
                        val duration = parseDuration(line)
                        originalCount++

                        // 检查是否是广告片段
                        val nextLine = if (i + 1 < lines.size) lines[i + 1].trim() else ""

                        val isAd = duration < adDurationThreshold &&
                                (isAdUrl(nextLine) || isAdUrl(line))

                        if (isAd) {
                            adsRemoved++
                            skipNextUri = true
                        } else {
                            filteredLines.add(line)
                            skipNextUri = false
                        }
                    }
                    !line.startsWith("#") && line.isNotBlank() -> {
                        if (!skipNextUri) {
                            filteredLines.add(line)
                        }
                        skipNextUri = false
                    }
                    else -> {
                        if (!skipNextUri) {
                            filteredLines.add(line)
                        }
                    }
                }
                i++
            }

            FilterResult(
                segments = filteredLines,
                adsRemoved = adsRemoved,
                originalCount = originalCount
            )
        }

    private fun isAdUrl(urlOrLine: String): Boolean {
        return adPatterns.any { it.containsMatchIn(urlOrLine) }
    }

    private fun parseDuration(extinfLine: String): Double {
        return extinfLine
            .substringAfter(":")
            .substringBefore(",")
            .trim()
            .toDoubleOrNull() ?: 0.0
    }

    /**
     * 检查是否启用了广告过滤
     */
    fun isFilterEnabled(): Boolean {
        // 由设置控制，通过 SearchPreferenceStore 获取
        return true
    }
}
