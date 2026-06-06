package com.supertv.resupertv.services

/**
 * 对应 m3u.ts / m3u8.ts 的解析逻辑
 */
class M3uService {
    fun parsePlaylist(content: String): List<String> {
        return content.lines().filter { it.startsWith("#EXTINF") || (it.endsWith(".m3u8") || it.endsWith(".ts")) }
    }
}
