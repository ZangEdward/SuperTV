package com.supertv.app.data

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.supertv.app.model.Favorite
import com.supertv.app.model.PlayRecord
import com.supertv.app.model.SearchResult

/**
 * 本地存储管理�?- 对应原项目的 stores �?services/storage.ts
 *
 * 使用 SharedPreferences 实现轻量�?KV 存储
 */
class Store(private val context: Context) {

    private val gson = Gson()

    companion object {
        private const val PREFS_NAME = "supertv_store"
        private const val KEY_FAVORITES = "favorites"
        private const val KEY_PLAY_RECORDS = "play_records"
        private const val KEY_SEARCH_HISTORY = "search_history"
        private const val KEY_LAST_PLAYED = "last_played"
        private const val KEY_CACHED_EPISODES = "cached_episodes"

        @Volatile
        private var instance: Store? = null

        fun getInstance(context: Context): Store {
            return instance ?: synchronized(this) {
                instance ?: Store(context.applicationContext).also { instance = it }
            }
        }
    }

    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // ==================== 收藏管理 ====================

    fun getFavorites(): List<Favorite> {
        val json = prefs.getString(KEY_FAVORITES, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<Favorite>>() {}.type
            gson.fromJson(json, type)
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun saveFavorites(favorites: List<Favorite>) {
        prefs.edit().putString(KEY_FAVORITES, gson.toJson(favorites)).apply()
    }

    fun addFavorite(favorite: Favorite) {
        val list = getFavorites().toMutableList()
        if (list.none { it.title == favorite.title && it.sourceName == favorite.sourceName }) {
            list.add(0, favorite.copy(saveTime = System.currentTimeMillis()))
            saveFavorites(list)
        }
    }

    fun removeFavorite(title: String, sourceName: String) {
        val list = getFavorites().toMutableList()
        list.removeAll { it.title == title && it.sourceName == sourceName }
        saveFavorites(list)
    }

    /** 批量替换收藏（用于服务器同步�?*/
    fun replaceFavorites(favorites: List<Favorite>) {
        saveFavorites(favorites)
    }

    fun isFavorite(title: String, sourceName: String): Boolean {
        return getFavorites().any { it.title == title && it.sourceName == sourceName }
    }

    // ==================== 播放记录 ====================

    fun getPlayRecords(): List<PlayRecord> {
        val json = prefs.getString(KEY_PLAY_RECORDS, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<PlayRecord>>() {}.type
            gson.fromJson(json, type)
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun savePlayRecords(records: List<PlayRecord>) {
        prefs.edit().putString(KEY_PLAY_RECORDS, gson.toJson(records)).apply()
    }

    fun addPlayRecord(record: PlayRecord) {
        val list = getPlayRecords().toMutableList()
        list.removeAll { it.title == record.title && it.sourceName == record.sourceName }
        list.add(0, record.copy(saveTime = System.currentTimeMillis()))
        if (list.size > 200) {
            val subList = list.subList(0, 200)
            savePlayRecords(subList)
        } else {
            savePlayRecords(list)
        }
    }

    /** 批量替换播放记录（用于服务器同步�?*/
    fun replacePlayRecords(records: List<PlayRecord>) {
        savePlayRecords(records)
    }

    // ==================== 搜索历史 ====================

    fun getSearchHistory(): List<String> {
        val json = prefs.getString(KEY_SEARCH_HISTORY, null) ?: return emptyList()
        return try {
            val type = object : TypeToken<List<String>>() {}.type
            gson.fromJson(json, type)
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun addSearchHistory(keyword: String) {
        val list = getSearchHistory().toMutableList()
        list.remove(keyword)
        list.add(0, keyword)
        val trimmed = if (list.size > 50) list.subList(0, 50) else list
        prefs.edit().putString(KEY_SEARCH_HISTORY, gson.toJson(trimmed)).apply()
    }

    fun clearSearchHistory() {
        prefs.edit().remove(KEY_SEARCH_HISTORY).apply()
    }

    /** 批量替换搜索历史（用于服务器同步�?*/
    fun replaceSearchHistory(history: List<String>) {
        prefs.edit().putString(KEY_SEARCH_HISTORY, gson.toJson(history)).apply()
    }

    // ==================== 上次播放 ====================

    fun getLastPlayed(): PlayRecord? {
        val json = prefs.getString(KEY_LAST_PLAYED, null) ?: return null
        return try {
            gson.fromJson(json, PlayRecord::class.java)
        } catch (e: Exception) {
            null
        }
    }

    fun saveLastPlayed(record: PlayRecord) {
        prefs.edit().putString(KEY_LAST_PLAYED, gson.toJson(record)).apply()
    }

    // ==================== 缓存管理 ====================

    fun getCachedEpisodes(): Map<String, Set<Int>> {
        val json = prefs.getString(KEY_CACHED_EPISODES, null) ?: return emptyMap()
        return try {
            val type = object : TypeToken<Map<String, Set<Int>>>() {}.type
            gson.fromJson(json, type)
        } catch (e: Exception) {
            emptyMap()
        }
    }

    fun markEpisodeCached(videoId: String, episodeIndex: Int) {
        val map = getCachedEpisodes().toMutableMap()
        val episodes = map[videoId]?.toMutableSet() ?: mutableSetOf()
        episodes.add(episodeIndex)
        map[videoId] = episodes
        prefs.edit().putString(KEY_CACHED_EPISODES, gson.toJson(map)).apply()
    }

    fun isEpisodeCached(videoId: String, episodeIndex: Int): Boolean {
        val map = getCachedEpisodes()
        return map[videoId]?.contains(episodeIndex) ?: false
    }

    // ==================== 通用存储 ====================

    fun putString(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    fun getString(key: String, default: String = ""): String {
        return prefs.getString(key, default) ?: default
    }

    fun putBoolean(key: String, value: Boolean) {
        prefs.edit().putBoolean(key, value).apply()
    }

    fun getBoolean(key: String, default: Boolean = false): Boolean {
        return prefs.getBoolean(key, default)
    }

    fun putInt(key: String, value: Int) {
        prefs.edit().putInt(key, value).apply()
    }

    fun getInt(key: String, default: Int = 0): Int {
        return prefs.getInt(key, default)
    }

    fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
