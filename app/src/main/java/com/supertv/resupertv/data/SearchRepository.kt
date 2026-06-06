package com.supertv.resupertv.data

import com.supertv.resupertv.api.ApiService
import com.supertv.resupertv.model.SearchResult
import com.supertv.resupertv.model.VideoDetail
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeout

/**
 * 搜索仓库 - 对应原项目的 services/api.ts 搜索相关逻辑
 *
 * 封装搜索业务逻辑，支持多源并发搜索
 */
class SearchRepository(private val apiService: ApiService) {

    companion object {
        private const val SEARCH_TIMEOUT_MS = 15_000L
    }

    /**
     * 执行搜索，支持多源并发
     */
    suspend fun search(query: String, sources: List<String> = listOf("all")): List<SearchResult> {
        return coroutineScope {
            val deferredList = sources.map { source ->
                async(Dispatchers.IO) {
                    try {
                        withTimeout(SEARCH_TIMEOUT_MS) {
                            val response = apiService.search(query, source)
                            if (response.isSuccessful) {
                                response.body() ?: emptyList()
                            } else emptyList()
                        }
                    } catch (e: Exception) {
                        emptyList()
                    }
                }
            }
            deferredList.flatMap { it.await() }
                .distinctBy { it.id }
                .sortedByDescending { it.year }
        }
    }

    /**
     * 获取搜索建议
     */
    suspend fun getSuggestions(query: String): List<String> {
        return try {
            val response = apiService.getSuggestions(query)
            if (response.isSuccessful) {
                response.body()?.take(9) ?: emptyList()
            } else emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * 获取视频详情
     */
    suspend fun getDetail(id: String, source: String): VideoDetail? {
        return try {
            val response = apiService.getDetail(id, source)
            if (response.isSuccessful) {
                response.body()
            } else null
        } catch (e: Exception) {
            null
        }
    }

    /**
     * 获取播放URL
     */
    suspend fun getPlayUrl(id: String, source: String, episode: Int): String? {
        return try {
            val response = apiService.getPlayUrl(id, source, episode)
            if (response.isSuccessful) {
                response.body()?.url
            } else null
        } catch (e: Exception) {
            null
        }
    }
}
