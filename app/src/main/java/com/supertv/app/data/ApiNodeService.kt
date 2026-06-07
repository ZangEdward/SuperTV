package com.supertv.app.data

import android.content.Context
import com.google.gson.Gson
import com.supertv.app.model.ApiNode
import java.nio.charset.Charset

object ApiNodeService {
    private const val ASSET_FILE = "api_nodes.json"

    fun getNodes(context: Context): Array<ApiNode> {
        return try {
            // 显式使用 UTF-8 编码读取，并处理可能的异常
            val inputStream = context.assets.open(ASSET_FILE)
            val size = inputStream.available()
            val buffer = ByteArray(size)
            inputStream.read(buffer)
            inputStream.close()
            val json = String(buffer, Charset.forName("UTF-8"))
            
            Gson().fromJson(json, Array<ApiNode>::class.java)
        } catch (e: Exception) {
            android.util.Log.e("ApiNodeService", "Failed to load nodes: ${e.message}")
            // 返回默认节点，防止应用启动失败
            arrayOf(ApiNode("default", "演示节点", "https://api.example.com"))
        }
    }
}
