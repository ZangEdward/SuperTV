package com.supertv.resupertv.api

import com.supertv.resupertv.model.*
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * API接口定义 - 对应原项目的 services/api.ts
 */
interface ApiService {

    // ==================== 首页/豆瓣 ====================

    @GET("api/v1/douban/hot")
    suspend fun getDoubanHot(): Response<DoubanResponse>

    @GET("api/v1/douban/recommend")
    suspend fun getDoubanRecommend(): Response<DoubanResponse>

    @GET("api/v1/douban/new")
    suspend fun getDoubanNew(): Response<DoubanResponse>

    @GET("api/v1/douban/category")
    suspend fun getDoubanCategory(
        @Query("type") type: String,
        @Query("page") page: Int = 1
    ): Response<DoubanResponse>

    // ==================== 搜索 ====================

    @GET("api/v1/search")
    suspend fun search(
        @Query("q") query: String,
        @Query("source") source: String = "all",
        @Query("page") page: Int = 1
    ): Response<List<SearchResult>>

    @GET("api/v1/search/suggest")
    suspend fun getSuggestions(
        @Query("q") query: String
    ): Response<List<String>>

    // ==================== 详情 ====================

    @GET("api/v1/detail")
    suspend fun getDetail(
        @Query("id") id: String,
        @Query("source") source: String
    ): Response<VideoDetail>

    // ==================== 剧集列表 ====================

    @GET("api/v1/episodes")
    suspend fun getEpisodes(
        @Query("id") id: String,
        @Query("source") source: String
    ): Response<List<Episode>>

    // ==================== 播放 ====================

    @GET("api/v1/play")
    suspend fun getPlayUrl(
        @Query("id") id: String,
        @Query("source") source: String,
        @Query("episode") episode: Int
    ): Response<PlayUrlResponse>

    // ==================== 站点列表 ====================

    @GET("api/v1/sites")
    suspend fun getSites(): Response<List<ApiSite>>

    // ==================== 服务器配置 ====================

    @GET("api/v1/config")
    suspend fun getServerConfig(): Response<ServerConfig>

    // ==================== 网盘搜索 ====================

    @GET("api/v1/netdisk/search")
    suspend fun netDiskSearch(
        @Query("q") query: String
    ): Response<List<NetDiskItem>>

    // ==================== 测速 ====================

    @POST("api/v1/speedtest")
    suspend fun speedTest(
        @Query("url") url: String
    ): Response<SpeedTestResult>

    // ==================== 视频解析 ====================

    @GET("api/v1/parse")
    suspend fun parseVideo(
        @Query("url") url: String
    ): Response<ParseResult>
}

/**
 * 播放URL响应
 */
data class PlayUrlResponse(
    val url: String = "",
    val headers: Map<String, String>? = null,
    val type: String = "mp4"
)

/**
 * 测速结果
 */
data class SpeedTestResult(
    val url: String = "",
    val latency: Long = 0L,
    val speed: Long = 0L,
    val score: Double = 0.0
)

/**
 * 解析结果
 */
data class ParseResult(
    val url: String = "",
    val title: String = "",
    val type: String = "mp4",
    val headers: Map<String, String>? = null
)
