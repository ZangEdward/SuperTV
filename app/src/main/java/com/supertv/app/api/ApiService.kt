package com.supertv.app.api

import com.supertv.app.model.*
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

/**
 * API接口定义 - 对应原项目的 services/api.ts
 */
interface ApiService {

    // ==================== 首页/豆瓣 ====================

    @GET("api/douban/hot")
    suspend fun getDoubanHot(): Response<DoubanResponse>

    @GET("api/douban/recommend")
    suspend fun getDoubanRecommend(): Response<DoubanResponse>

    @GET("api/douban/new")
    suspend fun getDoubanNew(): Response<DoubanResponse>

    @GET("api/douban/category")
    suspend fun getDoubanCategory(
        @Query("type") type: String,
        @Query("page") page: Int = 1
    ): Response<DoubanResponse>

    // ==================== 搜索 ====================

    @GET("api/search")
    suspend fun search(
        @Query("q") query: String,
        @Query("source") source: String = "all",
        @Query("page") page: Int = 1
    ): Response<List<SearchResult>>

    @GET("api/search/suggest")
    suspend fun getSuggestions(
        @Query("q") query: String
    ): Response<List<String>>

    // ==================== 详情 ====================

    @GET("api/detail")
    suspend fun getDetail(
        @Query("id") id: String,
        @Query("source") source: String
    ): Response<VideoDetail>

    // ==================== 剧集列表 ====================

    @GET("api/episodes")
    suspend fun getEpisodes(
        @Query("id") id: String,
        @Query("source") source: String
    ): Response<List<Episode>>

    // ==================== 播放 ====================

    @GET("api/play")
    suspend fun getPlayUrl(
        @Query("id") id: String,
        @Query("source") source: String,
        @Query("episode") episode: Int
    ): Response<PlayUrlResponse>

    // ==================== 站点列表 ====================

    @GET("api/sites")
    suspend fun getSites(): Response<List<ApiSite>>

    // ==================== 服务器配?====================

    @GET("api/config")
    suspend fun getServerConfig(): Response<ServerConfig>

    // ==================== 网盘搜索 ====================

    @GET("api/netdisk/search")
    suspend fun netDiskSearch(
        @Query("q") query: String
    ): Response<List<NetDiskItem>>

    // ==================== 测?====================

    @POST("api/speedtest")
    suspend fun speedTest(
        @Query("url") url: String
    ): Response<SpeedTestResult>

    // ==================== 视频解析 ====================

    @GET("api/parse")
    suspend fun parseVideo(
        @Query("url") url: String
    ): Response<ParseResult>

    // ==================== 认证 ====================

    @POST("api/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<LoginResponse>

    @GET("api/logout")
    suspend fun logout(): Response<Map<String, Any>>

    // ==================== 同步 ====================

    @GET("api/favorites")
    suspend fun getFavorites(): Response<List<Favorite>>

    @POST("api/favorites/add")
    suspend fun addFavorite(
        @Query("source") source: String,
        @Query("id") id: String,
        @Query("data") data: String
    ): Response<Map<String, Any>>

    @POST("api/favorites/remove")
    suspend fun removeFavorite(
        @Query("source") source: String,
        @Query("id") id: String
    ): Response<Map<String, Any>>

    @GET("api/playrecords")
    suspend fun getPlayRecords(): Response<List<PlayRecord>>

    @POST("api/playrecords/save")
    suspend fun savePlayRecord(
        @Query("data") data: String
    ): Response<Map<String, Any>>

    @GET("api/searchhistory")
    suspend fun getSearchHistory(): Response<List<String>>

    @POST("api/searchhistory/add")
    suspend fun addSearchHistory(
        @Query("keyword") keyword: String
    ): Response<Map<String, Any>>

    @POST("api/searchhistory/clear")
    suspend fun clearSearchHistory(): Response<Map<String, Any>>

    // ==================== LunaTV 增强功能 ====================

    @GET("api/shortdrama/hot")
    suspend fun getShortDramaHot(
        @Query("page") page: Int = 1
    ): Response<DoubanResponse>

    @GET("api/ai/recommend")
    suspend fun getAIRecommend(
        @Query("context") context: String = ""
    ): Response<AIRecommendResponse>

    @GET("api/calendar/release")
    suspend fun getReleaseCalendar(): Response<ReleaseCalendarResponse>
}

data class LoginRequest(
    val username: String,
    val password: String
)

data class LoginResponse(
    val ok: Boolean = false,
    val success: Boolean = false, // 兼容性保留
    val error: String = "",
    val message: String = "", // 兼容性保留
    val token: String = "",
    val user: UserInfo? = null
)

data class UserInfo(
    val username: String = "",
    val nickname: String = "",
    val avatar: String = ""
)

/**
 * 播放URL响应
 */
data class PlayUrlResponse(
    val url: String = "",
    val headers: Map<String, String>? = null,
    val type: String = "mp4"
)

/**
 * 测速结?
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
