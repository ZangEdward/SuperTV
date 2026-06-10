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
    
    // 内存缓存：对齐 supertvold dataCache，实现即时切换
    private val memoryCache = mutableMapOf<String, List<SearchResult>>()

    private val _playRecords = MutableStateFlow<List<PlayRecord>>(emptyList<PlayRecord>())
    val playRecords: StateFlow<List<PlayRecord>> = _playRecords.asStateFlow()

    private val _hotMovies = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val hotMovies: StateFlow<List<SearchResult>> = _hotMovies.asStateFlow()

    private val _recommended = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val recommended: StateFlow<List<SearchResult>> = _recommended.asStateFlow()

    private val _animeUpdates = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val animeUpdates: StateFlow<List<SearchResult>> = _animeUpdates.asStateFlow()

    private val _aiRecommended = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val aiRecommended: StateFlow<List<SearchResult>> = _aiRecommended.asStateFlow()

    private val _varietyUpdates = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val varietyUpdates: StateFlow<List<SearchResult>> = _varietyUpdates.asStateFlow()

    private val _animeCalendar = MutableStateFlow<Map<Int, List<SearchResult>>>(emptyMap())
    val animeCalendar: StateFlow<Map<Int, List<SearchResult>>> = _animeCalendar.asStateFlow()

    private val _shortDramas = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val shortDramas: StateFlow<List<SearchResult>> = _shortDramas.asStateFlow()

    private val _selectedCategory = MutableStateFlow("热门")
    val selectedCategory: StateFlow<String> = _selectedCategory.asStateFlow()

    private val _selectedSubCategory = MutableStateFlow("热门")
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
            // 移除“全部”，默认改为“热门”
            _selectedSubCategory.value = "热门"
            loadData()
            // 💡 优化：切换大分类时，并行预加载所有子分类 (对齐 LunaTV 增强版)
            preLoadAllSubCategories(category)
        }
    }

    fun selectSubCategory(subCategory: String) {
        if (_selectedSubCategory.value != subCategory) {
            _selectedSubCategory.value = subCategory
            loadData()
        }
    }

    private fun preLoadAllSubCategories(category: String) {
        if (category == "热门" || category == "动漫") return
        
        val subCategories = when (category) {
            "电影" -> listOf("热门", "最新", "豆瓣高分", "冷门佳片", "华语", "欧美", "韩国", "日本")
            "剧集" -> listOf("热门", "华语", "欧美", "韩剧", "日剧", "泰国")
            "动漫" -> listOf("热门", "日本", "国产", "欧美")
            "综艺" -> listOf("热门", "内地", "港台", "日韩", "欧美")
            "短剧" -> listOf("热门", "最新")
            else -> emptyList()
        }

        viewModelScope.launch(Dispatchers.IO) {
            // 使用协程并行加载，极大提升子分类切换速度
            subCategories.forEach { sub ->
                if (sub == "热门") return@forEach // 已经在主逻辑加载
                delay(150) // 微小延迟，防止触发后台 API 并发限流
                launch {
                    loadCategoryData(category, sub)
                }
            }
        }
    }

    private fun loadData() {
        val category = _selectedCategory.value
        val subCategory = _selectedSubCategory.value
        val cacheKey = "${category}_${subCategory}"
        
        // 动漫模块特殊处理：仅保留周一至周日更新，使用 Bangumi 数据源
        if (category == "动漫") {
            viewModelScope.launch {
                _isLoading.value = true
                loadAnimeData()
                _isLoading.value = false
            }
            return
        }

        // 1. 优先从内存缓存读取
        val memCached = memoryCache[cacheKey]
        if (memCached != null && memCached.isNotEmpty()) {
            updateCategoryFlow(category, memCached)
            // 即使有缓存，也在后台静默刷新，但不显示 Loading
            viewModelScope.launch {
                try {
                    if (category == "热门") loadHomeData() else loadCategoryData(category)
                } catch (_: Exception) {}
            }
        } else {
            // 2. 内存没有，尝试从持久化缓存恢复
            val diskCached = store.getCategoryCache(cacheKey)
            if (diskCached.isNotEmpty()) {
                updateCategoryFlow(category, diskCached)
                memoryCache[cacheKey] = diskCached
                // 后台刷新
                viewModelScope.launch {
                    try {
                        if (category == "热门") loadHomeData() else loadCategoryData(category)
                    } catch (_: Exception) {}
                }
            } else {
                // 3. 彻底没数据才显示 Loading
                _isLoading.value = true
                viewModelScope.launch {
                    try {
                        if (category == "热门") loadHomeData() else loadCategoryData(category)
                    } catch (e: Exception) {
                        android.util.Log.e("TransformViewModel", "Error in loadData for $category", e)
                    } finally {
                        _isLoading.value = false
                    }
                }
            }
        }
    }

    private suspend fun loadHomeData() = coroutineScope {
        // 并发执行首页板块
        launch { fetchHotMovies() }
        launch { fetchRecommended() }
        launch { fetchAnimeUpdates() }
        launch { fetchShortDramas() }
        launch { fetchAIRecommendations() }
        
        launch { preLoadHighFrequencyCategories() }
    }

    private suspend fun fetchAIRecommendations() {
        try {
            // 获取播放记录作为上下文
            val history = _playRecords.value.take(5).joinToString(",") { it.title }
            val resp = apiService.getAIRecommend(context = "home", history = history)
            if (resp.isSuccessful) {
                val content = resp.body()?.content ?: ""
                if (content.isNotBlank()) {
                    // 假设 content 是用逗号分隔的影片标题
                    val titles = content.split(",", "，", "\n").filter { it.isNotBlank() }.take(6)
                    val results = mutableListOf<SearchResult>()
                    
                    // 并发获取每个标题的详情/基本信息
                    coroutineScope {
                        titles.map { title ->
                            launch {
                                try {
                                    val searchResp = apiService.getDoubanData("movie", java.net.URLEncoder.encode(title.trim(), "UTF-8"), pageSize = 1)
                                    if (searchResp.isSuccessful) {
                                        searchResp.body()?.list?.firstOrNull()?.let {
                                            synchronized(results) { results.add(it.toSearchResult()) }
                                        }
                                    }
                                } catch (_: Exception) {}
                            }
                        }.joinAll()
                    }
                    
                    if (results.isNotEmpty()) {
                        _aiRecommended.value = results
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "fetchAIRecommendations failed", e)
        }
    }

    private suspend fun fetchHotMovies() {
        try {
            val tag = "热门"
            val resp = apiService.getDoubanData("movie", tag)
            if (resp.isSuccessful) {
                val results = (resp.body()?.list ?: emptyList()).map { it.toSearchResult() }
                _hotMovies.value = results
                store.saveCategoryCache("热门", results)
                memoryCache["热门"] = results
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "fetchHotMovies failed", e)
        }
    }

    private suspend fun fetchRecommended() {
        try {
            val tag = "豆瓣高分"
            val resp = apiService.getDoubanData("movie", tag)
            if (resp.isSuccessful) {
                val results = (resp.body()?.list ?: emptyList()).map { it.toSearchResult() }
                _recommended.value = results
                memoryCache["电影"] = results
                memoryCache["电影_热门"] = results
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "fetchRecommended failed", e)
        }
    }

    private suspend fun preLoadHighFrequencyCategories() = coroutineScope {
        val tasks = listOf(
            Triple("综艺", "内地", "tv"),
            Triple("综艺", "港台", "tv"),
            Triple("剧集", "华语", "tv"),
            Triple("剧集", "韩剧", "tv")
        )
        
        tasks.forEach { (cat, sub, type) ->
            val cacheKey = "${cat}_${sub}"
            if (memoryCache[cacheKey].isNullOrEmpty()) {
                launch(Dispatchers.IO) {
                    try {
                        val tag = when(sub) {
                            "韩剧" -> "韩国"
                            else -> sub
                        }
                        val resp = apiService.getDoubanData(type, java.net.URLEncoder.encode(tag, "UTF-8"))
                        if (resp.isSuccessful) {
                            val results = (resp.body()?.list ?: emptyList()).map { it.toSearchResult() }
                            memoryCache[cacheKey] = results
                        }
                    } catch (_: Exception) {}
                }
            }
        }
    }

    private suspend fun fetchAnimeUpdates() {
        try {
            // [对齐 Selene]：首页动漫部分改回使用 Bangumi 数据源，展示每日更新日历
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
                
                // 默认首页展示今天的更新
                val today = java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_WEEK).let {
                    if (it == 1) 7 else it - 1
                }
                _animeUpdates.value = calendarMap[today] ?: emptyList()
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "fetchAnimeUpdates failed", e)
        }
    }

    private suspend fun fetchShortDramas() {
        try {
            val resp = apiService.getShortDramaHot(1)
            if (resp.isSuccessful) {
                val results = (resp.body()?.list ?: emptyList()).map { it.toSearchResult() }
                _shortDramas.value = results
                memoryCache["短剧_热门"] = results
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "fetchShortDramas failed", e)
        }
    }

    // 移除 matchSourcesAsync，不在列表页进行耗时的全网源匹配，对齐 Selene 逻辑

    private suspend fun loadCategoryData(category: String, subCategory: String = _selectedSubCategory.value) {
        val type = when (category) {
            "电影" -> "movie"
            "剧集" -> "tv"
            "综艺" -> "tv"
            "短剧" -> "movie"
            "动漫" -> "tv"
            else -> "movie"
        }

        // 重新校对后端 Tag 映射，确保每个页面都有数据 (对齐 LunaTV-Enhanced)
        val tag = when {
            category == "动漫" -> when (subCategory) {
                "热门" -> "动漫"
                "日本" -> "日本动画"
                "国产" -> "国产动画"
                "欧美" -> "欧美动画"
                else -> subCategory
            }
            category == "剧集" -> when (subCategory) {
                "热门" -> "最近热门"
                "华语" -> "华语"
                "欧美" -> "欧美"
                "韩剧" -> "韩国"
                "日剧" -> "日本"
                else -> subCategory
            }
            category == "电影" -> when (subCategory) {
                "热门" -> "热门"
                "最新" -> "最新"
                "豆瓣高分" -> "豆瓣高分"
                "冷门佳片" -> "冷门佳片"
                else -> subCategory
            }
            category == "综艺" -> when (subCategory) {
                "热门" -> "综艺"
                else -> subCategory
            }
            category == "短剧" -> when (subCategory) {
                "热门" -> "热门"
                "最新" -> "最新"
                else -> subCategory
            }
            else -> subCategory
        }

        try {
            // 💡 优先尝试使用后台提供的 Rexxar (m.douban.com) 镜像 API，响应速度提升 2-3 倍
            val rexxarParams = getRexxarParams(category, subCategory)
            val resp = if (rexxarParams != null) {
                apiService.getDoubanRexxar(rexxarParams.kind, rexxarParams.category, rexxarParams.type)
            } else if (category == "短剧" && tag == "热门") {
                apiService.getShortDramaHot(1)
            } else {
                // 手动执行 UTF-8 编码，防止部分服务器节点解析乱码
                val encodedTag = java.net.URLEncoder.encode(tag, "UTF-8")
                apiService.getDoubanCategory(type, encodedTag)
            }
            
            if (resp.isSuccessful) {
                val body = resp.body()
                // 兼容 list 和 items 两种返回格式 (对齐 Selene)
                val items = body?.list?.ifEmpty { body.items } ?: body?.items ?: emptyList<DoubanItem>()
                val results = items.map { it.toSearchResult() }
                
                val cacheKey = "${category}_${subCategory}"
                if (results.isNotEmpty()) {
                    store.saveCategoryCache(cacheKey, results)
                    updateCategoryFlow(category, results, subCategory)
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "Failed to load category $category with tag $tag", e)
        }
    }

    private data class RexxarParams(val kind: String, val category: String, val type: String)

    private fun getRexxarParams(category: String, subCategory: String): RexxarParams? {
        val kind = when (category) {
            "电影" -> "movie"
            "剧集" -> "tv"
            else -> return null
        }
        val type = kind
        val doubanCategory = when (subCategory) {
            "热门" -> "hot"
            "最新" -> "new"
            "华语" -> "chinese"
            "欧美" -> "western"
            "韩国" -> "korean"
            "日本" -> "japanese"
            "豆瓣高分" -> "classic"
            "冷门佳片" -> "underrated"
            else -> return null
        }
        return RexxarParams(kind, doubanCategory, type)
    }

    private fun updateCategoryFlow(category: String, results: List<SearchResult>, subCategory: String = _selectedSubCategory.value) {
        // 更新内存缓存以便下次即时切换
        val cacheKey = "${category}_${subCategory}"
        if (results.isNotEmpty()) {
            memoryCache[cacheKey] = results
        }

        // 仅当当前选中的是这个子分类时才更新 UI Flow
        if (subCategory != _selectedSubCategory.value) return

        // 全局通知 UI 更新数据流
        when (category) {
            "电影" -> _recommended.value = results
            "剧集" -> _hotMovies.value = results
            "动漫" -> _animeUpdates.value = results
            "综艺" -> _varietyUpdates.value = results
            "短剧" -> _shortDramas.value = results
            "热门" -> {
                // 热门频道特殊逻辑由 loadHomeData 分支处理
            }
        }
    }

    private suspend fun loadAnimeData() {
        try {
            // 动漫统一走 Bangumi
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
                
                // 默认显示今天的 (Bangumi 1-7)
                val today = java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_WEEK).let {
                    if (it == 1) 7 else it - 1
                }
                _animeUpdates.value = calendarMap[today] ?: emptyList()
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
