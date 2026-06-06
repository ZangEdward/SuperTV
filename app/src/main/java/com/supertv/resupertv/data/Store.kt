package com.supertv.resupertv.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * 实时同步磁盘配置的 Store
 * 确保 API 配置、直播源、投屏输入在变更时直接持久化
 */
val Context.dataStore by preferencesDataStore(name = "settings")

object Store {
    private val API_URL = stringPreferencesKey("api_url")
    private val LIVE_SOURCES = stringPreferencesKey("live_sources")

    suspend fun saveSettings(context: Context, url: String, sources: String) {
        context.dataStore.edit { settings ->
            settings[API_URL] = url
            settings[LIVE_SOURCES] = sources
        }
    }

    suspend fun getSettings(context: Context) = context.dataStore.data.map { 
        Pair(it[API_URL] ?: "", it[LIVE_SOURCES] ?: "")
    }.first()
}
