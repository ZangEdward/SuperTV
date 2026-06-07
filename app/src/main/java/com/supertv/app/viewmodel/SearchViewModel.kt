package com.supertv.app.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.supertv.app.api.ApiService
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.SearchRepository
import com.supertv.app.data.Store
import com.supertv.app.model.SearchResult
import com.supertv.app.model.VideoDetail
import com.supertv.app.services.SearchEngine
import com.supertv.app.services.SpeedTestService
import androidx.paging.Pager
import androidx.paging.PagingConfig
import androidx.paging.PagingData
import androidx.paging.cachedIn
import com.supertv.app.data.SearchPagingSource
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
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

    // Paging 3 搜索结果
    private val _searchQuery = MutableStateFlow("")
    val searchPagingData: Flow<PagingData<SearchResult>> = _searchQuery
        .filter { it.isNotBlank() }
        .flatMapLatest { query ->
            Pager(
                config = PagingConfig(pageSize = 20, enablePlaceholders = false),
                pagingSourceFactory = { SearchPagingSource(apiService, query) }
            ).flow.cachedIn(viewModelScope)
        }

    // 搜索建议
    private val _suggestions = MutableStateFlow<List<String>>(emptyList())
    val suggestions: StateFlow<List<String>> = _suggestions.asStateFlow()

    // 搜索历史
    private val _searchHistory = MutableStateFlow<List<String>>(emptyList())
    val searchHistory: StateFlow<List<String>> = _searchHistory.asStateFlow()

    // 搜索状�?
    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    // 详情
    private val _detail = MutableStateFlow<VideoDetail?>(null)
    val detail: StateFlow<VideoDetail?> = _detail.asStateFlow()

    // 详情加载�?
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
        _searchQuery.value = query
        _isSearching.value = true
        _error.value = null

        // 保存搜索历史
        store.addSearchHistory(query)
        loadSearchHistory()
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
     * 测速节�?
     */
    fun testLatency(urls: Map<String, String>) {
        viewModelScope.launch {
            speedTestService.testAll(urls)
        }
    }

    /**
     * 获取最佳节�?
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
