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
 * 视频搜索结果�?
 */
data class SearchResult(
    val title: String = "",
    val cover: String = "",
    val source: String = "",
    val sourceName: String = "",
    val id: String = "",
    val year: String = "",
    val desc: String = "",
    val type: String = "",
    val episodes: List<Episode> = emptyList()
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
    val desc: String = "",
    val year: String = "",
    val area: String = "",
    val director: String = "",
    val actor: String = "",
    val source: String = "",
    val sourceName: String = "",
    val episodes: List<Episode> = emptyList(),
    val episodesTitles: List<String> = emptyList(),
    val totalEpisodes: Int = 0
)

/**
 * 豆瓣条目
 */
data class DoubanItem(
    val id: String = "",
    val title: String = "",
    val cover: String = "",
    val year: String = "",
    val rating: String = "",
    val desc: String = "",
    val sourceName: String = ""
)

/**
 * 豆瓣响应
 */
data class DoubanResponse(
    val items: List<DoubanItem> = emptyList()
)

/**
 * 收藏�?
 */
data class Favorite(
    val cover: String = "",
    val title: String = "",
    val sourceName: String = "",
    val totalEpisodes: Int = 0,
    val searchTitle: String = "",
    val year: String = "",
    val saveTime: Long = 0L
)

/**
 * 播放记录
 */
data class PlayRecord(
    val title: String = "",
    val sourceName: String = "",
    val cover: String = "",
    val index: Int = 0,
    val totalEpisodes: Int = 0,
    val playTime: Long = 0L,
    val totalTime: Long = 0L,
    val saveTime: Long = 0L,
    val year: String = ""
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
 * 服务器配�?
 */
data class ServerConfig(
    val SiteName: String = "",
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
 * 网盘搜索�?
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
