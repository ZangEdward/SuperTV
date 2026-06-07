package com.supertv.app.services

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.StringReader
import java.net.URL

/**
 * M3U/M3U8 解析服务 - 对应原项目的 services/m3u.ts
 *
 * 解析 M3U8 索引文件，提�?TS 片段和加密信�?
 */
class M3uService {

    data class M3U8Playlist(
        val segments: List<M3U8Segment>,
        val targetDuration: Int = 10,
        val version: Int = 3,
        val isLive: Boolean = false
    )

    data class M3U8Segment(
        val url: String,
        val duration: Double = 0.0,
        val sequence: Int = 0
    )

    data class M3U8EncryptionInfo(
        val method: String = "NONE",
        val uri: String? = null,
        val iv: String? = null
    )

    data class M3U8Variant(
        val uri: String,
        val bandwidth: Int = 0,
        val resolution: String? = null
    )

    /**
     * 解析 M3U8 主播放列�?
     */
    suspend fun parseMasterPlaylist(url: String): List<M3U8Variant> = withContext(Dispatchers.IO) {
        val content = downloadText(url)
        val variants = mutableListOf<M3U8Variant>()
        val lines = content.lines()
        var i = 0
        while (i < lines.size) {
            val line = lines[i].trim()
            if (line.startsWith("#EXT-X-STREAM-INF")) {
                val bandwidth = parseAttribute(line, "BANDWIDTH")?.toIntOrNull() ?: 0
                val resolution = parseAttribute(line, "RESOLUTION")
                i++
                if (i < lines.size && !lines[i].trim().startsWith("#")) {
                    val uri = resolveUrl(url, lines[i].trim())
                    variants.add(M3U8Variant(uri, bandwidth, resolution))
                }
            }
            i++
        }
        variants
    }

    /**
     * 解析 M3U8 媒体播放列表
     */
    suspend fun parseMediaPlaylist(url: String): M3U8Playlist = withContext(Dispatchers.IO) {
        val content = downloadText(url)
        val segments = mutableListOf<M3U8Segment>()
        var targetDuration = 10
        var version = 3
        var sequence = 0
        var isLive = false
        var currentDuration = 0.0

        val lines = content.lines()
        var i = 0
        while (i < lines.size) {
            val line = lines[i].trim()
            when {
                line.startsWith("#EXT-X-TARGETDURATION") -> {
                    targetDuration = line.substringAfter(":").toIntOrNull() ?: 10
                }
                line.startsWith("#EXT-X-VERSION") -> {
                    version = line.substringAfter(":").toIntOrNull() ?: 3
                }
                line.startsWith("#EXT-X-MEDIA-SEQUENCE") -> {
                    sequence = line.substringAfter(":").toIntOrNull() ?: 0
                }
                line.startsWith("#EXTINF") -> {
                    currentDuration = line.substringAfter(":").substringBefore(",").toDoubleOrNull() ?: 0.0
                }
                line.startsWith("#EXT-X-ENDLIST") -> {
                    isLive = false
                }
                !line.startsWith("#") && line.isNotBlank() -> {
                    val segmentUrl = resolveUrl(url, line)
                    segments.add(M3U8Segment(segmentUrl, currentDuration, sequence + segments.size))
                }
            }
            i++
        }

        M3U8Playlist(segments, targetDuration, version, isLive)
    }

    /**
     * 解析加密信息
     */
    suspend fun parseEncryptionInfo(url: String): M3U8EncryptionInfo? = withContext(Dispatchers.IO) {
        val content = downloadText(url)
        val keyLine = content.lines().firstOrNull { it.startsWith("#EXT-X-KEY") } ?: return@withContext null
        val method = parseAttribute(keyLine, "METHOD") ?: "NONE"
        val uri = parseAttribute(keyLine, "URI")?.trim('\'')
        val iv = parseAttribute(keyLine, "IV")
        M3U8EncryptionInfo(method, uri?.let { resolveUrl(url, it) }, iv)
    }

    private fun downloadText(url: String): String {
        val connection = URL(url).openConnection()
        connection.connectTimeout = 10000
        connection.readTimeout = 30000
        connection.setRequestProperty("User-Agent", "Mozilla/5.0 SuperTV/1.0")
        return connection.getInputStream().bufferedReader().use { it.readText() }
    }

    private fun resolveUrl(baseUrl: String, relativeUrl: String): String {
        return if (relativeUrl.startsWith("http")) relativeUrl
        else {
            val base = baseUrl.substringBeforeLast("/")
            "$base/$relativeUrl"
        }
    }

    private fun parseAttribute(line: String, attr: String): String? {
        val regex = Regex("""$attr="([^"]*)"""")
        return regex.find(line)?.groupValues?.getOrNull(1)
    }
}
