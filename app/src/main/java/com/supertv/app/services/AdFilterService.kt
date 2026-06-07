package com.supertv.app.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AdFilterService {

    data class FilterResult(
        val content: String,
        val adsRemoved: Int = 0
    )

    private val adKeywords = listOf(
        "ads", "adv", "union", "baidu", "google", "doubleclick", "analytics",
        "ad-segment", "-ad-", "segment-ad", "promot", "affiliate"
    )

    suspend fun filterM3U8(content: String): FilterResult = withContext(Dispatchers.IO) {
        val lines = content.lines()
        val filteredLines = mutableListOf<String>()
        var adsRemoved = 0
        var currentBlock = mutableListOf<String>()
        var inDiscontinuity = false

        var i = 0
        while (i < lines.size) {
            val line = lines[i].trim()
            if (line.isEmpty()) {
                i++
                continue
            }

            if (line.startsWith("#EXT-X-DISCONTINUITY")) {
                if (inDiscontinuity) {
                    val result = processBlock(currentBlock)
                    if (result.isAd) adsRemoved++ else filteredLines.addAll(currentBlock)
                    currentBlock = mutableListOf()
                }
                inDiscontinuity = true
                currentBlock.add(line)
                i++
                continue
            }

            if (inDiscontinuity) {
                currentBlock.add(line)
                i++
                continue
            }

            if (line.startsWith("#EXTINF")) {
                val nextLine = if (i + 1 < lines.size) lines[i + 1].trim() else ""
                if (isAdLine(nextLine) || isAdLine(line)) {
                    adsRemoved++
                    i += 2 // Skip EXTINF and the URL
                    continue
                }
            }

            filteredLines.add(line)
            i++
        }

        if (inDiscontinuity) {
            val result = processBlock(currentBlock)
            if (result.isAd) adsRemoved++ else filteredLines.addAll(currentBlock)
        }

        FilterResult(filteredLines.joinToString("\n"), adsRemoved)
    }

    private data class BlockResult(val isAd: Boolean)

    private fun processBlock(block: List<String>): BlockResult {
        val content = block.joinToString("\n").lowercase()
        val hasKeyword = adKeywords.any { content.contains(it) }
        
        var totalDuration = 0.0
        var segmentCount = 0
        block.forEach { line ->
            if (line.startsWith("#EXTINF:")) {
                val duration = line.substringAfter(":").substringBefore(",").toDoubleOrNull() ?: 0.0
                totalDuration += duration
                segmentCount++
            }
        }
        
        val isSuspicious = totalDuration > 0 && totalDuration < 15 && segmentCount > 3
        return BlockResult(hasKeyword || isSuspicious)
    }

    private fun isAdLine(line: String): Boolean {
        val lower = line.lowercase()
        return adKeywords.any { lower.contains(it) }
    }
}
