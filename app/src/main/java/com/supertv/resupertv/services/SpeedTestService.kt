package com.supertv.resupertv.services

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * 测速服务 - 对应原项目的 services/speedTestService.ts
 *
 * 通过小样本并发RTT探测延迟，加权评分排序
 */
class SpeedTestService {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private val _latencies = MutableStateFlow<Map<String, Long>>(emptyMap())
    val latencies: StateFlow<Map<String, Long>> = _latencies.asStateFlow()

    private val _isTesting = MutableStateFlow(false)
    val isTesting: StateFlow<Boolean> = _isTesting.asStateFlow()

    /**
     * 测试单个URL的延迟
     */
    suspend fun testLatency(url: String): Long {
        return withContext(Dispatchers.IO) {
            val startTime = System.currentTimeMillis()
            try {
                val request = Request.Builder()
                    .url(url)
                    .header("Range", "bytes=0-1024")
                    .build()
                val response = client.newCall(request).execute()
                response.close()
                System.currentTimeMillis() - startTime
            } catch (e: Exception) {
                Long.MAX_VALUE
            }
        }
    }

    /**
     * 并行测速多个URL
     */
    suspend fun testAll(urls: Map<String, String>): Map<String, Long> {
        _isTesting.value = true
        val results = mutableMapOf<String, Long>()

        coroutineScope {
            val deferredList = urls.map { (key, url) ->
                async {
                    key to testLatency(url)
                }
            }
            deferredList.forEach { deferred ->
                val (key, latency) = deferred.await()
                results[key] = latency
            }
        }

        _latencies.value = results
        _isTesting.value = false
        return results
    }

    /**
     * 计算加权评分
     * 综合考虑延迟(30%)、稳定性(70%)
     */
    fun calculateScore(latency: Long): Double {
        if (latency == Long.MAX_VALUE) return 0.0
        // 延迟越低，分数越高 (满分100)
        val latencyScore = when {
            latency < 100 -> 95.0
            latency < 300 -> 80.0
            latency < 500 -> 60.0
            latency < 1000 -> 40.0
            else -> 20.0
        }
        return latencyScore
    }

    /**
     * 获取最优节点
     */
    fun getBestNode(): String? {
        val sorted = _latencies.value.entries
            .filter { it.value != Long.MAX_VALUE }
            .sortedBy { it.value }
        return sorted.firstOrNull()?.key
    }

    fun destroy() {
        scope.cancel()
    }
}
