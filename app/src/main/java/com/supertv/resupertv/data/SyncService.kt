package com.supertv.resupertv.data

import android.content.Context
import com.supertv.resupertv.api.ApiService
import com.supertv.resupertv.model.Favorite
import com.supertv.resupertv.model.PlayRecord
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 数据同步服务 - 参考旧项目的 storage.ts 中的 FavoriteManager/PlayRecordManager
 *
 * 登录时从服务器拉取数据合并到本地，本地修改时同步到服务器
 */
class SyncService private constructor(context: Context) {

    private val store = Store.getInstance(context)
    private val authRepo = AuthRepository.getInstance(context)
    private val gson = Gson()

    companion object {
        @Volatile
        private var instance: SyncService? = null

        fun getInstance(context: Context): SyncService {
            return instance ?: synchronized(this) {
                instance ?: SyncService(context.applicationContext).also { instance = it }
            }
        }
    }

    private fun getApi(): ApiService? {
        return if (authRepo.isLoggedIn()) {
            try { RetrofitClient.getApiService() } catch (_: Exception) { null }
        } else null
    }

    /** 同步收藏 - 合并服务器和本地数据 */
    suspend fun syncFavorites(): List<Favorite> {
        val api = getApi() ?: return store.getFavorites()
        return withContext(Dispatchers.IO) {
            try {
                val remoteResponse = api.getFavorites()
                if (remoteResponse.isSuccessful) {
                    val remote = remoteResponse.body() ?: emptyList()
                    val local = store.getFavorites()
                    // 合并：以服务器为主，补充本地独有的
                    val remoteKeys = remote.map { it.searchTitle + it.sourceName }.toSet()
                    val merged = remote.toMutableList()
                    for (fav in local) {
                        val key = fav.searchTitle + fav.sourceName
                        if (key !in remoteKeys) merged.add(fav)
                    }
                    // 更新本地
                    store.replaceFavorites(merged)
                    merged
                } else {
                    store.getFavorites()
                }
            } catch (_: Exception) {
                store.getFavorites()
            }
        }
    }

    /** 添加收藏并同步到服务器 */
    suspend fun addFavorite(fav: Favorite) {
        store.addFavorite(fav)
        val api = getApi() ?: return
        withContext(Dispatchers.IO) {
            try {
                api.addFavorite(fav.searchTitle, fav.sourceName, gson.toJson(fav))
            } catch (_: Exception) {}
        }
    }

    /** 删除收藏并同步到服务器 */
    suspend fun removeFavorite(title: String, sourceName: String) {
        store.removeFavorite(title, sourceName)
        val api = getApi() ?: return
        withContext(Dispatchers.IO) {
            try { api.removeFavorite(sourceName, title) } catch (_: Exception) {}
        }
    }

    /** 同步播放记录 */
    suspend fun syncPlayRecords(): List<PlayRecord> {
        val api = getApi() ?: return store.getPlayRecords()
        return withContext(Dispatchers.IO) {
            try {
                val response = api.getPlayRecords()
                if (response.isSuccessful) {
                    val remote = response.body() ?: emptyList()
                    store.replacePlayRecords(remote)
                    remote
                } else store.getPlayRecords()
            } catch (_: Exception) { store.getPlayRecords() }
        }
    }

    /** 保存播放记录并同步 */
    suspend fun savePlayRecord(record: PlayRecord) {
        store.addPlayRecord(record)
        val api = getApi() ?: return
        withContext(Dispatchers.IO) {
            try { api.savePlayRecord(gson.toJson(record)) } catch (_: Exception) {}
        }
    }

    /** 同步搜索历史 */
    suspend fun syncSearchHistory(): List<String> {
        val api = getApi() ?: return store.getSearchHistory()
        return withContext(Dispatchers.IO) {
            try {
                val response = api.getSearchHistory()
                if (response.isSuccessful) {
                    val remote = response.body() ?: emptyList()
                    store.replaceSearchHistory(remote)
                    remote
                } else store.getSearchHistory()
            } catch (_: Exception) { store.getSearchHistory() }
        }
    }

    /** 添加搜索历史并同步 */
    suspend fun addSearchHistory(keyword: String) {
        store.addSearchHistory(keyword)
        val api = getApi() ?: return
        withContext(Dispatchers.IO) {
            try { api.addSearchHistory(keyword) } catch (_: Exception) {}
        }
    }

    /** 清除搜索历史并同步 */
    suspend fun clearSearchHistory() {
        store.clearSearchHistory()
        val api = getApi() ?: return
        withContext(Dispatchers.IO) {
            try { api.clearSearchHistory() } catch (_: Exception) {}
        }
    }

    /** 登录后全量同步 */
    suspend fun syncAll() {
        syncFavorites()
        syncPlayRecords()
        syncSearchHistory()
    }
}
