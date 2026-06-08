package com.supertv.app.data

import android.content.Context
import com.google.gson.Gson
import com.supertv.app.model.ApiNode
import java.nio.charset.Charset

object ApiNodeService {
    private const val ASSET_FILE = "api_nodes.json"

    fun getNodes(context: Context): Array<ApiNode> {
        return try {
            val bytes = context.assets.open(ASSET_FILE).use { it.readBytes() }
            // 尝试以 UTF-8 读取
            var json = String(bytes, Charsets.UTF_8)
            
            // 启发式检测：如果包含乱码字符（常见于 GBK 被当做 UTF-8 读取），尝试用 GBK 重新读取
            // 简单的检测方法：如果包含 replacement character 或者非打印字符比例过高
            if (json.contains("\ufffd")) {
                 json = String(bytes, Charset.forName("GBK"))
            }
            
            Gson().fromJson(json, Array<ApiNode>::class.java)
        } catch (e: Exception) {
            android.util.Log.e("ApiNodeService", "Failed to load nodes: ${e.message}")
            // 兜底方案：如果还是失败，尝试用 GBK
            try {
                val json = context.assets.open(ASSET_FILE).bufferedReader(Charset.forName("GBK")).use { it.readText() }
                Gson().fromJson(json, Array<ApiNode>::class.java)
            } catch (e2: Exception) {
                arrayOf(ApiNode("default", "演示节点", "https://api.example.com"))
            }
        }
    }
}
