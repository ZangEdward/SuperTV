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
    @SerializedName("episodes")
    val episodeUrls: List<String> = emptyList(),
    @SerializedName("episodes_titles")
    val episodeTitles: List<String> = emptyList(),
    @SerializedName("episodes_list") // 兼容带对象的格式
    val episodesList: List<Episode>? = null
) {
    val episodes: List<Episode> get() {
        if (!episodesList.isNullOrEmpty()) return episodesList
        return episodeUrls.mapIndexed { index, url ->
            Episode(
                index = index,
                title = episodeTitles.getOrNull(index) ?: (index + 1).toString(),
                url = url
            )
        }
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
    val rating: String = "", // 新增
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
    val source: String = "",
    val type: String = "",
    val url: String = "",
    val title: String = "",
    val datetime: String = "",
    val size: String = "",
    val name: String = "", // 兼容不同 API
    val note: String = "",
    @SerializedName("update_time")
    val updateTime: String = ""
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
