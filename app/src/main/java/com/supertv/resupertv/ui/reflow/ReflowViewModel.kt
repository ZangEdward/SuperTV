package com.supertv.resupertv.ui.reflow

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.supertv.resupertv.data.Store
import com.supertv.resupertv.model.Favorite
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class ReflowViewModel(application: Application) : AndroidViewModel(application) {

    private val store = Store.getInstance(application)

    private val _favorites = MutableStateFlow<List<Favorite>>(emptyList())
    val favorites: StateFlow<List<Favorite>> = _favorites.asStateFlow()

    init {
        loadFavorites()
    }

    private fun loadFavorites() {
        viewModelScope.launch {
            _favorites.value = store.getFavorites().reversed()
        }
    }

    fun removeFavorite(favorite: Favorite) {
        viewModelScope.launch {
            store.removeFavorite(favorite.searchTitle, favorite.sourceName)
            loadFavorites()
        }
    }

    fun refresh() = loadFavorites()
}

/**
 * ReflowFragment 的 ViewModel
 */
class ReflowViewModel(application: Application) : AndroidViewModel(application) {
    // 收藏数据加载逻辑将在后续实现
}
