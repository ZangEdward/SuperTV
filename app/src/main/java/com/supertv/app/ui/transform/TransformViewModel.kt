package com.supertv.app.ui.transform

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.Store
import com.supertv.app.model.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

class TransformViewModel(application: Application) : AndroidViewModel(application) {

    private val store = Store.getInstance(application)
    private val apiService get() = RetrofitClient.getApiService()

    private val _playRecords = MutableStateFlow<List<PlayRecord>>(emptyList<PlayRecord>())
    val playRecords: StateFlow<List<PlayRecord>> = _playRecords.asStateFlow()

    private val _hotMovies = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val hotMovies: StateFlow<List<SearchResult>> = _hotMovies.asStateFlow()

    private val _recommended = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val recommended: StateFlow<List<SearchResult>> = _recommended.asStateFlow()

    private val _animeUpdates = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val animeUpdates: StateFlow<List<SearchResult>> = _animeUpdates.asStateFlow()

    private val _animeCalendar = MutableStateFlow<Map<Int, List<SearchResult>>>(emptyMap())
    val animeCalendar: StateFlow<Map<Int, List<SearchResult>>> = _animeCalendar.asStateFlow()

    private val _shortDramas = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val shortDramas: StateFlow<List<SearchResult>> = _shortDramas.asStateFlow()

    private val _selectedCategory = MutableStateFlow("热门")
    val selectedCategory: StateFlow<String> = _selectedCategory.asStateFlow()

    private val _selectedSubCategory = MutableStateFlow("全部")
    val selectedSubCategory: StateFlow<String> = _selectedSubCategory.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        loadData()
    }

    fun selectWeekday(day: Int) {
        _animeUpdates.value = _animeCalendar.value[day] ?: emptyList()
    }

    fun selectCategory(category: String) {
        if (_selectedCategory.value != category) {
            _selectedCategory.value = category
            _selectedSubCategory.value = if (category == "短剧") "热门" else "全部"
            loadData()
        }
    }

    fun selectSubCategory(subCategory: String) {
        if (_selectedSubCategory.value != subCategory) {
            _selectedSubCategory.value = subCategory
            loadData()
        }
    }

    private fun loadData() {
        val category = _selectedCategory.value
        val subCategory = _selectedSubCategory.value
        val cacheKey = if (subCategory == "全部") category else "${category}_${subCategory}"
        
        // 1. 先从内存/磁盘缓存恢复数据，实现“秒开”
        val cached = store.getCategoryCache(cacheKey)
        if (cached.isNotEmpty()) {
            updateCategoryFlow(category, cached)
        }

        viewModelScope.launch {
            // 2. 如果缓存为空，才显示 Loading 状态
            if (cached.isEmpty()) {
                _isLoading.value = true
            }

            try {
                if (category == "热门") {
                    loadHomeData()
                } else {
                    loadCategoryData(category)
                }
            } catch (e: Exception) {
                android.util.Log.e("TransformViewModel", "Error in loadData for $category", e)
            } finally {
                _isLoading.value = false
            }
        }
    }

    private suspend fun loadHomeData() = coroutineScope {
        val repository = com.supertv.app.data.SearchRepository()

        // 1. 并发抓取各板块 Metadata (快)
        val jobs = listOf(
            launch { fetchHotMovies() },
            launch { fetchRecommended() },
            launch { fetchAnimeUpdates() },
            launch { fetchShortDramas() }
        )
        
        // 等待 Metadata 抓取完成即可，这样 loadData 就能结束 isLoading 状态
        jobs.forEach { it.join() }
        
        // 2. 匹配播放源逻辑移到后台，不阻塞 loadHomeData 的返回
        // 已经在各 fetch 方法内部通过 viewModelScope.launch 处理了
    }

    private suspend fun fetchHotMovies() {
        try {
            val tag = java.net.URLEncoder.encode("热门", "UTF-8")
            val resp = apiService.getDoubanData("movie", tag)
            if (resp.isSuccessful) {
                val body = resp.body()
                val items = body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()
                val results = items.map { it.toSearchResult() }
                _hotMovies.value = results
                store.saveCategoryCache("热门", results)
                
                // 异步匹配，不阻塞主流程
                matchSourcesAsync(results) { _hotMovies.value = it }
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "fetchHotMovies failed", e)
        }
    }

    private suspend fun fetchRecommended() {
        try {
            val tag = java.net.URLEncoder.encode("豆瓣高分", "UTF-8")
            val resp = apiService.getDoubanData("movie", tag)
            if (resp.isSuccessful) {
                val body = resp.body()
                val items = body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()
                val results = items.map { it.toSearchResult() }
                _recommended.value = results
                matchSourcesAsync(results) { _recommended.value = it }
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "fetchRecommended failed", e)
        }
    }

    private suspend fun fetchAnimeUpdates() {
        try {
            val resp = apiService.getBangumiData("calendar")
            if (resp.isSuccessful) {
                val body = resp.body()
                val today = java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_WEEK)
                val bangumiIndex = if (today == 1) 6 else today - 2
                val results = (body?.getOrNull(bangumiIndex)?.items ?: emptyList()).map { it.toSearchResult() }
                _animeUpdates.value = results
                matchSourcesAsync(results) { _animeUpdates.value = it }
            } else {
                // Fallback to Douban
                val doubanResp = apiService.getDoubanData("tv", java.net.URLEncoder.encode("动漫", "UTF-8"))
                if (doubanResp.isSuccessful) {
                    val body = doubanResp.body()
                    val results = (body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()).map { it.toSearchResult() }
                    _animeUpdates.value = results
                    matchSourcesAsync(results) { _animeUpdates.value = it }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "fetchAnimeUpdates failed", e)
        }
    }

    private suspend fun fetchShortDramas() {
        try {
            val resp = apiService.getShortDramaHot(1)
            if (resp.isSuccessful) {
                val body = resp.body()
                val results = (body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()).map { it.toSearchResult() }
                _shortDramas.value = results
                matchSourcesAsync(results) { _shortDramas.value = it }
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "fetchShortDramas failed", e)
        }
    }

    private fun matchSourcesAsync(results: List<SearchResult>, onUpdate: (List<SearchResult>) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            val repository = com.supertv.app.data.SearchRepository()
            // 并行化匹配逻辑
            val matched = results.chunked(6).flatMap { chunk ->
                chunk.map { item ->
                    async { 
                        // 优先从匹配池获取，避免重复搜索
                        com.supertv.app.data.SearchRepository.getMatch(item.title)?.let { return@async it }
                        
                        val matchedItem = repository.aggressiveSearch(item.title, onlyExact = true).firstOrNull() ?: item
                        if (matchedItem !== item) {
                            com.supertv.app.data.SearchRepository.addMatch(item.title, matchedItem)
                        }
                        matchedItem
                    }
                }.awaitAll()
            }
            withContext(Dispatchers.Main) {
                onUpdate(matched)
            }
        }
    }

    private suspend fun loadCategoryData(category: String) {
        val subCategory = _selectedSubCategory.value
        if (category == "动漫" && subCategory == "全部") {
            loadAnimeData()
            return
        }
        
        val type = when (category) {
            "电影" -> "movie"
            "剧集" -> "tv"
            "综艺" -> "tv"
            "短剧" -> "movie"
            "动漫" -> "tv"
            else -> "movie"
        }

        val tag = when {
            subCategory == "全部" -> when (category) {
                "电影" -> "热门"
                "剧集" -> "热门"
                "综艺" -> "综艺"
                "动漫" -> "动漫"
                "短剧" -> "热门"
                else -> category
            }
            category == "动漫" -> when (subCategory) {
                "日本" -> "日本动画"
                "国产" -> "国产动画"
                "欧美" -> "欧美动画"
                else -> subCategory
            }
            category == "剧集" -> when (subCategory) {
                "韩剧" -> "韩国"
                "日剧" -> "日本"
                else -> subCategory
            }
            category == "短剧" && subCategory == "最新" -> "最新"
            else -> subCategory
        }

        try {
            val encodedTag = java.net.URLEncoder.encode(tag, "UTF-8")
            val resp = if (category == "短剧" && tag == "热门") {
                apiService.getShortDramaHot(1)
            } else {
                apiService.getDoubanData(type, encodedTag)
            }
            
            if (resp.isSuccessful) {
                val body = resp.body()
                val items = body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()
                val results = items.map { it.toSearchResult() }
                
                val cacheKey = if (subCategory == "全部") category else "${category}_${subCategory}"
                store.saveCategoryCache(cacheKey, results)

                // 1. 立即更新 UI (Metadata)
                updateCategoryFlow(category, results)

                // 2. 异步匹配，不阻塞 loadCategoryData 的返回
                matchSourcesAsync(results) { updateCategoryFlow(category, it) }
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "Failed to load category $category with tag $tag", e)
        }
    }

    private fun updateCategoryFlow(category: String, results: List<SearchResult>) {
        when (category) {
            "热门" -> {
                // 热门通常由 loadHomeData 处理，但如果子分类选择了具体 tag
                _hotMovies.value = results
            }
            "电影" -> _recommended.value = results
            "剧集" -> _hotMovies.value = results
            "动漫" -> _animeUpdates.value = results
            "综艺" -> _animeUpdates.value = results
            "短剧" -> _shortDramas.value = results
            else -> _recommended.value = results
        }
    }

    private suspend fun loadAnimeData() {
        try {
            val resp = apiService.getBangumiData("calendar")
            if (resp.isSuccessful) {
                val body = resp.body()
                val calendarMap = mutableMapOf<Int, List<SearchResult>>()
                
                body?.forEach { item ->
                    val weekday = item.weekday?.id ?: 0
                    val results = item.items.map { it.toSearchResult() }
                    calendarMap[weekday] = results
                }
                
                _animeCalendar.value = calendarMap
                
                // 默认显示今天的
                val today = java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_WEEK)
                val bangumiIndex = if (today == 1) 7 else today - 1 // Bangumi 1-7 (Mon-Sun)
                _animeUpdates.value = calendarMap[bangumiIndex] ?: emptyList()
                
                store.saveCategoryCache("动漫", _animeUpdates.value)
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "Failed to load anime data", e)
        }
    }

    fun refresh() {
        loadData()
    }
}

private fun DoubanItem.toSearchResult() = SearchResult(
    id = id,
    title = title,
    cover = if (cover.isNotBlank()) cover else poster,
    year = year,
    rating = if (rating.isNotBlank()) rating else rate,
    source = "douban",
    sourceName = if (sourceName.isNotBlank()) sourceName else "豆瓣",
    desc = desc
)

private fun BangumiItem.toSearchResult() = SearchResult(
    id = id.toString(),
    title = nameCn.ifBlank { name },
    cover = images?.large ?: images?.common ?: "",
    year = "",
    rating = rating?.score?.toString() ?: "",
    source = "bangumi",
    sourceName = "Bangumi",
    desc = summary
)
