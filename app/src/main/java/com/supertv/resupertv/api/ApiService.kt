package com.supertv.resupertv.api

import com.supertv.resupertv.model.*
import retrofit2.http.*

interface ApiService {
    @POST("/api/login")
    suspend fun login(@Body body: Map<String, String>): Map<String, Boolean>

    @GET("/api/server-config")
    suspend fun getServerConfig(): Map<String, String>

    @GET("/api/favorites")
    suspend fun getFavorites(@Query("key") key: String? = null): Any

    @POST("/api/favorites")
    suspend fun addFavorite(@Body body: Map<String, Any>): Map<String, Boolean>

    @DELETE("/api/favorites")
    suspend fun deleteFavorite(@Query("key") key: String? = null): Map<String, Boolean>

    @GET("/api/playrecords")
    suspend fun getPlayRecords(): Map<String, Any>

    @POST("/api/playrecords")
    suspend fun savePlayRecord(@Body body: Map<String, Any>): Map<String, Boolean>

    @DELETE("/api/playrecords")
    suspend fun deletePlayRecord(@Query("key") key: String? = null): Map<String, Boolean>

    @GET("/api/search")
    suspend fun searchVideos(@Query("q") query: String): Map<String, Any>

    @GET("/api/search/suggestions")
    suspend fun getSearchSuggestions(@Query("q") query: String): Map<String, List<String>>

    @GET("/api/detail")
    suspend fun getVideoDetail(@Query("source") source: String, @Query("id") id: String): Map<String, Any>
}
