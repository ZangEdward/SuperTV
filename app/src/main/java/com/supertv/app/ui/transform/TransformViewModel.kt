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
    private val apiService = RetrofitClient.getApiService()

    private val _playRecords = MutableStateFlow<List<PlayRecord>>(emptyList<PlayRecord>())
    val playRecords: StateFlow<List<PlayRecord>> = _playRecords.asStateFlow()

    private val _hotMovies = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val hotMovies: StateFlow<List<SearchResult>> = _hotMovies.asStateFlow()

    private val _recommended = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val recommended: StateFlow<List<SearchResult>> = _recommended.asStateFlow()

    private val _animeUpdates = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val animeUpdates: StateFlow<List<SearchResult>> = _animeUpdates.asStateFlow()

    private val _shortDramas = MutableStateFlow<List<SearchResult>>(emptyList<SearchResult>())
    val shortDramas: StateFlow<List<SearchResult>> = _shortDramas.asStateFlow()

    private val _selectedCategory = MutableStateFlow("热门")
    val selectedCategory: StateFlow<String> = _selectedCategory.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        loadData()
    }

    fun selectCategory(category: String) {
        if (_selectedCategory.value != category) {
            _selectedCategory.value = category
            loadData()
        }
    }

    private fun loadData() {
        val category = _selectedCategory.value
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
        launch {
            try {
                val resp = apiService.getDoubanData("movie", "热门")
                if (resp.isSuccessful) {
                    val body = resp.body()
                    val items = body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()
                    _hotMovies.value = items.map { it.toSearchResult() }
                }
            } catch (e: Exception) {
                android.util.Log.e("TransformViewModel", "Failed to load hot movies", e)
            }
        }

        launch {
            try {
                val resp = apiService.getDoubanData("movie", "豆瓣高分")
                if (resp.isSuccessful) {
                    val body = resp.body()
                    val items = body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()
                    _recommended.value = items.map { it.toSearchResult() }
                }
            } catch (e: Exception) {
                android.util.Log.e("TransformViewModel", "Failed to load recommended", e)
            }
        }

        launch {
            try {
                val resp = apiService.getDoubanData("tv", "动漫")
                if (resp.isSuccessful) {
                    val body = resp.body()
                    val items = body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()
                    _animeUpdates.value = items.map { it.toSearchResult() }
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
                    _shortDramas.value = items.map { it.toSearchResult() }
                }
            } catch (e: Exception) {
                android.util.Log.e("TransformViewModel", "Failed to load short dramas", e)
            }
        }
    }

    private suspend fun loadCategoryData(category: String) {
        val (type, tag) = when (category) {
            "电影" -> "movie" to "热门"
            "剧集" -> "tv" to "热门"
            "动漫" -> "tv" to "动漫"
            "综艺" -> "tv" to "综艺"
            "短剧" -> {
                val resp = apiService.getShortDramaHot(1)
                if (resp.isSuccessful) {
                    val body = resp.body()
                    val items = body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()
                    _shortDramas.value = items.map { it.toSearchResult() }
                }
                return
            }
            else -> "movie" to category
        }

        try {
            val resp = apiService.getDoubanData(type, tag)
            if (resp.isSuccessful) {
                val body = resp.body()
                val items = body?.list?.ifEmpty { body.items } ?: emptyList<DoubanItem>()
                val results = items.map { it.toSearchResult() }
                
                // 根据分类更新对应的 StateFlow，以便 Fragment 显示
                when (category) {
                    "电影" -> _recommended.value = results
                    "剧集" -> _hotMovies.value = results
                    "动漫" -> _animeUpdates.value = results
                    "综艺" -> _animeUpdates.value = results // 借用 animeUpdates 展示综艺
                }
            }
        } catch (e: Exception) {
            android.util.Log.e("TransformViewModel", "Failed to load category $category", e)
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
