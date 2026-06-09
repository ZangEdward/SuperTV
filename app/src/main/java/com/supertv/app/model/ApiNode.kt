package com.supertv.app.model

import com.google.gson.JsonElement
import com.google.gson.annotations.SerializedName

/**
 * API节点配置
 */
data class ApiNode(
    @SerializedName("key")
    val key: String,

    @SerializedName("label")
    val label: String,

    @SerializedName("url")
    val url: String,

    @SerializedName("api")
    val api: String = ""
)

/**
 * 视频搜索结果
 */
data class SearchResult(
    val title: String = "",
    val cover: String = "",
    val poster: String = "", // 兼容 supertvold
    val source: String = "",
    @SerializedName("source_name")
    val sourceName: String = "",
    val id: String = "",
    val year: String = "",
    val rating: String = "",
    val rate: String = "", // 兼容 supertvold
    val desc: String = "",
    val type: String = "",
    @SerializedName("episodes")
    val episodesRaw: JsonElement? = null,
    @SerializedName("episodes_titles")
    val episodeTitles: List<String> = emptyList(),
    @SerializedName("episodes_list") // 兼容带对象的格式
    val episodesList: List<Episode>? = null
) {
    val episodes: List<Episode> get() {
        if (!episodesList.isNullOrEmpty()) return episodesList
        
        val raw = episodesRaw ?: return emptyList()
        if (raw.isJsonArray) {
            val arr = raw.asJsonArray
            if (arr.size() == 0) return emptyList()
            
            val first = arr[0]
            return if (first.isJsonPrimitive && first.asJsonPrimitive.isString) {
                arr.mapIndexed { index, el ->
                    Episode.parse(el.asString, index, episodeTitles.getOrNull(index))
                }
            } else if (first.isJsonObject) {
                val gson = com.google.gson.Gson()
                arr.mapIndexed { index, el ->
                    gson.fromJson(el, Episode::class.java).copy(index = index)
                }
            } else {
                emptyList()
            }
        }
        return emptyList()
    }
}

/**
 * 搜索响应包装 (supertvold 风格)
 */
data class SearchResponse(
    val results: List<SearchResult>? = null,
    val data: List<SearchResult>? = null // 兼容部分 API 返回 data 字段
)

/**
 * 剧集信息
 */
data class Episode(
    val index: Int = 0,
    val title: String = "",
    val url: String = "",
    val isCache: Boolean = false
) {
    companion object {
        /**
         * 解析剧集字符串，提取标题和URL (模仿 supertvold parseEpisode 逻辑)
         * 常见格式: "标题$URL" 或 "URL"
         */
        fun parse(raw: String, index: Int, providedTitle: String? = null): Episode {
            val defaultTitle = providedTitle ?: "第 ${index + 1} 集"
            if (raw.isBlank()) return Episode(index, defaultTitle, "")

            // 处理 "标题$URL" 格式
            if (raw.contains("$")) {
                val parts = raw.split("$")
                val title = parts[0].trim()
                val url = parts.drop(1).joinToString("$").trim()
                return Episode(index, title.ifBlank { defaultTitle }, url)
            }

            // 处理 "标题#URL" 格式 (某些源使用 # 分割)
            if (raw.contains("#") && !raw.startsWith("http") && !raw.startsWith("rtmp") && !raw.startsWith("file")) {
                val parts = raw.split("#")
                val title = parts[0].trim()
                val url = parts.drop(1).joinToString("#").trim()
                return Episode(index, title.ifBlank { defaultTitle }, url)
            }

            return Episode(index, defaultTitle, raw)
        }
    }
}

/**
 * 视频详情
 */
data class VideoDetail(
    val id: String = "",
    val title: String = "",
    val cover: String = "",
    val poster: String = "", // 兼容 supertvold
    val desc: String = "",
    val year: String = "",
    val area: String = "",
    val rating: String = "", // 新增
    val director: String = "",
    val actor: String = "",
    val source: String = "",
    @SerializedName("source_name")
    val sourceName: String = "",
    @SerializedName("episodes_list")
    val episodesList: List<Episode>? = null,
    @SerializedName("episodes")
    val episodesRaw: JsonElement? = null,
    @SerializedName("episodes_titles")
    val episodesTitles: List<String> = emptyList(),
    @SerializedName("total_episodes")
    val totalEpisodes: Int = 0
) {
    val episodes: List<Episode> get() {
        if (!episodesList.isNullOrEmpty()) return episodesList
        
        val raw = episodesRaw ?: return emptyList()
        if (raw.isJsonArray) {
            val arr = raw.asJsonArray
            if (arr.size() == 0) return emptyList()
            
            val first = arr[0]
            return if (first.isJsonPrimitive && first.asJsonPrimitive.isString) {
                arr.mapIndexed { index, el ->
                    Episode.parse(el.asString, index, episodesTitles.getOrNull(index))
                }
            } else if (first.isJsonObject) {
                val gson = com.google.gson.Gson()
                arr.mapIndexed { index, el ->
                    gson.fromJson(el, Episode::class.java).copy(index = index)
                }
            } else {
                emptyList()
            }
        }
        return emptyList()
    }
}

/**
 * 豆瓣条目
 */
data class DoubanItem(
    val id: String = "",
    val title: String = "",
    val cover: String = "",
    val poster: String = "", // 兼容 supertvold
    val year: String = "",
    val rating: String = "",
    val rate: String = "", // 兼容 supertvold
    val desc: String = "",
    @SerializedName("source_name")
    val sourceName: String = ""
)

/**
 * 豆瓣响应 (supertvold 风格)
 */
data class DoubanResponse(
    val code: Int = 0,
    val message: String = "",
    val list: List<DoubanItem> = emptyList(),
    val items: List<DoubanItem> = emptyList() // 兼容性保留
)

/**
 * 豆瓣详情响应
 */
data class DoubanDetailResponse(
    val code: Int = 0,
    val message: String = "",
    val data: DoubanDetail? = null
)

/**
 * 豆瓣详细数据
 */
data class DoubanDetail(
    val id: String = "",
    val title: String = "",
    val poster: String = "",
    val rate: String = "",
    val year: String = "",
    val directors: List<String> = emptyList(),
    val cast: List<String> = emptyList(),
    val genres: List<String> = emptyList(),
    @SerializedName("plot_summary")
    val plotSummary: String = "",
    val episodes: Int? = null,
    val backdrop: String? = null,
    @SerializedName("trailerUrl")
    val trailerUrl: String? = null,
    val actors: List<DoubanActor> = emptyList()
)

/**
 * 豆瓣演员
 */
data class DoubanActor(
    val id: String = "",
    val name: String = "",
    val avatar: String = "",
    val role: String = ""
)

/**
 * API站点配置
 */
data class ApiSite(
    val key: String,
    val api: String,
    val name: String,
    val detail: String = ""
)

/**
 * 服务器配置
 */
data class ServerConfig(
    val SiteName: String = "",
    @SerializedName("StorageType")
    val StorageType: String = "localstorage"
)

/**
 * DLNA设备
 */
data class DLNADevice(
    val id: String = "",
    val name: String = "",
    val host: String = "",
    val port: Int = 0,
    val controlUrl: String = "",
    val descriptionUrl: String = ""
)

/**
 * 网盘搜索响应
 */
data class NetDiskResponse(
    val success: Boolean = false,
    val data: NetDiskData? = null,
    val error: String? = null
)

/**
 * 网盘搜索数据
 */
data class NetDiskData(
    val total: Int = 0,
    @SerializedName("merged_by_type")
    val mergedByType: Map<String, List<NetDiskItem>> = emptyMap(),
    val query: String = ""
)

/**
 * 网盘搜索项
 */
data class NetDiskItem(
    val url: String = "",
    val password: String = "",
    val note: String = "",
    val datetime: String = "",
    val source: String = "",
    val images: List<String>? = null,
    // 兼容旧字段
    val type: String = "",
    val title: String = "",
    val size: String = "",
    val name: String = "",
    @SerializedName("update_time")
    val updateTime: String = ""
) {
    /**
     * 解析后的网盘信息
     */
    val parsedInfo: ParsedNote by lazy { NetDiskParser.parse(note) }
}

/**
 * 解析后的网盘描述信息
 */
data class ParsedNote(
    val title: String = "",
    val type: String = "", // 动漫、电影、剧集、游戏
    val episode: String = "", // S01、第1-7季、全24集
    val year: String = "",
    val quality: String = "", // 1080P、4K
    val language: String = "", // 国语、日语中字
    val tags: List<String> = emptyList()
)

object NetDiskParser {
    fun parse(note: String): ParsedNote {
        if (note.isBlank()) return ParsedNote()

        var type = ""
        var episode = ""
        var year = ""
        var quality = ""
        var language = ""
        val tags = mutableListOf<String>()

        // 1. 尝试提取年份 (4位数字)
        val yearRegex = Regex("(19|20)\\d{2}")
        year = yearRegex.find(note)?.value ?: ""

        // 2. 尝试提取质量/清晰度
        val qualityRegex = Regex("(?i)(4K|2160P|1080P|720P|BDRip|Remux|Web-DL|HDR|DV|HEVC|x26[45]|AVC)")
        quality = qualityRegex.find(note)?.value ?: ""

        // 3. 尝试提取季/集数
        val episodeRegex = Regex("(?i)(S\\d+E\\d+|S\\d+|EP\\d+|第[\\d-]+[季集]|全\\d+[季集]|第\\d+部|Season \\d+)")
        episode = episodeRegex.find(note)?.value ?: ""

        // 4. 尝试提取语言
        val langRegex = Regex("(国语|粤语|日语|英语|韩语|中字|中英字幕|内封字幕|简繁中字|简日双语|日语中字)")
        language = langRegex.find(note)?.value ?: ""

        // 5. 尝试提取类型
        val typeRegex = Regex("(动漫|电影|剧集|电视剧|美剧|日剧|韩剧|国产剧|综艺|游戏|纪录片)")
        type = typeRegex.find(note)?.value ?: ""

        // 6. 提取标题 (通常在第一个分隔符前)
        // 简单处理：取第一个空格或特殊字符前的内容作为标题
        val cleanNote = note.replace(year, "").replace(quality, "").replace(episode, "")
            .replace(language, "").replace(type, "").trim()
        
        // 修正正则表达式警告：在 [] 中 ( ) 不需要转义，[ ] 需要转义
        val parts = cleanNote.split(Regex("[\\s()（）\\[\\]\\-_]")).filter { it.isNotBlank() }
        val title = if (parts.isNotEmpty()) parts[0] else ""
        if (parts.size > 1) {
            tags.addAll(parts.drop(1))
        }

        return ParsedNote(
            title = title,
            type = type,
            episode = episode,
            year = year,
            quality = quality,
            language = language,
            tags = tags
        )
    }
}

/**
 * 更新信息
 */
data class UpdateInfo(
    val version: String = "",
    val versionCode: Int = 0,
    val downloadUrl: String = "",
    val changelog: String = "",
    val forceUpdate: Boolean = false
)

/**
 * 搜索建议
 */
data class SearchSuggestion(
    val keyword: String = "",
    val type: String = "history"
)

/**
 * AI 推荐响应
 */
data class AIRecommendResponse(
    val content: String = "",
    val status: String = "success"
)

/**
 * 收藏信息
 */
data class Favorite(
    val title: String = "",
    @SerializedName("source_name")
    val sourceName: String = "",
    @SerializedName("search_title")
    val searchTitle: String = "",
    val cover: String = "",
    val year: String = "",
    val rating: String = "",
    val type: String = "",
    @SerializedName("save_time")
    val saveTime: Long = 0
)

/**
 * 播放记录
 */
data class PlayRecord(
    val title: String = "",
    @SerializedName("source_name")
    val sourceName: String = "",
    @SerializedName("search_title")
    val searchTitle: String = "",
    val cover: String = "",
    val year: String = "",
    val index: Int = 0,
    @SerializedName("total_episodes")
    val totalEpisodes: Int = 0,
    @SerializedName("play_time")
    val playTime: Int = 0,
    @SerializedName("total_time")
    val totalTime: Int = 0,
    @SerializedName("save_time")
    val saveTime: Long = 0,
    val type: String = ""
)

/**
 * 上映日历项
 */
data class ReleaseItem(
    val date: String = "",
    val title: String = "",
    val type: String = "",
    val id: String = ""
)

/**
 * 上映日历响应
 */
data class ReleaseCalendarResponse(
    val items: List<ReleaseItem> = emptyList()
)

/**
 * Bangumi 条目
 */
data class BangumiItem(
    val id: Int = 0,
    val name: String = "",
    @SerializedName("name_cn")
    val nameCn: String = "",
    val summary: String = "",
    @SerializedName("images")
    val images: BangumiImages? = null,
    @SerializedName("rating")
    val rating: BangumiRating? = null
)

data class BangumiImages(
    val large: String = "",
    val common: String = "",
    val medium: String = "",
    val small: String = "",
    val grid: String = ""
)

data class BangumiRating(
    val score: Double = 0.0,
    val total: Int = 0
)

/**
 * Bangumi 每日更新
 */
data class BangumiCalendarItem(
    val weekday: BangumiWeekday? = null,
    val items: List<BangumiItem> = emptyList()
)

data class BangumiWeekday(
    val en: String = "",
    val cn: String = "",
    val ja: String = "",
    val id: Int = 0
)
