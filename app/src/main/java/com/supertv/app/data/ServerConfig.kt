package com.supertv.app.data

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.supertv.app.BuildConfig
import com.supertv.app.model.ApiNode

/**
 * 服务器节点配�?�?�?BuildConfig.API_NODES_JSON 读取
 *
 * 构建时由 GitHub Secrets 注入 API_NODES_JSON 环境变量�?
 * 通过 gradle.properties 传递到 BuildConfig�?
 * 如果未配置（开发环境），返回空列表�?
 */
object ServerConfig {

    private val gson = Gson()

    /** 缓存的节点列�?*/
    private var cachedNodes: List<ApiNode>? = null

    /**
     * 获取所�?API 节点
     */
    fun getNodes(): List<ApiNode> {
        if (cachedNodes != null) return cachedNodes!!

        val json = try {
            BuildConfig.API_NODES_JSON
        } catch (_: Exception) {
            null
        }

        val nodes = if (!json.isNullOrBlank() && json != "[]" && json != "\"[]\"") {
            try {
                val rawJson = json.removeSurrounding("\"")
                val type = object : TypeToken<List<ApiNode>>() {}.type
                gson.fromJson<List<ApiNode>>(rawJson, type) ?: emptyList()
            } catch (_: Exception) {
                emptyList()
            }
        } else {
            emptyList()
        }

        cachedNodes = nodes
        return nodes
    }

    /**
     * 获取当前选中的节�?key
     */
    fun getSelectedKey(store: Store): String {
        return store.getString("selected_server_key", "")
    }

    /**
     * 保存选中的节�?key
     */
    fun setSelectedKey(store: Store, key: String) {
        store.putString("selected_server_key", key)
    }

    /**
     * 根据 key 获取节点 URL
     */
    fun getNodeUrl(key: String): String? {
        return getNodes().firstOrNull { it.key == key }?.url
    }

    /**
     * 获取当前选中节点�?URL（用�?API 切换�?
     */
    fun getSelectedUrl(store: Store): String? {
        val key = getSelectedKey(store)
        return getNodeUrl(key)
    }

    /**
     * 清除缓存（当 BuildConfig 可能变化时）
     */
    fun clearCache() {
        cachedNodes = null
    }
}
