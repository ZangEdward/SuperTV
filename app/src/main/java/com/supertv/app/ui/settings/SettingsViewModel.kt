package com.supertv.app.ui.settings

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.supertv.app.data.AppInitializer
import com.supertv.app.data.SearchPreferenceStore
import com.supertv.app.data.Store
import com.supertv.app.model.ApiNode
import com.supertv.app.services.CacheService
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
    private val _cacheSize = MutableStateFlow("计算�?..")
    val cacheSize: StateFlow<String> = _cacheSize.asStateFlow()

    // 远程控制
    private val _remoteServerRunning = MutableStateFlow(false)
    val remoteServerRunning: StateFlow<Boolean> = _remoteServerRunning.asStateFlow()

    // OTA 同步仓库
    private val _syncRepo = MutableStateFlow("")
    val syncRepo: StateFlow<String> = _syncRepo.asStateFlow()

    // 登录状�?
    private val _isLoggedIn = MutableStateFlow(false)
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn.asStateFlow()

    private val _loginMessage = MutableStateFlow("")
    val loginMessage: StateFlow<String> = _loginMessage.asStateFlow()

    private val _isLoggingIn = MutableStateFlow(false)
    val isLoggingIn: StateFlow<Boolean> = _isLoggingIn.asStateFlow()

    private val authRepo = com.supertv.app.data.AuthRepository.getInstance(application)
    private val syncService = com.supertv.app.data.SyncService.getInstance(application)

    init {
        _apiNodes.value = appInitializer.initializeApiNodes()
        _syncRepo.value = appInitializer.getSyncRepo()
        _isLoggedIn.value = authRepo.isLoggedIn()
        refreshCacheSize()
    }

    fun login(serverUrl: String, username: String, password: String) {
        viewModelScope.launch {
            _isLoggingIn.value = true
            _loginMessage.value = ""
            try {
                val api = com.supertv.app.data.RetrofitClient.getApiService()
                val result = authRepo.login(api, serverUrl, username, password)
                if (result.isSuccess) {
                    _isLoggedIn.value = true
                    _loginMessage.value = "登录成功"
                    // 同步数据
                    syncService.syncAll()
                } else {
                    _loginMessage.value = result.exceptionOrNull()?.message ?: "登录失败"
                }
            } catch (e: Exception) {
                _loginMessage.value = "连接失败: ${e.localizedMessage}"
            } finally {
                _isLoggingIn.value = false
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            try {
                val api = com.supertv.app.data.RetrofitClient.getApiService()
                authRepo.logout(api)
            } catch (_: Exception) {
                authRepo.clearCredentials()
            }
            _isLoggedIn.value = false
            _loginMessage.value = "已退出登�?
        }
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
        com.supertv.app.data.RetrofitClient.switchBaseUrl(node.url)
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
     * 清除缩略图缓�?
     */
    fun clearThumbnailCache() {
        cacheService.clearThumbnailCache()
        refreshCacheSize()
    }

    /**
     * 设置远程服务器状�?
     */
    fun setRemoteServerRunning(running: Boolean) {
        _remoteServerRunning.value = running
    }
}
