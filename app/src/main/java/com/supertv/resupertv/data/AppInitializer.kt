package com.supertv.resupertv.data

import android.content.Context
import com.supertv.resupertv.model.ApiNode
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

/**
 * 应用初始化器 - 对应原项目的 _layout.tsx 中的初始化逻辑
 *
 * 负责应用启动时的配置加载、API节点初始化等
 */
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

    /**
     * 初始化API节点
     * 优先使用环境变量中的节点配置，否则使用默认节点
     */
    fun initializeApiNodes(): List<ApiNode> {
        val savedNodes = store.getString("api_nodes")
        if (savedNodes.isNotBlank()) {
            return try {
                val type = object : TypeToken<List<ApiNode>>() {}.type
                gson.fromJson(savedNodes, type)
            } catch (e: Exception) {
                getDefaultNodes()
            }
        }
        return getDefaultNodes()
    }

    private fun getDefaultNodes(): List<ApiNode> {
        return listOf(
            ApiNode(key = "default", label = "默认节点", url = "https://api.example.com/")
        )
    }

    /**
     * 保存API节点配置
     */
    fun saveApiNodes(nodes: List<ApiNode>) {
        store.putString("api_nodes", gson.toJson(nodes))
    }

    /**
     * 检查是否为首次启动
     */
    fun isFirstLaunch(): Boolean {
        return store.getBoolean("first_launch", true).also {
            if (it) store.putBoolean("first_launch", false)
        }
    }

    /**
     * 检查更新配置
     */
    fun getSyncRepo(): String {
        return store.getString("sync_repo", "")
    }

    fun setSyncRepo(repo: String) {
        store.putString("sync_repo", repo)
    }
}
