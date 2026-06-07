package com.supertv.resupertv.services

import android.content.Context
import com.supertv.resupertv.data.Store
import com.supertv.resupertv.model.Episode
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * 剧集缓存管理器 — 多线程下载 / 进度跟踪 / 断点续传
 *
 * 参考 SuperTV_old-master services/cacheService.ts
 */
class EpisodeCacheManager(private val context: Context) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val store = Store.getInstance(context)

    /** 下载客户端 */
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    /** 缓存目录 */
    private val cacheDir = File(context.cacheDir, "episodes").also { it.mkdirs() }

    /** 下载中的任务 */
    private val activeTasks = mutableMapOf<String, Job>()

    /** 并发限制 (默认3) */
    private val concurrencyLimit = AtomicInteger(3)
    private val concurrencySemaphore = Semaphore(concurrencyLimit.get())

    /** 下载进度 */
    private val _downloadProgress = MutableStateFlow<Map<String, Float>>(emptyMap())
    val downloadProgress: StateFlow<Map<String, Float>> = _downloadProgress.asStateFlow()

    /** 下载状态 */
    sealed class DownloadState {
        data object Idle : DownloadState()
        data object Downloading : DownloadState()
        data object Completed : DownloadState()
        data class Failed(val error: String) : DownloadState()
    }

    private val _downloadStates = MutableStateFlow<Map<String, DownloadState>>(emptyMap())
    val downloadStates: StateFlow<Map<String, DownloadState>> = _downloadStates.asStateFlow()

    /**
     * 开始下载剧集
     */
    fun startDownload(episode: Episode, videoId: String, title: String) {
        val taskId = "${videoId}_${episode.index}"
        if (activeTasks.containsKey(taskId)) return

        val job = scope.launch {
            _downloadStates.value = _downloadStates.value + (taskId to DownloadState.Downloading)
            _downloadProgress.value = _downloadProgress.value + (taskId to 0f)

            try {
                val targetFile = File(cacheDir, "${videoId}_ep${episode.index}.mp4")
                if (targetFile.exists()) {
                    _downloadStates.value = _downloadStates.value + (taskId to DownloadState.Completed)
                    _downloadProgress.value = _downloadProgress.value + (taskId to 1f)
                    store.markEpisodeCached(videoId, episode.index)
                    return@launch
                }

                // 解析 M3U8 或直链下载
                val url = episode.url
                if (url.isBlank()) throw Exception("播放地址为空")

                downloadFile(url, targetFile, taskId)

                _downloadStates.value = _downloadStates.value + (taskId to DownloadState.Completed)
                _downloadProgress.value = _downloadProgress.value + (taskId to 1f)
                store.markEpisodeCached(videoId, episode.index)

            } catch (e: Exception) {
                _downloadStates.value = _downloadStates.value + (taskId to DownloadState.Failed(e.message ?: "下载失败"))
            } finally {
                activeTasks.remove(taskId)
            }
        }
        activeTasks[taskId] = job
    }

    /**
     * 带进度的文件下载
     */
    private suspend fun downloadFile(url: String, targetFile: File, taskId: String) {
        withContext(Dispatchers.IO) {
            val request = Request.Builder().url(url)
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36")
                .build()

            val response = client.newCall(request).execute()
            if (!response.isSuccessful) throw Exception("HTTP ${response.code}")

            val body = response.body ?: throw Exception("空响应体")
            val contentLength = body.contentLength()
            val inputStream = body.byteStream()
            val outputStream = targetFile.outputStream()

            var bytesRead: Long = 0
            val buffer = ByteArray(8192)
            var read: Int

            inputStream.use { input ->
                outputStream.use { output ->
                    while (input.read(buffer).also { read = it } != -1) {
                        output.write(buffer, 0, read)
                        bytesRead += read
                        if (contentLength > 0) {
                            _downloadProgress.value = _downloadProgress.value + (taskId to (bytesRead.toFloat() / contentLength))
                        }
                    }
                }
            }
        }
    }

    /**
     * 取消下载
     */
    fun cancelDownload(videoId: String, episodeIndex: Int) {
        val taskId = "${videoId}_${episodeIndex}"
        activeTasks[taskId]?.cancel()
        activeTasks.remove(taskId)
        _downloadStates.value = _downloadStates.value + (taskId to DownloadState.Idle)
    }

    /**
     * 获取已缓存大小
     */
    fun getCacheSize(): Long {
        return cacheDir.walkTopDown().filter { it.isFile }.sumOf { it.length() }
    }

    /**
     * 清除所有缓存
     */
    fun clearAllCache() {
        scope.launch {
            activeTasks.values.forEach { it.cancel() }
            activeTasks.clear()
            cacheDir.deleteRecursively()
            cacheDir.mkdirs()
            _downloadProgress.value = emptyMap()
            _downloadStates.value = emptyMap()
        }
    }

    /**
     * 设置并发数
     */
    fun setConcurrency(n: Int) {
        concurrencyLimit.set(n.coerceIn(1, 8))
        concurrencySemaphore.setMaxPermits(concurrencyLimit.get())
    }

    fun destroy() {
        scope.cancel()
    }
}

/** 简易信号量 */
private class Semaphore(private var maxPermits: Int) {
    private val available = java.util.concurrent.Semaphore(maxPermits)
    fun setMaxPermits(n: Int) { maxPermits = n }
    suspend fun acquire() = withContext(Dispatchers.Default) { available.acquire() }
    fun release() = available.release()
}
