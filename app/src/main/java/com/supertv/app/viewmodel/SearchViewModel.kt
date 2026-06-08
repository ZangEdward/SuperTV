package com.supertv.app.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.supertv.app.api.ApiService
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.SearchRepository
import com.supertv.app.data.Store
import com.supertv.app.model.*
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

    // TV 搜索结果（去重处理）
    val tvResults: StateFlow<List<SearchResult>> = _results.map { list ->
        val map = mutableMapOf<String, SearchResult>()
        list.forEach { item ->
            val key = item.title.replace("\\s+".toRegex(), "")
            val existing = map[key]
            if (existing == null || (item.episodes.size > existing.episodes.size)) {
                map[key] = item
            }
        }
        map.values.toList()
    }.stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

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

    // 网盘搜索结果
    private val _netDiskResults = MutableStateFlow<List<NetDiskItem>>(emptyList())
    val netDiskResults: StateFlow<List<NetDiskItem>> = _netDiskResults.asStateFlow()

    // 搜索建议
    private val _suggestions = MutableStateFlow<List<String>>(emptyList())
    val suggestions: StateFlow<List<String>> = _suggestions.asStateFlow()

    // 搜索历史
    private val _searchHistory = MutableStateFlow<List<String>>(emptyList())
    val searchHistory: StateFlow<List<String>> = _searchHistory.asStateFlow()

    // 搜索状态
    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    private val _searchMode = MutableStateFlow(0) // 0: 聚合, 1: 网盘
    val searchMode: StateFlow<Int> = _searchMode.asStateFlow()

    // 详情
    private val _detail = MutableStateFlow<VideoDetail?>(null)
    val detail: StateFlow<VideoDetail?> = _detail.asStateFlow()

    // 详情加载
    private val _isLoadingDetail = MutableStateFlow(false)
    val isLoadingDetail: StateFlow<Boolean> = _isLoadingDetail.asStateFlow()

    // 错误信息
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        loadSearchHistory()
    }

    fun setSearchMode(mode: Int) {
        _searchMode.value = mode
    }

    /**
     * 执行 TV 搜索
     */
    fun searchTV(query: String) {
        if (query.isBlank()) return
        _query.value = query
        _isSearching.value = true
        _error.value = null
        
        viewModelScope.launch {
            try {
                val response = apiService.search(query)
                if (response.isSuccessful) {
                    _results.value = response.body() ?: emptyList()
                } else {
                    _error.value = "搜索失败: ${response.code()}"
                }
            } catch (e: Exception) {
                android.util.Log.e("SearchViewModel", "searchTV failed", e)
                _error.value = "网络异常: ${e.message}"
            } finally {
                _isSearching.value = false
            }
        }
        
        try {
            store.addSearchHistory(query)
            loadSearchHistory()
        } catch (_: Exception) {}
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

        viewModelScope.launch {
            try {
                if (_searchMode.value == 0) {
                    _searchQuery.value = query
                    // PagingSource handles its own errors, but we can reset isSearching
                    // isSearching is used for Shimmer effect
                } else {
                    performNetDiskSearch(query)
                }
            } catch (e: Exception) {
                android.util.Log.e("SearchViewModel", "Search failed", e)
                _error.value = "搜索异常: ${e.message}"
            } finally {
                if (_searchMode.value != 0) { // Paging results are handled by pagingItems.loadState
                   _isSearching.value = false
                }
            }
        }

        // 保存搜索历史
        try {
            store.addSearchHistory(query)
            loadSearchHistory()
        } catch (_: Exception) {}
    }

    private fun performNetDiskSearch(query: String) {
        viewModelScope.launch {
            try {
                val response = apiService.netDiskSearch(query)
                if (response.isSuccessful) {
                    _netDiskResults.value = response.body() ?: emptyList()
                } else {
                    _error.value = "网盘搜索失败: ${response.code()}"
                }
            } catch (e: Exception) {
                android.util.Log.e("SearchViewModel", "Netdisk search error", e)
                _error.value = "网盘搜索异常: ${e.message}"
            } finally {
                _isSearching.value = false
            }
        }
    }

    /**
     * 加载搜索建议
     */
    private fun loadSuggestions(query: String) {
        viewModelScope.launch {
            try {
                val result = searchEngine.getSuggestions(query)
                _suggestions.value = result
            } catch (e: Exception) {
                android.util.Log.w("SearchViewModel", "Suggestions failed", e)
            }
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
                // 确保 ApiService 已初始化
                RetrofitClient.getApiService()
                val result = repository.getDetail(id, source)
                _detail.value = result
            } catch (e: Exception) {
                android.util.Log.e("SearchViewModel", "Load detail failed", e)
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
