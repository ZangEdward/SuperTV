package com.supertv.resupertv.data

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * 应用初始化器
 * 确保 Storage 配置在应用启动时即刻加载生效
 */
object AppInitializer {
    private val scope = CoroutineScope(Dispatchers.IO)

    fun initialize(context: Context) {
        scope.launch {
            // 在后台异步读取 DataStore 配置
            val (apiUrl, _) = Store.getSettings(context)
            if (apiUrl.isNotEmpty()) {
                RetrofitClient.setBaseUrl(apiUrl)
            }
        }
    }
}
