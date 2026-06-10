package com.supertv.app.ui.transform

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.Store
import com.supertv.app.model.*
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

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
        
        // 先从缓存加载
        val cached = store.getCategoryCache(cacheKey)
        if (cached.isNotEmpty()) {
            when (category) {
                "热门" -> {
                    // 热门频道数据较为复杂，这里简单恢复主要数据
                    _hotMovies.value = cached
                }
                "电影" -> _recommended.value = cached
                "剧集" -> _hotMovies.value = cached
                "动漫" -> _animeUpdates.value = cached
                "综艺" -> _animeUpdates.value = cached
                "短剧" -> _shortDramas.value = cached
                else -> {
                     // 其他自定义分类
                     _recommended.value = cached
                }
            }
        }

        viewModelScope.launch {
            _isLoading.value = true

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

        launch {
            try {
                val tag = java.net.URLEncoder.encode("热门", "UTF-8")
                val resp = apiService.getDoubanData("movie", tag)
                if (resp.isSuccessful) {
                    val body = resp.body()
                    val items = body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()
                    val results = items.map { it.toSearchResult() }
                    _hotMovies.value = results
                    // 只有热门主数据缓存
                    store.saveCategoryCache("热门", results)
                    
                    launch {
                        val matched = results.map { item ->
                            repository.aggressiveSearch(item.title).firstOrNull() ?: item
                        }
                        _hotMovies.value = matched
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("TransformViewModel", "Failed to load hot movies", e)
            }
        }

        launch {
            try {
                val tag = java.net.URLEncoder.encode("豆瓣高分", "UTF-8")
                val resp = apiService.getDoubanData("movie", tag)
                if (resp.isSuccessful) {
                    val body = resp.body()
                    val items = body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()
                    val results = items.map { it.toSearchResult() }
                    _recommended.value = results
                    
                    launch {
                        val matched = results.map { item ->
                            repository.aggressiveSearch(item.title).firstOrNull() ?: item
                        }
                        _recommended.value = matched
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("TransformViewModel", "Failed to load recommended", e)
            }
        }

        // 动漫更新：整合 Bangumi
        launch {
            try {
                val resp = apiService.getBangumiData("calendar")
                if (resp.isSuccessful) {
                    val body = resp.body()
                    val today = java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_WEEK)
                    val bangumiIndex = if (today == 1) 6 else today - 2
                    
                    val bangumiItems = body?.getOrNull(bangumiIndex)?.items ?: emptyList()
                    val results = bangumiItems.map { it.toSearchResult() }
                    _animeUpdates.value = results
                    
                    launch {
                        val matched = results.map { item ->
                            repository.aggressiveSearch(item.title).firstOrNull() ?: item
                        }
                        _animeUpdates.value = matched
                    }
                } else {
                    val doubanResp = apiService.getDoubanData("tv", "动漫")
                    if (doubanResp.isSuccessful) {
                        val body = doubanResp.body()
                        val items = body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()
                        val results = items.map { it.toSearchResult() }
                        _animeUpdates.value = results
                        
                        launch {
                            val matched = results.map { item ->
                                repository.aggressiveSearch(item.title).firstOrNull() ?: item
                            }
                            _animeUpdates.value = matched
                        }
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("TransformViewModel", "Failed to load anime", e)
            }
        }

        launch {
            try {
                val resp = apiService.getShortDramaHot(1)
                if (resp.isSuccessful) {
                    val body = resp.body()
                    val items = body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()
                    val results = items.map { it.toSearchResult() }
                    _shortDramas.value = results
                    
                    launch {
                        val matched = results.map { item ->
                            repository.aggressiveSearch(item.title).firstOrNull() ?: item
                        }
                        _shortDramas.value = matched
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("TransformViewModel", "Failed to load short dramas", e)
            }
        }
    }

    private suspend fun loadCategoryData(category: String) {
        val subCategory = _selectedSubCategory.value
        
        // 动漫特殊处理：如果选了“全部”且是星期几切换，走 Bangumi 逻辑
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

        // 映射子分类到豆瓣 Tag
        val tag = when {
            subCategory == "全部" -> when (category) {
                "电影" -> "热门"
                "剧集" -> "热门"
                "综艺" -> "综艺"
                "动漫" -> "动漫"
                "短剧" -> "热门"
                else -> category
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
                
                // 保存基础缓存
                val cacheKey = if (subCategory == "全部") category else "${category}_${subCategory}"
                store.saveCategoryCache(cacheKey, results)

                // 立即更新 UI
                updateCategoryFlow(category, results)

                // 后台匹配播放源
                viewModelScope.launch {
                    val repository = com.supertv.app.data.SearchRepository()
                    val matchedResults = results.map { item ->
                        val playable = repository.aggressiveSearch(item.title)
                        playable.firstOrNull() ?: item
                    }
                    updateCategoryFlow(category, matchedResults)
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "Failed to load category $category with tag $tag", e)
        }
    }

    private fun updateCategoryFlow(category: String, results: List<SearchResult>) {
        when (category) {
            "电影" -> _recommended.value = results
            "剧集" -> _hotMovies.value = results
            "综艺" -> _animeUpdates.value = results
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
