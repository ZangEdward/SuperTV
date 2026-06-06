package com.supertv.resupertv.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.supertv.resupertv.api.ApiService
import com.supertv.resupertv.data.RetrofitClient
import com.supertv.resupertv.data.SearchRepository
import com.supertv.resupertv.data.Store
import com.supertv.resupertv.model.SearchResult
import com.supertv.resupertv.model.VideoDetail
import com.supertv.resupertv.services.SearchEngine
import com.supertv.resupertv.services.SpeedTestService
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * 搜索 ViewModel - 对应原项目的 searchStore.ts + detailStore.ts
 *
 * 管理搜索状态、搜索历史、搜索结果、详情等
 */
class SearchViewModel(application: Application) : AndroidViewModel(application) {

    private val store = Store.getInstance(application)
    private val apiService = RetrofitClient.getApiService()
    private val repository = SearchRepository(apiService)
    private val searchEngine = SearchEngine(apiService)
    private val speedTestService = SpeedTestService()

    // 搜索查询
    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    // 搜索结果
    private val _results = MutableStateFlow<List<SearchResult>>(emptyList())
    val results: StateFlow<List<SearchResult>> = _results.asStateFlow()

    // 搜索建议
    private val _suggestions = MutableStateFlow<List<String>>(emptyList())
    val suggestions: StateFlow<List<String>> = _suggestions.asStateFlow()

    // 搜索历史
    private val _searchHistory = MutableStateFlow<List<String>>(emptyList())
    val searchHistory: StateFlow<List<String>> = _searchHistory.asStateFlow()

    // 搜索状态
    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    // 详情
    private val _detail = MutableStateFlow<VideoDetail?>(null)
    val detail: StateFlow<VideoDetail?> = _detail.asStateFlow()

    // 详情加载中
    private val _isLoadingDetail = MutableStateFlow(false)
    val isLoadingDetail: StateFlow<Boolean> = _isLoadingDetail.asStateFlow()

    // 错误信息
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        loadSearchHistory()
    }

    /**
     * 更新搜索查询
     */
    fun updateQuery(query: String) {
        _query.value = query
        if (query.isNotBlank()) {
            loadSuggestions(query)
        } else {
            _suggestions.value = emptyList()
        }
    }

    /**
     * 执行搜索
     */
    fun search(query: String) {
        if (query.isBlank()) return
        _query.value = query
        _isSearching.value = true
        _error.value = null

        // 保存搜索历史
        store.addSearchHistory(query)
        loadSearchHistory()

        viewModelScope.launch {
            searchEngine.search(query)
        }
    }

    /**
     * 加载搜索建议
     */
    private fun loadSuggestions(query: String) {
        viewModelScope.launch {
            val result = searchEngine.getSuggestions(query)
            _suggestions.value = result
        }
    }

    /**
     * 加载搜索历史
     */
    private fun loadSearchHistory() {
        _searchHistory.value = store.getSearchHistory()
    }

    /**
     * 清除搜索历史
     */
    fun clearSearchHistory() {
        store.clearSearchHistory()
        _searchHistory.value = emptyList()
    }

    /**
     * 获取视频详情
     */
    fun loadDetail(id: String, source: String) {
        viewModelScope.launch {
            _isLoadingDetail.value = true
            _error.value = null
            try {
                val result = repository.getDetail(id, source)
                _detail.value = result
            } catch (e: Exception) {
                _error.value = "加载详情失败: ${e.message}"
            } finally {
                _isLoadingDetail.value = false
            }
        }
    }

    /**
     * 测速节点
     */
    fun testLatency(urls: Map<String, String>) {
        viewModelScope.launch {
            speedTestService.testAll(urls)
        }
    }

    /**
     * 获取最佳节点
     */
    fun getBestNode(): String? = speedTestService.getBestNode()

    /**
     * 清除搜索结果
     */
    fun clearResults() {
        _results.value = emptyList()
        _query.value = ""
        _error.value = null
    }

    override fun onCleared() {
        super.onCleared()
        searchEngine.destroy()
        speedTestService.destroy()
    }
}
