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

    // 搜索进度 (对齐 supertvold searchProgress)
    private val _searchProgress = MutableStateFlow(0f)
    val searchProgress: StateFlow<Float> = _searchProgress.asStateFlow()

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
     * 获取视频详情 - 对齐 supertvold 加载顺序
     */
    fun loadDetail(id: String, source: String, title: String? = null) {
        viewModelScope.launch {
            _isLoadingDetail.value = true
            _error.value = null
            _allSources.value = emptyList()
            _searchProgress.value = 0f
            
            // 1. [秒开优化]：优先从内存详情池或匹配池获取，解决“为何还要再匹配一次”的问题
            val searchTitle = title ?: ""
            var actualId = id
            var actualSource = source

            if (source == "douban" || source == "bangumi") {
                val matched = SearchRepository.getMatch(searchTitle)
                if (matched != null) {
                    actualId = matched.id
                    actualSource = matched.source
                    android.util.Log.d("SearchViewModel", "[MATCH POOL] Found playable source for $searchTitle -> $actualSource")
                }
            }

            val pooled = SearchRepository.getFromPool(actualId, actualSource)
            if (pooled != null) {
                _detail.value = pooled
                _isLoadingDetail.value = false
                android.util.Log.d("SearchViewModel", "[POOL] Cache hit for $searchTitle")
                
                // 仍需异步刷新全网来源（不阻塞）
                loadAllSources(searchTitle.ifBlank { pooled.title }, actualId, actualSource)
                return@launch
            }

            try {
                // [资料源识别]
                val isMetadataSource = actualSource == "douban" || actualSource == "bangumi"
                
                if (!isMetadataSource && actualId.isNotBlank() && actualId != "0") {
                    // [路径 A]：有确定的视频源，优先加载
                    val result = repository.getDetail(actualId, actualSource)
                    if (result != null) {
                        _detail.value = result
                        SearchRepository.addToPool(result)
                        _isLoadingDetail.value = false // 立即展示首选源
                        
                        // 后台异步加载其他换源（不阻塞当前展示）
                        launch {
                            loadAllSources(searchTitle.ifBlank { result.title }, actualId, actualSource)
                        }
                    } else {
                        // 首选源加载失败，走全网探测
                        loadAllSources(searchTitle, null, actualSource)
                    }
                } else {
                    // [路径 B]：纯资料源，直接全网激进探测
                    if (searchTitle.isNotBlank()) {
                        loadAllSources(searchTitle, null, actualSource)
                    } else {
                        _error.value = "标题不能为空"
                        _isLoadingDetail.value = false
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("SearchViewModel", "Load detail failed", e)
                _error.value = "加载详情失败: ${e.message}"
                _isLoadingDetail.value = false
            }
        }
    }

    /**
     * 加载全网来源 - 对齐 supertvold 激进全网并发加载逻辑
     */
    private fun loadAllSources(title: String, currentId: String?, currentSource: String?) {
        viewModelScope.launch {
            _allSourcesLoading.value = true
            _searchProgress.value = 0.1f
            
            try {
                // 1. 获取所有可用站点
                val sites: List<ApiSite> = repository.getSites().filter { it.key != "douban" && it.key != "bangumi" }
                if (sites.isEmpty()) {
                    _allSourcesLoading.value = false
                    return@launch
                }

                val totalSites = sites.size
                var completedSites = 0
                val allMatchedResults = java.util.concurrent.CopyOnWriteArrayList<SearchResult>()

                // 2. [极致并发]：同时启动所有源的检索
                sites.forEach { site ->
                    launch {
                        try {
                            // 使用 repository.searchVideo 搜索特定源
                            val results = repository.searchVideo(title, site.key)
                            
                            // 使用 titleMatches 增强匹配 (对齐 supertvold)
                            val matched = results.filter { 
                                SearchUtils.titleMatches(title, it.title) 
                            }
                            
                            allMatchedResults.addAll(matched)
                        } catch (_: Exception) {
                        } finally {
                            completedSites++
                            _searchProgress.value = 0.1f + (completedSites.toFloat() / totalSites) * 0.8f
                        }
                    }
                }

                // 3. 等待过程中的“首次合并”优化 (Path B 逻辑)
                // 模仿 supertvold: 只要有结果且当前是资料源，就尝试更新 detail
                while (completedSites < totalSites && _allSourcesLoading.value) {
                    kotlinx.coroutines.delay(500)
                    if (allMatchedResults.isNotEmpty()) {
                        val currentDetail = _detail.value
                        if (currentDetail == null || currentDetail.source in listOf("douban", "bangumi")) {
                            updateFromMatchedResults(allMatchedResults.toList(), title)
                        }
                    }
                }

                // 4. 最终展示与排序
                val finalPlaybackSources = SearchUtils.mergeResultsBySource(allMatchedResults.toList(), title)
                    .filter { it.id != currentId || it.source != currentSource }
                    .sortedByDescending { it.episodes.size }
                
                _allSources.value = finalPlaybackSources
                _searchProgress.value = 1.0f
                
                // 确保至少更新一次详情（如果需要）
                updateFromMatchedResults(allMatchedResults.toList(), title)

                // 5. 后台自动测速与重排
                autoTestAndResort()

            } catch (e: Exception) {
                android.util.Log.w("SearchViewModel", "Search all sources failed", e)
            } finally {
                _allSourcesLoading.value = false
                _isLoadingDetail.value = false
            }
        }
    }

    private fun updateFromMatchedResults(allResults: List<SearchResult>, title: String) {
        val playbackSources = SearchUtils.mergeResultsBySource(allResults, title)
        if (playbackSources.isEmpty()) return

        val currentDetail = _detail.value
        val isMetadataOnly = currentDetail?.source == "douban" || currentDetail?.source == "bangumi"

        if (currentDetail == null || currentDetail.episodes.isEmpty() || isMetadataOnly) {
            // 选择评分最高（目前暂无测速则按集数）的源
            val bestSource = playbackSources.maxByOrNull { it.episodes.size } ?: playbackSources.first()
            
            viewModelScope.launch {
                val detail = repository.getDetail(bestSource.id, bestSource.source)
                if (detail != null) {
                    // 合并所有剧集（解决缺集问题）
                    var mergedEpisodes = detail.episodes
                    playbackSources.forEach { ps ->
                        mergedEpisodes = SearchUtils.mergeEpisodes(mergedEpisodes, ps.episodes)
                    }

                    if (currentDetail != null && isMetadataOnly) {
                        _detail.value = currentDetail.copy(
                            id = detail.id,
                            episodesList = mergedEpisodes,
                            source = detail.source,
                            sourceName = detail.sourceName,
                            totalEpisodes = mergedEpisodes.size
                        )
                    } else if (currentDetail == null) {
                        _detail.value = detail.copy(episodesList = mergedEpisodes)
                    }
                }
            }
        }
    }

    private fun autoTestAndResort() {
        val testUrls = mutableMapOf<String, String>()
        _allSources.value.forEach { res ->
            if (res.episodes.isNotEmpty()) {
                testUrls[res.id + res.source] = res.episodes.first().url
            }
        }
        if (testUrls.isNotEmpty()) {
            viewModelScope.launch {
                speedTestService.testAll(testUrls)
                _allSources.value = _allSources.value
                    .filter { 
                        val lat = speedTestService.latencies.value[it.id + it.source] ?: 0L
                        lat < 10000L || lat <= 0L
                    }
                    .sortedByDescending { calculateSourceScore(it) }
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
