package com.supertv.resupertv.ui.transform

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.supertv.resupertv.data.Store
import com.supertv.resupertv.model.PlayRecord
import com.supertv.resupertv.model.SearchResult
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class TransformViewModel(application: Application) : AndroidViewModel(application) {

    private val store = Store.getInstance(application)

    private val _playRecords = MutableStateFlow<List<PlayRecord>>(emptyList())
    val playRecords: StateFlow<List<PlayRecord>> = _playRecords.asStateFlow()

    private val _hotMovies = MutableStateFlow<List<SearchResult>>(emptyList())
    val hotMovies: StateFlow<List<SearchResult>> = _hotMovies.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        loadPlayRecords()
    }

    private fun loadPlayRecords() {
        viewModelScope.launch {
            _playRecords.value = store.getPlayRecords().reversed().take(20)
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _isLoading.value = true
            _playRecords.value = store.getPlayRecords().reversed().take(20)
            _isLoading.value = false
        }
    }
}
