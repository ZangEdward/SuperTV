package com.supertv.app.ui.transform

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.Store
import com.supertv.app.model.DoubanItem
import com.supertv.app.model.PlayRecord
import com.supertv.app.model.SearchResult
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class TransformViewModel(application: Application) : AndroidViewModel(application) {

    private val store = Store.getInstance(application)
    private val apiService = RetrofitClient.getApiService()

    private val _playRecords = MutableStateFlow<List<PlayRecord>>(emptyList())
    val playRecords: StateFlow<List<PlayRecord>> = _playRecords.asStateFlow()

    private val _hotMovies = MutableStateFlow<List<SearchResult>>(emptyList())
    val hotMovies: StateFlow<List<SearchResult>> = _hotMovies.asStateFlow()

    private val _recommended = MutableStateFlow<List<SearchResult>>(emptyList())
    val recommended: StateFlow<List<SearchResult>> = _recommended.asStateFlow()

    private val _newContent = MutableStateFlow<List<SearchResult>>(emptyList())
    val newContent: StateFlow<List<SearchResult>> = _newContent.asStateFlow()

    /** 动画每日更新 �?�?Selene 每日放�?*/
    private val _animeUpdates = MutableStateFlow<List<SearchResult>>(emptyList())
    val animeUpdates: StateFlow<List<SearchResult>> = _animeUpdates.asStateFlow()

    /** 最近播放记录（动画分区内也用） */
    private val _recentPlayRecords = MutableStateFlow<List<PlayRecord>>(emptyList())
    val recentPlayRecords: StateFlow<List<PlayRecord>> = _recentPlayRecords.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        loadData()
    }

    private fun loadData() {
        viewModelScope.launch {
            _isLoading.value = true

            // Load local data
            val allRecords = store.getPlayRecords().reversed()
            _playRecords.value = allRecords.take(20)
            _recentPlayRecords.value = allRecords.take(20)

            // Load remote data in parallel
            try {
                val hotResult = apiService.getDoubanHot()
                if (hotResult.isSuccessful) {
                    _hotMovies.value = hotResult.body()?.items?.map { it.toSearchResult() } ?: emptyList()
                }

                val recommendResult = apiService.getDoubanRecommend()
                if (recommendResult.isSuccessful) {
                    _recommended.value = recommendResult.body()?.items?.map { it.toSearchResult() } ?: emptyList()
                }

                val newResult = apiService.getDoubanNew()
                if (newResult.isSuccessful) {
                    _newContent.value = newResult.body()?.items?.map { it.toSearchResult() } ?: emptyList()
                }

                // 加载动画分类 �?豆瓣动画每日更新
                val animeResult = apiService.getDoubanCategory("anime", 1)
                if (animeResult.isSuccessful) {
                    _animeUpdates.value = animeResult.body()?.items?.map { it.toSearchResult() } ?: emptyList()
                }
            } catch (_: Exception) {
                // Network error �?keep existing data
            }

            _isLoading.value = false
        }
    }

    fun refresh() {
        loadData()
    }
}

private fun DoubanItem.toSearchResult() = SearchResult(
    id = id,
    title = title,
    cover = cover,
    year = year,
    source = "douban",
    sourceName = sourceName.ifBlank { "豆瓣" },
    desc = desc
)
