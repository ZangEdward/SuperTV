package com.supertv.resupertv.services

import kotlinx.coroutines.*
import java.net.HttpURLConnection
import java.net.URL
import kotlin.system.measureTimeMillis

/**
 * 节点测速服务
 * 对应原项目中 speedTestService.ts 的逻辑
 */
class SpeedTestService {
    suspend fun testNodeSpeed(url: String): Long = withContext(Dispatchers.IO) {
        measureTimeMillis {
            try {
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.connectTimeout = 3000
                connection.connect()
                connection.disconnect()
            } catch (e: Exception) {
                // 测速失败视为高延迟
            }
        }
    }
}
