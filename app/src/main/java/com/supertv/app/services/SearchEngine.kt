package com.supertv.app.services

import com.supertv.app.api.ApiService
import com.supertv.app.data.SearchRepository
import com.supertv.app.model.SearchResult
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * 搜索引擎 - 对应原项目的搜索模块
 *
 * 支持多源并发搜索、渐进式加载、拼音匹配、去尾搜索
 */
class SearchEngine(private val apiService: ApiService) {

    private val repository = SearchRepository(apiService)

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _searchResults = MutableStateFlow<List<SearchResult>>(emptyList())
    val searchResults: StateFlow<List<SearchResult>> = _searchResults.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    private val _progress = MutableStateFlow(0f)
    val progress: StateFlow<Float> = _progress.asStateFlow()

    private val _statusMessage = MutableStateFlow("")
    val statusMessage: StateFlow<String> = _statusMessage.asStateFlow()

    private var searchJob: Job? = null

    /**
     * 执行并发搜索
     */
    fun search(query: String, sources: List<String> = listOf("all")) {
        searchJob?.cancel()
        searchJob = scope.launch {
            _isSearching.value = true
            _searchResults.value = emptyList()
            _progress.value = 0f
            _statusMessage.value = "正在搜索..."

            val allResults = mutableListOf<SearchResult>()
            val totalSources = sources.size

            sources.forEachIndexed { index, source ->
                _statusMessage.value = "正在检索: $source ($index/$totalSources)"
                _progress.value = (index.toFloat() / totalSources)

                try {
                    val response = withTimeout(10_000L) {
                        apiService.search(query, source)
                    }
                    if (response.isSuccessful) {
                        val body = response.body()
                        val results = body?.results ?: body?.data ?: emptyList<SearchResult>()
                        allResults.addAll(results)
                        _searchResults.value = allResults.distinctBy { it.id }
                    }
                } catch (e: Exception) {
                    // 单个源超时或失败，继续下一个
                }
            }

            _progress.value = 1f
            _statusMessage.value = ""
            _isSearching.value = false
        }
    }

    /**
     * 去尾搜索匹配 - 如 "abcd" 无结果则自动尝试 "abc"、"ab"
     */
    suspend fun searchWithTailTrim(query: String, sources: List<String> = listOf("all")): List<SearchResult> {
        return repository.searchWithTailTrim(query, sources)
    }

    /**
     * 获取搜索建议 (拼音首字母匹配 -> 后端验证 -> 去重 -> 限制9条)
     */
    suspend fun getSuggestions(query: String): List<String> {
        if (query.isBlank()) return emptyList()
        return try {
            val response = apiService.getSuggestions(query)
            if (response.isSuccessful) {
                response.body()?.distinct()?.take(9) ?: emptyList<String>()
            } else emptyList<String>()
        } catch (e: Exception) {
            emptyList<String>()
        }
    }

    /**
     * 取消搜索
     */
    fun cancelSearch() {
        searchJob?.cancel()
        _isSearching.value = false
        _progress.value = 0f
        _statusMessage.value = ""
    }

    fun destroy() {
        cancelSearch()
        scope.cancel()
    }
}
