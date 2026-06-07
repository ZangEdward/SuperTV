package com.supertv.app.services

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import android.util.LruCache
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import java.security.MessageDigest
import java.util.*
import kotlin.collections.LinkedHashSet

/**
 * 缓存服务 - 参�?Selene-Source 的缓存架�?
 *
 * 三层缓存策略�?
 * 1. 内存缓存 (LruCache) - 最快，有限容量
 * 2. 磁盘缓存 (JSON/File) - 持久化，有过期时�?
 * 3. 网络加载 - 兜底
 *
 * 特性：
 * - CacheItem 带时间戳和过期时�?
 * - 自动清理过期缓存（启动时 + 定时器）
 * - LRU 淘汰策略
 * - 缩略�?WEBP 格式存储
 * - 防盗链和 CDN 替换
 */
class CacheService(private val context: Context) {

    companion object {
        private const val TAG = "CacheService"

        // 目录
        private const val DIR_CACHE = "supertv_cache"
        private const val DIR_THUMBNAIL = "thumbnails"
        private const val DIR_API = "api_cache"
        private const val DIR_VIDEO = "videos"

        // 容量限制
        private const val MAX_MEM_CACHE_ENTRIES = 200          // 内存最�?200 �?
        private const val MAX_DISK_CACHE_ENTRIES = 2000        // 磁盘最�?2000 �?
        private const val MAX_API_CACHE_ENTRIES = 500          // API 缓存最�?500 �?

        // TTL（毫秒）
        private const val TTL_THUMBNAIL = 7 * 24 * 60 * 60 * 1000L   // 缩略�?7 �?
        private const val TTL_API_DEFAULT = 10 * 60 * 1000L          // API 10 分钟
        private const val TTL_SEARCH = 5 * 60 * 1000L                // 搜索 5 分钟
        private const val CLEANUP_INTERVAL = 5 * 60 * 1000L          // 清理间隔 5 分钟

        // 缩略图尺�?
        private const val THUMB_WIDTH = 200
        private const val THUMB_HEIGHT = 300

        @Volatile
        private var instance: CacheService? = null

        fun getInstance(context: Context): CacheService {
            return instance ?: synchronized(this) {
                instance ?: CacheService(context.applicationContext).also { instance = it }
            }
        }
    }

    // ==================== 数据结构 ====================

    /**
     * 缓存�?- 参�?Selene �?CacheItem<T>
     */
    data class CacheItem<T>(
        val data: T,
        val timestamp: Long = System.currentTimeMillis(),
        val ttl: Long = TTL_API_DEFAULT
    ) {
        val isExpired: Boolean get() = System.currentTimeMillis() - timestamp > ttl
    }

    // ==================== 内存缓存 ====================

    // 缩略图内存缓�?
    private val memoryCache = object : LruCache<String, Bitmap>(MAX_MEM_CACHE_ENTRIES) {
        override fun sizeOf(key: String, bitmap: Bitmap): Int = bitmap.byteCount / 1024
    }

    // API 数据内存缓存
    private val apiMemoryCache = Collections.synchronizedMap(
        object : LinkedHashMap<String, CacheItem<Any>>(100, 0.75f, true) {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, CacheItem<Any>>?): Boolean {
                return size > MAX_API_CACHE_ENTRIES
            }
        }
    )

    // ==================== 磁盘目录 ====================

    private val cacheDir = File(context.cacheDir, DIR_CACHE)
    private val thumbnailDir = File(cacheDir, DIR_THUMBNAIL)
    private val apiCacheDir = File(cacheDir, DIR_API)
    private val videoDir = File(context.getExternalFilesDir(null), DIR_VIDEO)

    // ==================== 下载状�?====================

    private val _downloadProgress = MutableStateFlow<Map<String, Float>>(emptyMap())
    val downloadProgress: StateFlow<Map<String, Float>> = _downloadProgress.asStateFlow()

    private val _downloadingItems = MutableStateFlow<Set<String>>(emptySet())
    val downloadingItems: StateFlow<Set<String>> = _downloadingItems.asStateFlow()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var cleanupJob: Job? = null

    init {
        listOf(cacheDir, thumbnailDir, apiCacheDir, videoDir).forEach { it.mkdirs() }
        cleanupExpiredCache()
        startCleanupTimer()
    }

    // ==================== 过期清理（参�?LocalSearchCacheService�?====================

    /**
     * 启动定时清理
     */
    private fun startCleanupTimer() {
        cleanupJob = scope.launch {
            while (isActive) {
                delay(CLEANUP_INTERVAL)
                cleanupExpiredCache()
            }
        }
    }

    /**
     * 清理过期缓存�?
     */
    fun cleanupExpiredCache(): CleanupResult {
        val now = System.currentTimeMillis()
        var expiredRemoved = 0
        var sizeLimitedRemoved = 0

        // 1. 清理过期 API 磁盘缓存
        apiCacheDir.listFiles()?.forEach { file ->
            try {
                val item = readCacheItemFromFile(file)
                if (item != null && item.isExpired) {
                    file.delete()
                    expiredRemoved++
                }
            } catch (_: Exception) {
                file.delete()
                expiredRemoved++
            }
        }

        // 2. 如果超出数量限制，清理最老的
        val files = apiCacheDir.listFiles()?.sortedBy { it.lastModified() } ?: emptyList()
        if (files.size > MAX_API_CACHE_ENTRIES) {
            val toRemove = files.size - MAX_API_CACHE_ENTRIES
            files.take(toRemove).forEach { it.delete() }
            sizeLimitedRemoved = toRemove
        }

        // 3. 清理内存中过期项
        apiMemoryCache.entries.removeAll { it.value.isExpired }

        Log.d(TAG, "缓存清理: 过期=$expiredRemoved, 超限=$sizeLimitedRemoved, 剩余=${apiCacheDir.listFiles()?.size ?: 0}")

        return CleanupResult(expiredRemoved, sizeLimitedRemoved, apiCacheDir.listFiles()?.size ?: 0)
    }

    data class CleanupResult(
        val expiredRemoved: Int,
        val sizeLimitedRemoved: Int,
        val remainingEntries: Int
    )

    // ==================== 缩略图三级缓存（参�?Selene DoubanCacheService + VideoCard�?====================

    /**
     * 获取缩略�?- 内存 �?磁盘 �?网络
     */
    suspend fun getThumbnail(
        url: String,
        source: String? = null,
        reqWidth: Int = THUMB_WIDTH,
        reqHeight: Int = THUMB_HEIGHT
    ): Bitmap? {
        val processedUrl = ImageUrlHelper.processImageUrl(url, source)
        val key = md5(processedUrl)

        // 1. 内存缓存
        memoryCache.get(key)?.let { return it }

        // 2. 磁盘缓存（检查过期）
        val diskFile = File(thumbnailDir, "$key.webp")
        if (diskFile.exists()) {
            val item = readCacheItemFromFile(File(thumbnailDir, "$key.meta"))
            if (item != null && !item.isExpired) {
                try {
                    val bitmap = BitmapFactory.decodeFile(diskFile.absolutePath)
                    if (bitmap != null) {
                        memoryCache.put(key, bitmap)
                        return bitmap
                    }
                } catch (_: Exception) {
                    diskFile.delete()
                }
            } else {
                // 过期则删�?
                diskFile.delete()
                File(thumbnailDir, "$key.meta").delete()
            }
        }

        // 3. 网络加载（带防盗链头�?
        return withContext(Dispatchers.IO) {
            try {
                val connection = URL(processedUrl).openConnection().apply {
                    connectTimeout = 5000
                    readTimeout = 5000
                    // 防盗链头 - 参�?Selene getImageRequestHeaders
                    setRequestProperty("Referer", "https://movie.douban.com/")
                    setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36")
                    setRequestProperty("Accept", "image/avif,image/webp,image/apng,*/*")
                }

                val inputStream = connection.getInputStream()
                val originalBitmap = BitmapFactory.decodeStream(inputStream)
                inputStream.close()

                if (originalBitmap != null) {
                    // 按需缩放 - 参�?Selene memCacheWidth/memCacheHeight
                    val scaled = if (originalBitmap.width > reqWidth || originalBitmap.height > reqHeight) {
                        Bitmap.createScaledBitmap(originalBitmap, reqWidth, reqHeight, true)
                    } else originalBitmap
                    if (scaled !== originalBitmap) originalBitmap.recycle()

                    // 保存磁盘（WEBP 格式 + metadata�?
                    withContext(Dispatchers.IO) {
                        FileOutputStream(diskFile).use { scaled.compress(Bitmap.CompressFormat.WEBP, 85, it) }
                        // 保存元数据（过期时间�?
                        saveCacheItemToFile(File(thumbnailDir, "$key.meta"), CacheItem(true, ttl = TTL_THUMBNAIL))
                    }

                    memoryCache.put(key, scaled)
                    return@withContext scaled
                }
            } catch (e: Exception) {
                Log.w(TAG, "缩略图加载失�? $url", e)
            }
            null
        }
    }

    /**
     * 批量预加载缩略图
     */
    fun preloadThumbnails(urls: List<String>, source: String? = null) {
        scope.launch {
            urls.forEach { url ->
                launch { getThumbnail(url, source) }
            }
        }
    }

    // ==================== API 数据缓存（参�?Selene LocalSearchCacheService�?====================

    /**
     * 获取 API 缓存数据
     */
    fun <T> getApiCache(key: String): CacheItem<T>? {
        // 1. 内存
        @Suppress("UNCHECKED_CAST")
        val memItem = apiMemoryCache[key] as? CacheItem<T>
        if (memItem != null) {
            if (!memItem.isExpired) return memItem
            apiMemoryCache.remove(key)
        }

        // 2. 磁盘
        val file = File(apiCacheDir, "${md5(key)}.json")
        if (file.exists()) {
            val item = readCacheItemFromFile(file)
            if (item != null && !item.isExpired) {
                @Suppress("UNCHECKED_CAST")
                (item as? CacheItem<T>)?.let {
                    apiMemoryCache[key] = it as CacheItem<Any>
                    return it
                }
            } else {
                file.delete()
            }
        }
        return null
    }

    /**
     * 设置 API 缓存数据
     */
    fun <T> setApiCache(key: String, data: T, ttl: Long = TTL_API_DEFAULT) {
        val item = CacheItem(data, ttl = ttl)
        apiMemoryCache[key] = item as CacheItem<Any>

        // 异步写磁�?
        scope.launch {
            try {
                val file = File(apiCacheDir, "${md5(key)}.json")
                saveCacheItemToFile(file, item)
            } catch (_: Exception) {}
        }
    }

    /**
     * 清除指定 API 缓存
     */
    fun clearApiCache(key: String) {
        apiMemoryCache.remove(key)
        File(apiCacheDir, "${md5(key)}.json").delete()
    }

    // ==================== 视频缓存 ====================

    /**
     * 下载视频文件
     */
    suspend fun downloadVideo(
        id: String, url: String, fileName: String,
        onProgress: ((Float) -> Unit)? = null
    ): String? {
        val taskId = "$id-$fileName"
        _downloadingItems.value = _downloadingItems.value + taskId

        return withContext(Dispatchers.IO) {
            try {
                val targetFile = File(videoDir, fileName)
                if (targetFile.exists()) {
                    _downloadingItems.value = _downloadingItems.value - taskId
                    return@withContext targetFile.absolutePath
                }

                val connection = URL(url).openConnection().apply {
                    connectTimeout = 10000
                    readTimeout = 30000
                }
                val totalBytes = connection.contentLengthLong
                val inputStream = connection.getInputStream()

                FileOutputStream(targetFile).use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    var totalRead = 0L
                    while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        totalRead += bytesRead
                        if (totalBytes > 0) {
                            val progress = totalRead.toFloat() / totalBytes
                            onProgress?.invoke(progress)
                            _downloadProgress.value = _downloadProgress.value + (taskId to progress)
                        }
                    }
                }
                inputStream.close()
                _downloadProgress.value = _downloadProgress.value - taskId
                _downloadingItems.value = _downloadingItems.value - taskId
                targetFile.absolutePath
            } catch (e: Exception) {
                Log.e(TAG, "下载失败: $url", e)
                _downloadingItems.value = _downloadingItems.value - taskId
                null
            }
        }
    }

    // ==================== 统计与管�?====================

    fun getCacheSize(): Long {
        return (cacheDir.walkTopDown().filter { it.isFile }.sumOf { it.length() } +
                videoDir.walkTopDown().filter { it.isFile }.sumOf { it.length() })
    }

    fun formatSize(bytes: Long): String = when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> "${bytes / 1024} KB"
        bytes < 1024 * 1024 * 1024 -> "%.1f MB".format(bytes.toDouble() / (1024 * 1024))
        else -> "%.2f GB".format(bytes.toDouble() / (1024 * 1024 * 1024))
    }

    fun getCacheStats(): CacheStats {
        val thumbCount = thumbnailDir.listFiles()?.count { it.extension == "webp" } ?: 0
        val apiCount = apiCacheDir.listFiles()?.size ?: 0
        val videoCount = videoDir.listFiles()?.size ?: 0
        return CacheStats(
            thumbnailCount = thumbCount,
            apiCacheCount = apiCount,
            videoCount = videoCount,
            totalSize = getCacheSize(),
            memCacheSize = memoryCache.size()
        )
    }

    data class CacheStats(
        val thumbnailCount: Int,
        val apiCacheCount: Int,
        val videoCount: Int,
        val totalSize: Long,
        val memCacheSize: Int
    )

    fun clearAll() {
        cacheDir.listFiles()?.forEach { if (it.isDirectory) it.deleteRecursively() else it.delete() }
        memoryCache.evictAll()
        apiMemoryCache.clear()
        listOf(thumbnailDir, apiCacheDir).forEach { it.mkdirs() }
    }

    fun clearCache() = clearAll()

    fun clearThumbnailCache() {
        thumbnailDir.listFiles()?.forEach { it.delete() }
        memoryCache.evictAll()
    }

    fun clearVideoCache() {
        videoDir.listFiles()?.forEach { it.delete() }
    }

    fun getVideoFile(fileName: String): File? = File(videoDir, fileName).takeIf { it.exists() }

    fun destroy() {
        cleanupJob?.cancel()
        scope.cancel()
    }

    // ==================== 工具方法 ====================

    private fun md5(input: String): String =
        MessageDigest.getInstance("MD5").digest(input.toByteArray())
            .joinToString("") { "%02x".format(it) }

    private fun <T> saveCacheItemToFile(file: File, item: CacheItem<T>) {
        // 简化实现：�?JSON 序列化存�?
        file.outputStream().use { os ->
            os.write("""{"timestamp":${item.timestamp},"ttl":${item.ttl}}""".toByteArray())
        }
    }

    private fun readCacheItemFromFile(file: File): CacheItem<*>? {
        if (!file.exists()) return null
        return try {
            val text = file.readText()
            val ts = Regex("""timestamp[:=](\d+)""").find(text)?.groupValues?.get(1)?.toLongOrNull() ?: return null
            val ttl = Regex("""ttl[:=](\d+)""").find(text)?.groupValues?.get(1)?.toLongOrNull() ?: TTL_API_DEFAULT
            CacheItem<Any>(true, timestamp = ts, ttl = ttl)
        } catch (_: Exception) { null }
    }
}

/**
 * 图片 URL 处理工具 - 参�?Selene image_url.dart
 *
 * 功能�?
 * - CDN 域名替换（官�?�?加速CDN�?
 * - 防盗�?Referer/UA �?
 */
object ImageUrlHelper {

    private val DOUBAN_DOMAIN_REGEX = Regex("""img\d+\.doubanio\.com""")

    /**
     * 处理图片 URL，根据来源替�?CDN 域名
     */
    fun processImageUrl(originalUrl: String, source: String? = null): String {
        if (originalUrl.isBlank()) return originalUrl

        return when (source) {
            "douban" -> originalUrl.replace(DOUBAN_DOMAIN_REGEX, "img3.doubanio.com")
            else -> originalUrl
        }
    }

    /**
     * 获取图片请求头（防盗链）
     */
    fun getImageHeaders(imageUrl: String, source: String? = null): Map<String, String> {
        val isDouban = source == "douban" || imageUrl.contains("doubanio.com") || imageUrl.contains("douban.com")

        return if (isDouban) {
            mapOf(
                "Referer" to "https://movie.douban.com/",
                "User-Agent" to "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36",
                "Accept" to "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
            )
        } else {
            mapOf(
                "User-Agent" to "SuperTV/1.0 (Android)"
            )
        }
    }
}
