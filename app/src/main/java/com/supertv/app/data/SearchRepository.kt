package com.supertv.app.data

import com.supertv.app.api.ApiService
import com.supertv.app.model.SearchResult
import com.supertv.app.model.VideoDetail
import com.supertv.app.utils.SearchUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeout

/**
 * 搜索仓库 - 对应原项目的 services/api.ts 搜索相关逻辑
 */
class SearchRepository(private val apiService: ApiService) {

    companion object {
        private const val SEARCH_TIMEOUT_MS = 15_000L
    }

    /**
     * 执行原始搜索（不进行标题合并）
     */
    suspend fun searchRaw(query: String, sources: List<String> = listOf("all")): List<SearchResult> {
        val encodedQuery = java.net.URLEncoder.encode(query, "UTF-8")
        return coroutineScope {
            val deferredList = sources.map { source ->
                async(Dispatchers.IO) {
                    try {
                        withTimeout(SEARCH_TIMEOUT_MS) {
                            val response = apiService.search(encodedQuery, source)
                            if (response.isSuccessful) {
                                val body = response.body()
                                body?.results ?: body?.data ?: emptyList()
                            } else emptyList()
                        }
                    } catch (e: Exception) { emptyList() }
                }
            }
            deferredList.flatMap { it.await() }
        }
    }

    /**
     * 执行搜索，并按标题合并去重
     */
    suspend fun search(query: String, sources: List<String> = listOf("all")): List<SearchResult> {
        val allResults = searchRaw(query, sources)
        val merged = SearchUtils.mergeResults(allResults)
        android.util.Log.d("SearchRepository", "Total merged results: ${merged.size}")
        return merged
    }

    /**
     * 激进搜索：精准匹配 -> 去尾搜索
     * @param onlyExact 是否仅执行精准搜索 (精准定义：先去空格，再去符号)
     */
    suspend fun aggressiveSearch(query: String, sources: List<String> = listOf("all"), onlyExact: Boolean = false): List<SearchResult> {
        val cleanedQuery = SearchUtils.cleanTitle(query)
        
        // 1. 精准搜索：尝试匹配标题 (清洗逻辑：先去空格，再去符号)
        val rawResults = search(query, sources)
        var results = rawResults.filter { SearchUtils.cleanTitle(it.title) == cleanedQuery }
        
        // 如果原始查询没搜到精准匹配，尝试用清洗后的词去搜（增加精准命中率）
        if (results.isEmpty()) {
            val variants = listOf(query.replace("\\s+".toRegex(), ""), cleanedQuery).distinct()
            for (v in variants) {
                if (v == query) continue
                val vResults = search(v, sources).filter { SearchUtils.cleanTitle(it.title) == cleanedQuery }
                if (vResults.isNotEmpty()) {
                    results = vResults
                    break
                }
            }
        }

        if (onlyExact) return results

        // 2. 如果无精准结果且不限制精准匹配，返回原始搜索结果并尝试变体搜索
        if (results.isEmpty()) {
            results = rawResults
            if (results.isEmpty()) {
                val variants = SearchUtils.generateSearchVariants(query)
                android.util.Log.d("SearchRepository", "No results for exact match, trying variants: $variants")
                for (term in variants) {
                    if (term == query) continue
                    results = search(term, sources)
                    if (results.isNotEmpty()) {
                        android.util.Log.d("SearchRepository", "Found results with variant: $term")
                        break
                    }
                }
            }
        }

        return results
    }

    /**
     * 去尾搜索匹配 (别名，用于兼容旧代码)
     */
    suspend fun searchWithTailTrim(query: String, sources: List<String> = listOf("all")): List<SearchResult> {
        return aggressiveSearch(query, sources)
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
            when (source) {
                "douban" -> {
                    val response = apiService.getDoubanDetail(id)
                    if (response.isSuccessful) {
                        val data = response.body()?.data
                        data?.let {
                            VideoDetail(
                                id = it.id,
                                title = it.title,
                                cover = it.backdrop ?: it.poster,
                                poster = it.poster,
                                desc = it.plotSummary,
                                year = it.year,
                                director = it.directors.joinToString(", "),
                                actor = it.cast.joinToString(", "),
                                source = "douban",
                                sourceName = "豆瓣",
                                totalEpisodes = it.episodes ?: 0
                            )
                        }
                    } else null
                }
                "bangumi" -> {
                    val response = apiService.getBangumiDetail("v0/subjects/$id")
                    if (response.isSuccessful) {
                        val item = response.body()
                        item?.let {
                            VideoDetail(
                                id = it.id.toString(),
                                title = it.nameCn.ifBlank { it.name },
                                cover = it.images?.large ?: "",
                                poster = it.images?.common ?: "",
                                desc = it.summary,
                                source = "bangumi",
                                sourceName = "Bangumi",
                                rating = it.rating?.score?.toString() ?: ""
                            )
                        }
                    } else null
                }
                else -> {
                    val response = apiService.getDetail(id, source)
                    if (response.isSuccessful) {
                        val detail = response.body()
                        // 如果详情中没有剧集，尝试单独获取剧集列表
                        if (detail != null && detail.episodes.isEmpty()) {
                            try {
                                val epResponse = apiService.getEpisodes(id, source)
                                if (epResponse.isSuccessful) {
                                    val episodes = epResponse.body() ?: emptyList()
                                    return detail.copy(episodesList = episodes)
                                }
                            } catch (e: Exception) {
                                android.util.Log.e("SearchRepository", "Failed to load episodes separately", e)
                            }
                        }
                        detail
                    } else null
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("SearchRepository", "getDetail failed", e)
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
