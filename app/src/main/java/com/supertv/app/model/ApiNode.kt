package com.supertv.app.model

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
    val episodes: List<Episode> = emptyList()
)

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
)

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
    val director: String = "",
    val actor: String = "",
    val source: String = "",
    @SerializedName("source_name")
    val sourceName: String = "",
    val episodes: List<Episode> = emptyList(),
    @SerializedName("episodes_titles")
    val episodesTitles: List<String> = emptyList(),
    @SerializedName("total_episodes")
    val totalEpisodes: Int = 0
)

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
 * 网盘搜索项
 */
data class NetDiskItem(
    val source: String = "",
    val type: String = "",
    val url: String = "",
    val title: String = "",
    val datetime: String = "",
    val size: String = ""
)

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
