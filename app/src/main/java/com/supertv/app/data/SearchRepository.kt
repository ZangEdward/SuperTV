package com.supertv.app.data

import com.supertv.app.api.ApiService
import com.supertv.app.model.SearchResult
import com.supertv.app.model.VideoDetail
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeout

/**
 * 搜索仓库 - 对应原项目的 services/api.ts 搜索相关逻辑
 *
 * 封装搜索业务逻辑，支持多源并发搜�?
 */
class SearchRepository(private val apiService: ApiService) {

    companion object {
        private const val SEARCH_TIMEOUT_MS = 15_000L
    }

    /**
     * 执行搜索，支持多源并�?
     */
    suspend fun search(query: String, sources: List<String> = listOf("all")): List<SearchResult> {
        return coroutineScope {
            val deferredList = sources.map { source ->
                async(Dispatchers.IO) {
                    try {
                        withTimeout(SEARCH_TIMEOUT_MS) {
                            val response = apiService.search(query, source)
                            if (response.isSuccessful) {
                                val body = response.body()
                                body?.results ?: body?.data ?: emptyList()
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
     * 去尾搜索匹配 �?�?"abcd" 无结果则尝试 "abc"�?ab"
     */
    suspend fun searchWithTailTrim(query: String, sources: List<String> = listOf("all")): List<SearchResult> {
        if (query.length <= 1) return emptyList()

        var results = search(query, sources)
        var trimmed = query

        // 逐位去尾重试，直到有结果或只�?个字
        while (results.isEmpty() && trimmed.length > 1) {
            trimmed = trimmed.dropLast(1)
            if (trimmed.length >= 1) {
                results = search(trimmed, sources)
            }
        }
        return results
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
                val detail = response.body()
                // 如果详情中没有剧集，尝试单独获取剧集列表
                if (detail != null && detail.episodes.isEmpty()) {
                    try {
                        val epResponse = apiService.getEpisodes(id, source)
                        if (epResponse.isSuccessful) {
                            val episodes = epResponse.body() ?: emptyList()
                            return detail.copy(episodes = episodes)
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("SearchRepository", "Failed to load episodes separately", e)
                    }
                }
                detail
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
