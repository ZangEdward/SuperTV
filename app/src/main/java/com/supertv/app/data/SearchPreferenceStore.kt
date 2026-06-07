package com.supertv.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * DataStore 偏好设置 - 对应原项目的 stores/settingsStore.ts
 *
 * 使用 Jetpack DataStore 实现类型安全的键值存�?
 */
class SearchPreferenceStore(private val context: Context) {

    private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "search_preferences")

    companion object {
        private val KEY_SEARCH_MODE = stringPreferencesKey("search_mode")
        private val KEY_SEARCH_HISTORY = stringPreferencesKey("search_history")
        private val KEY_FAVORITE_SOURCES = stringPreferencesKey("favorite_sources")
        private val KEY_AD_FILTER_ENABLED = booleanPreferencesKey("ad_filter_enabled")
        private val KEY_AUTO_PLAY = booleanPreferencesKey("auto_play")
        private val KEY_PLAYBACK_SPEED = floatPreferencesKey("playback_speed")
        private val KEY_THEME_MODE = stringPreferencesKey("theme_mode")
        private val KEY_API_NODES = stringPreferencesKey("api_nodes")
        private val KEY_CURRENT_API_NODE = stringPreferencesKey("current_api_node")
        private val KEY_DOWNLOAD_PATH = stringPreferencesKey("download_path")
        private val KEY_MAX_CACHE_SIZE = longPreferencesKey("max_cache_size")

        @Volatile
        private var instance: SearchPreferenceStore? = null

        fun getInstance(context: Context): SearchPreferenceStore {
            return instance ?: synchronized(this) {
                instance ?: SearchPreferenceStore(context.applicationContext).also { instance = it }
            }
        }
    }

    val searchMode: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_SEARCH_MODE] ?: "精准"
    }

    val adFilterEnabled: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[KEY_AD_FILTER_ENABLED] ?: false
    }

    val autoPlay: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[KEY_AUTO_PLAY] ?: true
    }

    val playbackSpeed: Flow<Float> = context.dataStore.data.map { prefs ->
        prefs[KEY_PLAYBACK_SPEED] ?: 1.0f
    }

    val themeMode: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_THEME_MODE] ?: "system"
    }

    val currentApiNode: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[KEY_CURRENT_API_NODE] ?: ""
    }

    suspend fun setSearchMode(mode: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_SEARCH_MODE] = mode
        }
    }

    suspend fun setAdFilterEnabled(enabled: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[KEY_AD_FILTER_ENABLED] = enabled
        }
    }

    suspend fun setAutoPlay(enabled: Boolean) {
        context.dataStore.edit { prefs ->
            prefs[KEY_AUTO_PLAY] = enabled
        }
    }

    suspend fun setPlaybackSpeed(speed: Float) {
        context.dataStore.edit { prefs ->
            prefs[KEY_PLAYBACK_SPEED] = speed
        }
    }

    suspend fun setThemeMode(mode: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_THEME_MODE] = mode
        }
    }

    suspend fun setApiNodes(nodesJson: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_API_NODES] = nodesJson
        }
    }

    suspend fun setCurrentApiNode(nodeKey: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_CURRENT_API_NODE] = nodeKey
        }
    }

    suspend fun setDownloadPath(path: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_DOWNLOAD_PATH] = path
        }
    }

    suspend fun setMaxCacheSize(size: Long) {
        context.dataStore.edit { prefs ->
            prefs[KEY_MAX_CACHE_SIZE] = size
        }
    }
}
