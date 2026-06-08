package com.supertv.app.data

import android.content.Context
import com.google.gson.Gson
import com.supertv.app.model.ApiNode
import java.nio.charset.Charset

object ApiNodeService {
    private const val ASSET_FILE = "api_nodes.json"

    fun getNodes(context: Context): Array<ApiNode> {
        return try {
            // 使用 bufferedReader 并指定 UTF-8 确保编码正确
            val json = context.assets.open(ASSET_FILE).bufferedReader(Charsets.UTF_8).use { it.readText() }
            Gson().fromJson(json, Array<ApiNode>::class.java)
        } catch (e: Exception) {
            android.util.Log.e("ApiNodeService", "Failed to load nodes: ${e.message}")
            // 返回默认节点，防止应用启动失败
            arrayOf(ApiNode("default", "演示节点", "https://api.example.com"))
        }
    }
}
