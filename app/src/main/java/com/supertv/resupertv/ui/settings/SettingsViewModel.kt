package com.supertv.resupertv.ui.settings

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.supertv.resupertv.data.AppInitializer
import com.supertv.resupertv.data.SearchPreferenceStore
import com.supertv.resupertv.data.Store
import com.supertv.resupertv.model.ApiNode
import com.supertv.resupertv.services.CacheService
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * 设置 ViewModel - 对应原项目的 stores/settingsStore.ts
 *
 * 管理应用配置、API节点、缓存设置等
 */
class SettingsViewModel(application: Application) : AndroidViewModel(application) {

    private val store = Store.getInstance(application)
    private val preferenceStore = SearchPreferenceStore.getInstance(application)
    private val appInitializer = AppInitializer.getInstance(application)
    private val cacheService = CacheService.getInstance(application)

    // API 节点
    private val _apiNodes = MutableStateFlow<List<ApiNode>>(emptyList())
    val apiNodes: StateFlow<List<ApiNode>> = _apiNodes.asStateFlow()

    // 广告过滤
    val adFilterEnabled = preferenceStore.adFilterEnabled

    // 自动播放
    val autoPlay = preferenceStore.autoPlay

    // 播放速度
    val playbackSpeed = preferenceStore.playbackSpeed

    // 主题模式
    val themeMode = preferenceStore.themeMode

    // 缓存大小
    private val _cacheSize = MutableStateFlow("计算中...")
    val cacheSize: StateFlow<String> = _cacheSize.asStateFlow()

    // 远程控制
    private val _remoteServerRunning = MutableStateFlow(false)
    val remoteServerRunning: StateFlow<Boolean> = _remoteServerRunning.asStateFlow()

    // OTA 同步仓库
    private val _syncRepo = MutableStateFlow("")
    val syncRepo: StateFlow<String> = _syncRepo.asStateFlow()

    init {
        _apiNodes.value = appInitializer.initializeApiNodes()
        _syncRepo.value = appInitializer.getSyncRepo()
        refreshCacheSize()
    }

    /**
     * 切换广告过滤
     */
    fun toggleAdFilter(enabled: Boolean) {
        viewModelScope.launch {
            preferenceStore.setAdFilterEnabled(enabled)
        }
    }

    /**
     * 切换自动播放
     */
    fun toggleAutoPlay(enabled: Boolean) {
        viewModelScope.launch {
            preferenceStore.setAutoPlay(enabled)
        }
    }

    /**
     * 设置播放速度
     */
    fun setPlaybackSpeed(speed: Float) {
        viewModelScope.launch {
            preferenceStore.setPlaybackSpeed(speed)
        }
    }

    /**
     * 设置主题
     */
    fun setThemeMode(mode: String) {
        viewModelScope.launch {
            preferenceStore.setThemeMode(mode)
        }
    }

    /**
     * 添加 API 节点
     */
    fun addApiNode(node: ApiNode) {
        val list = _apiNodes.value.toMutableList()
        list.add(node)
        _apiNodes.value = list
        appInitializer.saveApiNodes(list)
    }

    /**
     * 删除 API 节点
     */
    fun removeApiNode(key: String) {
        val list = _apiNodes.value.toMutableList()
        list.removeAll { it.key == key }
        _apiNodes.value = list
        appInitializer.saveApiNodes(list)
    }

    /**
     * 切换当前 API 节点
     */
    fun switchApiNode(nodeKey: String) {
        val node = _apiNodes.value.find { it.key == nodeKey } ?: return
        com.supertv.resupertv.data.RetrofitClient.switchBaseUrl(node.url)
        viewModelScope.launch {
            preferenceStore.setCurrentApiNode(nodeKey)
        }
    }

    /**
     * 更新同步仓库
     */
    fun setSyncRepo(repo: String) {
        _syncRepo.value = repo
        appInitializer.setSyncRepo(repo)
    }

    /**
     * 刷新缓存大小
     */
    fun refreshCacheSize() {
        _cacheSize.value = cacheService.formatSize(cacheService.getCacheSize())
    }

    /**
     * 清除缓存
     */
    fun clearCache() {
        cacheService.clearCache()
        refreshCacheSize()
    }

    /**
     * 清除缩略图缓存
     */
    fun clearThumbnailCache() {
        cacheService.clearThumbnailCache()
        refreshCacheSize()
    }

    /**
     * 设置远程服务器状态
     */
    fun setRemoteServerRunning(running: Boolean) {
        _remoteServerRunning.value = running
    }
}
