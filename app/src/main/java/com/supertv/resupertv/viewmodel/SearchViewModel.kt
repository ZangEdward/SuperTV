package com.supertv.resupertv.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.supertv.resupertv.api.ApiService
import com.supertv.resupertv.data.RetrofitClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class SearchViewModel : ViewModel() {
    private val apiService = RetrofitClient.create(ApiService::class.java)

    private val _searchResults = MutableStateFlow<List<Any>>(emptyList())
    val searchResults = _searchResults.asStateFlow()

    private val _history = MutableStateFlow<List<String>>(emptyList())
    val history = _history.asStateFlow()

    fun search(query: String) {
        viewModelScope.launch {
            try {
                val response = apiService.searchVideos(query)
                _searchResults.value = listOf(response)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // 搜索联想功能
    fun getSuggestions(query: String) {
        viewModelScope.launch {
            try {
                val response = apiService.getSearchSuggestions(query)
                // 原项目逻辑: suggestions 字段
                _history.value = response["suggestions"] ?: emptyList()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
