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
import com.supertv.app.utils.SearchUtils
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class SearchViewModel(application: Application) : AndroidViewModel(application) {

    private val store = Store.getInstance(application)
    private val apiService get() = RetrofitClient.getApiService()
    private val repository = SearchRepository()
    private val searchEngine = SearchEngine()
    private val speedTestService = SpeedTestService()

    // 搜索查询
    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    // 搜索结果
    private val _results = MutableStateFlow<List<SearchResult>>(emptyList())
    val results: StateFlow<List<SearchResult>> = _results.asStateFlow()

    // TV 搜索结果（去重处理）
    val tvResults: StateFlow<List<SearchResult>> = _results.map { list ->
        SearchUtils.mergeResults(list)
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
    private val _netDiskResults = MutableStateFlow<Map<String, List<NetDiskItem>>>(emptyMap())
    val netDiskResults: StateFlow<Map<String, List<NetDiskItem>>> = _netDiskResults.asStateFlow()

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

    // 所有来源（全网聚合详情）
    private val _allSources = MutableStateFlow<List<SearchResult>>(emptyList())
    val allSources: StateFlow<List<SearchResult>> = _allSources.asStateFlow()

    private val _allSourcesLoading = MutableStateFlow(false)
    val allSourcesLoading: StateFlow<Boolean> = _allSourcesLoading.asStateFlow()

    // 错误信息
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    // 测速状态
    val isTestingLatency: StateFlow<Boolean> = speedTestService.isTesting
    val latencies: StateFlow<Map<String, Long>> = speedTestService.latencies

    /**
     * 计算源评分 (模仿 supertvold calculateSourceScore)
     */
    private fun calculateSourceScore(result: SearchResult): Double {
        var score = 0.0
        val latency = latencies.value[result.id + result.source] ?: 1000L
        
        // 1. 延迟权重 (40%) - 100ms 以下优秀
        val latencyScore = (1.0 - (latency.toDouble() / 1500.0).coerceIn(0.0, 1.0)) * 40.0
        score += latencyScore
        
        // 2. 剧集完整度 (40%) - 越多越好
        val epScore = (result.episodes.size.toDouble() / 50.0).coerceIn(0.0, 1.0) * 40.0
        score += epScore
        
        // 3. 来源稳定性 (20%) - 这里的 sourceName 简单判断
        if (result.sourceName.contains("官方") || result.sourceName.contains("极速")) {
            score += 20.0
        }
        
        return score
    }

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
                // 1. 尝试精准匹配 (只包含播放源)
                val exactResults = repository.aggressiveSearch(query, onlyExact = true)
                    .filter { it.source != "douban" && it.source != "bangumi" }
                
                if (exactResults.isNotEmpty()) {
                    // 发现精准匹配结果，按要求：只显示精准匹配的结果，不要再去模糊匹配了
                    _results.value = SearchUtils.mergeResults(exactResults)
                } else {
                    // 无精准匹配，才进行激进搜索（模糊匹配/变体搜索）
                    val allResults = repository.aggressiveSearch(query, onlyExact = false)
                    val filtered = allResults.filter { it.source != "douban" && it.source != "bangumi" }
                    _results.value = SearchUtils.mergeResults(filtered)
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

    // 自动跳转详情页事件
    private val _navigateToDetail = MutableSharedFlow<SearchResult>()
    val navigateToDetail: SharedFlow<SearchResult> = _navigateToDetail.asSharedFlow()

    /**
     * 执行搜索
     */
    fun search(query: String) {
        if (query.isBlank()) return
        _query.value = query
        _searchQuery.value = query // 同步更新分页查询
        _isSearching.value = true
        _error.value = null

        viewModelScope.launch {
            try {
                if (_searchMode.value == 0) {
                    // 1. 尝试精准匹配 (只包含播放源)
                    val exactResults = repository.aggressiveSearch(query, onlyExact = true)
                        .filter { it.source != "douban" && it.source != "bangumi" }

                    if (exactResults.isNotEmpty()) {
                        // 发现精准匹配结果，只展示精准匹配的结果
                        _results.value = SearchUtils.mergeResults(exactResults)
                    } else {
                        // 无精准结果，才启动模糊/变体搜索
                        val results = repository.aggressiveSearch(query, onlyExact = false)
                        val filtered = results.filter { it.source != "douban" && it.source != "bangumi" }
                        _results.value = SearchUtils.mergeResults(filtered)
                    }
                } else {
                    performNetDiskSearch(query)
                }
            } catch (e: Exception) {
                android.util.Log.e("SearchViewModel", "Search failed", e)
                _error.value = "搜索异常: ${e.message}"
            } finally {
                _isSearching.value = false
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
                    val body = response.body()
                    if (body?.success == true) {
                        _netDiskResults.value = body.data?.mergedByType ?: emptyMap()
                    } else {
                        _error.value = "网盘搜索失败: ${body?.error ?: "未知错误"}"
                    }
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
    fun loadDetail(id: String, source: String, title: String? = null) {
        viewModelScope.launch {
            _isLoadingDetail.value = true
            _error.value = null
            _allSources.value = emptyList()
            
            try {
                // 1. 加载主详情
                val result = repository.getDetail(id, source)
                _detail.value = result

                // 2. 如果主详情没有剧集（如豆瓣/Bangumi），或者手动触发，搜索全网来源
                val searchTitle = title ?: result?.title
                if (!searchTitle.isNullOrBlank()) {
                    loadAllSources(searchTitle, result?.id, result?.source)
                }
            } catch (e: Exception) {
                android.util.Log.e("SearchViewModel", "Load detail failed", e)
                _error.value = "加载详情失败: ${e.message}"
            } finally {
                _isLoadingDetail.value = false
            }
        }
    }

    /**
     * 加载全网来源
     */
    private fun loadAllSources(title: String, currentId: String?, currentSource: String?) {
        viewModelScope.launch {
            _allSourcesLoading.value = true
            try {
                // 1. 发起原始全网搜索 (模仿 supertvold api.searchVideos)
                val rawResults = repository.searchRaw(title)
                
                // 2. 按来源匹配与合并 (模仿 supertvold matchedResults & 源去重)
                val matchedSources = SearchUtils.mergeResultsBySource(rawResults, title)
                val playbackSources = matchedSources.filter { it.source != "douban" && it.source != "bangumi" }
                
                // 3. 排除当前已有的源
                val filtered = playbackSources.filter { it.id != currentId || it.source != currentSource }
                
                // 4. 按评分排序 (由于此时还没测速，先按集数粗排)
                val initialSorted = filtered.sortedByDescending { it.episodes.size }
                _allSources.value = initialSorted
                
                // 5. 自动合并最佳源 (如果当前是元数据源，或者集数为空)
                val currentDetail = _detail.value
                val isMetadataOnly = currentDetail?.source == "douban" || currentDetail?.source == "bangumi"
                
                if ((currentDetail == null || currentDetail.episodes.isEmpty() || isMetadataOnly) && playbackSources.isNotEmpty()) {
                    // 核心“合并逻辑”：将所有来源的剧集进行对齐合并 (模仿 supertvold)
                    var mergedEpisodes = emptyList<com.supertv.app.model.Episode>()
                    playbackSources.forEach { ps ->
                        mergedEpisodes = SearchUtils.mergeEpisodes(mergedEpisodes, ps.episodes)
                    }

                    // 选择评分最高的源作为主 ID 和 Source
                    val bestSource = playbackSources.maxByOrNull { calculateSourceScore(it) } ?: playbackSources.first()
                    
                    val detail = repository.getDetail(bestSource.id, bestSource.source)
                    if (detail != null) {
                        if (currentDetail != null) {
                            // 保持元数据，合并播放源、ID和剧集
                            _detail.value = currentDetail.copy(
                                id = detail.id,
                                episodesList = if (mergedEpisodes.isNotEmpty()) mergedEpisodes else detail.episodes,
                                source = detail.source,
                                sourceName = detail.sourceName,
                                totalEpisodes = if (mergedEpisodes.isNotEmpty()) mergedEpisodes.size else detail.episodes.size
                            )
                        } else {
                            _detail.value = detail.copy(
                                episodesList = if (mergedEpisodes.isNotEmpty()) mergedEpisodes else detail.episodes
                            )
                        }
                    }
                }

                // 自动测速 (取第一个剧集 URL)
                val testUrls = mutableMapOf<String, String>()
                playbackSources.forEach { res ->
                    if (res.episodes.isNotEmpty()) {
                        testUrls[res.id + res.source] = res.episodes.first().url
                    }
                }
                if (testUrls.isNotEmpty()) {
                    speedTestService.testAll(testUrls)
                    // 测速后重新排序并过滤极慢源 (>10s)
                    _allSources.value = _allSources.value
                        .filter { 
                            val lat = speedTestService.latencies.value[it.id + it.source] ?: 0L
                            lat < 10000L || lat <= 0L // 0L 表示还没测完或刚开始, -1表示不可达
                        }
                        .sortedByDescending { calculateSourceScore(it) }
                }
            } catch (e: Exception) {
                android.util.Log.w("SearchViewModel", "Search all sources failed", e)
            } finally {
                _allSourcesLoading.value = false
            }
        }
    }

    /**
     * 切换播放源
     */
    fun switchSource(result: SearchResult) {
        viewModelScope.launch {
            _isLoadingDetail.value = true
            try {
                val currentDetail = _detail.value
                
                // 优化：如果 SearchResult 中已经包含了剧集信息，直接应用，不再请求详情接口 (提升速度)
                if (result.episodes.isNotEmpty()) {
                    if (currentDetail != null && (currentDetail.source == "douban" || currentDetail.source == "bangumi")) {
                         _detail.value = currentDetail.copy(
                            id = result.id,
                            source = result.source,
                            sourceName = result.sourceName,
                            episodesList = result.episodes,
                            totalEpisodes = result.episodes.size
                        )
                    } else {
                        // 将 SearchResult 转换为 VideoDetail
                        _detail.value = VideoDetail(
                            id = result.id,
                            title = result.title,
                            cover = result.cover,
                            poster = result.poster,
                            source = result.source,
                            sourceName = result.sourceName,
                            episodesList = result.episodes,
                            totalEpisodes = result.episodes.size,
                            year = result.year,
                            rating = result.rating,
                            desc = result.desc
                        )
                    }
                    _isLoadingDetail.value = false
                    android.util.Log.d("SearchViewModel", "Switched source (fast path): ${result.sourceName}")
                    return@launch
                }

                // 如果没有剧集信息，再请求详情
                val detail = repository.getDetail(result.id, result.source)
                if (detail != null) {
                    if (currentDetail != null && (currentDetail.source == "douban" || currentDetail.source == "bangumi")) {
                        // 保持元数据，仅更新播放源、ID和剧集
                        _detail.value = currentDetail.copy(
                            id = detail.id, // 重要：切换到真实播放源的ID
                            source = detail.source,
                            sourceName = detail.sourceName,
                            episodesList = detail.episodes // 使用计算后的 episodes 列表赋值给 episodesList
                        )
                    } else {
                        _detail.value = detail
                    }
                    android.util.Log.d("SearchViewModel", "Switched to source: ${detail.sourceName}, episodes: ${detail.episodes.size}")
                }
            } catch (e: Exception) {
                android.util.Log.e("SearchViewModel", "Switch source failed", e)
                _error.value = "切换源失败"
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
