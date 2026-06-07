package com.supertv.app.services

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
 * 测速服�?- 对应原项目的 services/speedTestService.ts
 *
 * 通过小样本并发RTT探测延迟，加权评分排�?
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
     * 测试单个URL的延�?
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
     * 计算加权评分 �?�?Selene _calculateSourceScore
     * 综合延迟评分 (满分100)，数字越高越�?
     */
    fun calculateScore(latency: Long): Double {
        if (latency == Long.MAX_VALUE) return 0.0
        // 延迟评分 �?线性映射，越低分越�?
        val pingScore = when {
            latency < 50 -> 100.0
            latency < 100 -> 90.0
            latency < 200 -> 75.0
            latency < 300 -> 60.0
            latency < 500 -> 40.0
            latency < 1000 -> 25.0
            else -> 10.0
        }
        return pingScore
    }

    /**
     * 获取延迟对应的显示等�?(S/A/B/C/D)
     */
    fun getLatencyGrade(latency: Long): String {
        return when {
            latency >= Long.MAX_VALUE -> "F"
            latency < 50 -> "S"
            latency < 100 -> "A"
            latency < 200 -> "B"
            latency < 300 -> "C"
            latency < 500 -> "D"
            else -> "E"
        }
    }

    /**
     * 格式化延迟显�?
     */
    fun formatLatency(latency: Long): String {
        return when {
            latency >= Long.MAX_VALUE -> "超时"
            latency < 1000 -> "${latency}ms"
            else -> "${latency / 1000}.${(latency % 1000) / 100}s"
        }
    }

    /**
     * 获取最优节�?
     */
    /**
     * 获取最优节�?(延迟最�?
     */
    fun getBestNode(): String? {
        val sorted = _latencies.value.entries
            .filter { it.value != Long.MAX_VALUE }
            .sortedBy { it.value }
        return sorted.firstOrNull()?.key
    }

    /**
     * 根据测速结果排序源 (评分从高到低)
     */
    fun sortByScore(sources: List<Pair<String, Long>>): List<Pair<String, Long>> {
        return sources.sortedByDescending { calculateScore(it.second) }
    }

    fun destroy() {
        scope.cancel()
    }
}
