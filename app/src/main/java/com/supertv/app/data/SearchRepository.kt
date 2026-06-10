package com.supertv.app.data

import com.supertv.app.api.ApiService
import com.supertv.app.model.ApiSite
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
class SearchRepository {

    private fun apiService() = RetrofitClient.getApiService()

    companion object {
        private const val SEARCH_TIMEOUT_MS = 15_000L
        
        // 1. 详情池：存储完整的剧集详情
        private val detailPool = mutableMapOf<String, VideoDetail>()
        
        // 2. 匹配池：存储标题到播放源的映射关系
        private val matchPool = mutableMapOf<String, SearchResult>()

        // 3. 预加载池：存储搜索结果合并后的完整对象，供详情页瞬间调用
        private val preloadPool = mutableMapOf<String, SearchResult>()
        
        fun getFromPool(id: String, source: String): VideoDetail? {
            return detailPool["${source}_$id"]
        }
        
        fun addToPool(detail: VideoDetail) {
            detailPool["${detail.source}_${detail.id}"] = detail
        }

        fun getMatch(title: String): SearchResult? {
            return matchPool[SearchUtils.cleanTitle(title)]
        }

        fun addMatch(title: String, result: SearchResult) {
            matchPool[SearchUtils.cleanTitle(title)] = result
        }

        fun setPreload(result: SearchResult) {
            preloadPool[SearchUtils.cleanTitle(result.title)] = result
        }

        fun getPreload(title: String): SearchResult? {
            return preloadPool[SearchUtils.cleanTitle(title)]
        }
    }

    /**
     * 获取所有可用资源站点 (对齐 supertvold api.getResources)
     */
    suspend fun getSites(): List<ApiSite> {
        return try {
            val response = apiService().getSites()
            if (response.isSuccessful) {
                response.body() ?: emptyList()
            } else emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * 搜索单个源 (对齐 supertvold api.searchVideo)
     */
    suspend fun searchVideo(query: String, sourceId: String): List<SearchResult> {
        val encodedQuery = java.net.URLEncoder.encode(query, "UTF-8")
        return try {
            withTimeout(SEARCH_TIMEOUT_MS) {
                // 假设后端支持 search/one 或者在 search 接口带 source 参数
                val response = apiService().search(encodedQuery, sourceId)
                if (response.isSuccessful) {
                    val body = response.body()
                    body?.results ?: body?.data ?: emptyList()
                } else emptyList()
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * 执行原始搜索（不进行标题合并）
     */
    suspend fun searchRaw(query: String, sources: List<String> = listOf("all")): List<SearchResult> {
        val encodedQuery = java.net.URLEncoder.encode(query, "UTF-8")
        
        // 预定义所有支持的源 (对齐 supertvold 逻辑)
        val allSources = listOf("all") 

        return coroutineScope {
            val deferredList = allSources.map { source ->
                async(Dispatchers.IO) {
                    try {
                        withTimeout(SEARCH_TIMEOUT_MS) {
                            val response = apiService().search(encodedQuery, source)
                            if (response.isSuccessful) {
                                val body = response.body()
                                // 处理不同的 API 返回结构
                                body?.results ?: body?.data ?: emptyList()
                            } else emptyList()
                        }
                    } catch (e: Exception) { 
                        android.util.Log.e("SearchRepository", "Search source $source failed: ${e.message}")
                        emptyList() 
                    }
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
     * 激进搜索：精准匹配 -> 模糊变体匹配
     * @param onlyExact 是否仅执行精准搜索 (精准定义：先去空格，再去符号)
     */
    suspend fun aggressiveSearch(query: String, sources: List<String> = listOf("all"), onlyExact: Boolean = false): List<SearchResult> {
        val cleanedQuery = SearchUtils.cleanTitle(query)
        
        // 1. 第一阶段：尝试物理精准及“包含”匹配 (对齐 supertvold)
        val rawResults = searchRaw(query, sources)
        var results = rawResults.filter { 
            val t = SearchUtils.cleanTitle(it.title)
            t == cleanedQuery || t.contains(cleanedQuery) || cleanedQuery.contains(t)
        }
        
        if (results.isNotEmpty() || onlyExact) {
            return SearchUtils.mergeResults(results)
        }

        // 2. 第二阶段：精准匹配完全失败，执行变体搜索 (对齐 supertvold)
        android.util.Log.d("SearchRepository", "Precise match failed for: $query, starting concurrent fuzzy search")
        
        return coroutineScope {
            val fuzzyTerms = SearchUtils.generateFuzzyTerms(query)
                .filter { it != cleanedQuery }
            
            val deferredVariants = fuzzyTerms.map { term ->
                async(Dispatchers.IO) {
                    try {
                        val vResults = searchRaw(term, sources)
                        vResults.filter { SearchUtils.titleMatches(query, it.title) }
                    } catch (e: Exception) { emptyList() }
                }
            }
            
            val fuzzyResults = deferredVariants.flatMap { it.await() }
            
            // 3. 如果还是没有，尝试更激进的变体
            if (fuzzyResults.isEmpty()) {
                val variants = SearchUtils.generateSearchVariants(query)
                    .filter { it != query && it != cleanedQuery && !fuzzyTerms.contains(it) }
                
                val deferredAggressive = variants.map { term ->
                    async(Dispatchers.IO) {
                        try {
                            searchRaw(term, sources).filter { SearchUtils.titleMatches(query, it.title) }
                        } catch (e: Exception) { emptyList() }
                    }
                }
                SearchUtils.mergeResults(fuzzyResults + deferredAggressive.flatMap { it.await() } + results)
            } else {
                SearchUtils.mergeResults(fuzzyResults + results)
            }
        }
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
            val response = apiService().getSuggestions(query)
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
                    val response = apiService().getDoubanDetail(id)
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
                    val response = apiService().getBangumiDetail("v0/subjects/$id")
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
                    val response = apiService().getDetail(id, source)
                    if (response.isSuccessful) {
                        val detail = response.body()
                        // 如果详情中没有剧集，尝试单独获取剧集列表
                        if (detail != null && detail.episodes.isEmpty()) {
                            try {
                                val epResponse = apiService().getEpisodes(id, source)
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
            val response = apiService().getPlayUrl(id, source, episode)
            if (response.isSuccessful) {
                response.body()?.url
            } else null
        } catch (e: Exception) {
            null
        }
    }
}
