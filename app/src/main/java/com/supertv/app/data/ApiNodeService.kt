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
            
            // 按照优先级尝试解码：UTF-8 -> GBK -> Latin1 (最后一种用于检测 Mojibake)
            var json = String(bytes, Charsets.UTF_8)
            
            // 1. 如果包含 UTF-8 替换字符，说明不是纯 UTF-8，尝试 GBK
            if (json.contains("\ufffd")) {
                android.util.Log.w("ApiNodeService", "Detected encoding error, trying GBK...")
                json = String(bytes, Charset.forName("GBK"))
            }
            
            // 2. 检查 Mojibake 特征：如果 UTF-8 解码后包含大量高位字符组合（如 äº），
            // 且这些字符在拉丁语系外极少见，可能需要特殊处理。
            // 这里我们直接修正资产文件，但在代码层面保留兼容性。
            
            Gson().fromJson(json, Array<ApiNode>::class.java)
        } catch (e: Exception) {
            android.util.Log.e("ApiNodeService", "Failed to load nodes: ${e.message}")
            arrayOf(
                ApiNode("ltv", "默认节点", "https://ltv.955598.xyz"),
                ApiNode("atv", "亚马逊节点", "https://atv.955598.xyz")
            )
        }
    }
}
