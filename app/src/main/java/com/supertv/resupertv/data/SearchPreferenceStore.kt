package com.supertv.resupertv.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

val Context.searchDataStore by preferencesDataStore(name = "search_settings")

/**
 * 本地化持久化：精准模式与快速联想模式的偏好设置
 */
object SearchPreferenceStore {
    private val IS_EXACT_MODE = booleanPreferencesKey("is_exact_mode")

    suspend fun setExactMode(context: Context, isEnabled: Boolean) {
        context.searchDataStore.edit { prefs ->
            prefs[IS_EXACT_MODE] = isEnabled
        }
    }

    suspend fun isExactMode(context: Context): Boolean {
        return context.searchDataStore.data.map { it[IS_EXACT_MODE] ?: false }.first()
    }
}
