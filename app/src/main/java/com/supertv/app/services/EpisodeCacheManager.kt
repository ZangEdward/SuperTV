package com.supertv.app.services

import android.content.Context
import com.supertv.app.data.Store
import com.supertv.app.model.Episode
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class EpisodeCacheManager(private val context: Context) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val store = Store.getInstance(context)

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    private val cacheDir = File(context.cacheDir, "episodes").also { it.mkdirs() }
    private val activeTasks = mutableMapOf<String, Job>()
    private val concurrencyLimit = AtomicInteger(3)

    private val _downloadProgress = MutableStateFlow<Map<String, Float>>(emptyMap())
    val downloadProgress: StateFlow<Map<String, Float>> = _downloadProgress.asStateFlow()

    sealed class DownloadState {
        data object Idle : DownloadState()
        data object Downloading : DownloadState()
        data object Completed : DownloadState()
        data class Failed(val error: String) : DownloadState()
    }

    private val _downloadStates = MutableStateFlow<Map<String, DownloadState>>(emptyMap())
    val downloadStates: StateFlow<Map<String, DownloadState>> = _downloadStates.asStateFlow()

    fun startDownload(episode: Episode, videoId: String, title: String) {
        val taskId = "${videoId}_${episode.index}"
        if (activeTasks.containsKey(taskId)) return

        val job = scope.launch {
            var retryCount = 0
            val maxRetries = 3
            var success = false

            while (retryCount < maxRetries && !success) {
                _downloadStates.value = _downloadStates.value + (taskId to DownloadState.Downloading)
                try {
                    val targetFile = File(cacheDir, "${videoId}_ep${episode.index}.mp4")
                    if (targetFile.exists() && targetFile.length() > 0) {
                        _downloadStates.value = _downloadStates.value + (taskId to DownloadState.Completed)
                        _downloadProgress.value = _downloadProgress.value + (taskId to 1f)
                        store.markEpisodeCached(videoId, episode.index)
                        success = true
                        break
                    }

                    val url = episode.url
                    if (url.isBlank()) throw Exception("播放地址为空")

                    downloadFileWithRetry(url, targetFile, taskId)

                    if (targetFile.exists() && targetFile.length() > 0) {
                        _downloadStates.value = _downloadStates.value + (taskId to DownloadState.Completed)
                        _downloadProgress.value = _downloadProgress.value + (taskId to 1f)
                        store.markEpisodeCached(videoId, episode.index)
                        success = true
                    } else {
                        throw Exception("文件下载为空或损坏")
                    }

                } catch (e: Exception) {
                    retryCount++
                    if (retryCount >= maxRetries) {
                        _downloadStates.value = _downloadStates.value + (taskId to DownloadState.Failed(e.message ?: "下载失败"))
                    } else {
                        delay(2000L * retryCount) // 指数退避
                    }
                }
            }
            activeTasks.remove(taskId)
        }
        activeTasks[taskId] = job
    }

    private suspend fun downloadFileWithRetry(url: String, targetFile: File, taskId: String) {
        withContext(Dispatchers.IO) {
            val request = Request.Builder().url(url)
                .header("User-Agent", "Mozilla/5.0 (Android 14) SuperTV/1.0")
                .build()

            val response = client.newCall(request).execute()
            if (!response.isSuccessful) throw Exception("HTTP ${response.code}")

            val body = response.body ?: throw Exception("空响应体")
            val contentLength = body.contentLength()
            val inputStream = body.byteStream()
            val outputStream = targetFile.outputStream()

            var bytesRead: Long = 0
            val buffer = ByteArray(16384) // 增加缓冲区
            var read: Int

            inputStream.use { input ->
                outputStream.use { output ->
                    while (input.read(buffer).also { read = it } != -1) {
                        ensureActive()
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

    fun cancelDownload(videoId: String, episodeIndex: Int) {
        val taskId = "${videoId}_${episodeIndex}"
        activeTasks[taskId]?.cancel()
        activeTasks.remove(taskId)
        _downloadStates.value = _downloadStates.value + (taskId to DownloadState.Idle)
    }

    fun getCacheSize(): Long {
        return cacheDir.walkTopDown().filter { it.isFile }.sumOf { it.length() }
    }

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

    fun destroy() {
        scope.cancel()
    }
}
