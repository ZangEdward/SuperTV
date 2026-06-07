package com.supertv.app.data

import android.content.Context
import com.google.gson.Gson
import com.supertv.app.model.ApiNode
import java.io.IOException

object ApiNodeService {
    private const val ASSET_FILE = "api_nodes.json"

    fun getNodes(context: Context): Array<ApiNode> {
        return try {
            val json = context.assets.open(ASSET_FILE).bufferedReader().use { it.readText() }
            Gson().fromJson(json, Array<ApiNode>::class.java)
        } catch (e: IOException) {
            // 返回默认节点，防止应用启动失�?
            arrayOf(ApiNode("default", "演示节点", "https://api.example.com"))
        }
    }
}
