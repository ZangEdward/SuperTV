package com.supertv.app.data

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.supertv.app.model.ApiNode

object ServerConfig {

    private val gson = Gson()
    private var cachedNodes: List<ApiNode>? = null

    fun getNodes(context: Context): List<ApiNode> {
        if (cachedNodes != null) return cachedNodes!!

        val json = try {
            context.assets.open("api_nodes.json").bufferedReader().use { it.readText() }
        } catch (_: Exception) {
            null
        }

        val nodes = if (!json.isNullOrBlank() && json != "[]") {
            try {
                val type = object : TypeToken<List<ApiNode>>() {}.type
                gson.fromJson<List<ApiNode>>(json, type) ?: emptyList()
            } catch (_: Exception) {
                emptyList()
            }
        } else {
            emptyList()
        }

        cachedNodes = nodes
        return nodes
    }

    // 过渡方法，建议后续迁移到 getNodes(context)
    fun getNodes(): List<ApiNode> {
        return cachedNodes ?: emptyList()
    }

    fun getSelectedKey(store: Store): String {
        return store.getString("selected_server_key", "")
    }

    fun setSelectedKey(store: Store, key: String) {
        store.putString("selected_server_key", key)
    }

    fun getNodeUrl(context: Context, key: String): String? {
        return getNodes(context).firstOrNull { it.key == key }?.url
    }

    fun getSelectedUrl(context: Context, store: Store): String? {
        val key = getSelectedKey(store)
        return getNodeUrl(context, key)
    }

    fun clearCache() {
        cachedNodes = null
    }
}
