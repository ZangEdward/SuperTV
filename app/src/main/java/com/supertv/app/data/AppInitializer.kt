package com.supertv.app.data

import android.content.Context
import com.supertv.app.model.ApiNode
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

class AppInitializer(private val context: Context) {

    private val store = Store.getInstance(context)
    private val gson = Gson()

    companion object {
        @Volatile
        private var instance: AppInitializer? = null

        fun getInstance(context: Context): AppInitializer {
            return instance ?: synchronized(this) {
                instance ?: AppInitializer(context.applicationContext).also { instance = it }
            }
        }
    }

    fun initializeApiNodes(): List<ApiNode> {
        val savedNodes = store.getString("api_nodes", "")
        if (savedNodes.isNotBlank()) {
            return try {
                val type = object : TypeToken<List<ApiNode>>() {}.type
                gson.fromJson(savedNodes, type)
            } catch (e: Exception) {
                ServerConfig.getNodes(context)
            }
        }
        return ServerConfig.getNodes(context)
    }

    fun saveApiNodes(nodes: List<ApiNode>) {
        store.putString("api_nodes", gson.toJson(nodes))
    }

    fun isFirstLaunch(): Boolean {
        return store.getBoolean("first_launch", true).also {
            if (it) store.putBoolean("first_launch", false)
        }
    }

    fun getSyncRepo(): String {
        return store.getString("sync_repo", "")
    }

    fun setSyncRepo(repo: String) {
        store.putString("sync_repo", repo)
    }
}
