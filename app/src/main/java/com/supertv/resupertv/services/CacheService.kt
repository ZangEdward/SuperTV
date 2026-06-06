package com.supertv.resupertv.services

import android.content.Context
import java.io.File

/**
 * 原生缓存管理服务
 * 对应原项目中 cacheService.ts 的逻辑
 */
class CacheService(private val context: Context) {

    fun clearCache() {
        val cacheDir = context.cacheDir
        cacheDir.deleteRecursively()
        val downloadDir = File(context.filesDir, "download")
        if (downloadDir.exists()) {
            downloadDir.deleteRecursively()
        }
    }

    fun getCacheSize(): Long {
        val cacheDir = context.cacheDir
        return cacheDir.walkTopDown().filter { it.isFile }.map { it.length() }.sum()
    }
}
