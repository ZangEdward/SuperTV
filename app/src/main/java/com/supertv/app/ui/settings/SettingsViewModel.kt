package com.supertv.app.ui.settings

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.supertv.app.data.*
import com.supertv.app.model.ApiNode
import com.supertv.app.services.CacheService
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class SettingsViewModel(application: Application) : AndroidViewModel(application) {

    private val store = Store.getInstance(application)
    private val preferenceStore = SearchPreferenceStore.getInstance(application)
    private val appInitializer = AppInitializer.getInstance(application)
    private val cacheService = CacheService.getInstance(application)

    private val _apiNodes = MutableStateFlow<List<ApiNode>>(emptyList())
    val apiNodes: StateFlow<List<ApiNode>> = _apiNodes.asStateFlow()

    val adFilterEnabled = preferenceStore.adFilterEnabled
    val autoPlay = preferenceStore.autoPlay
    val playbackSpeed = preferenceStore.playbackSpeed
    val themeMode = preferenceStore.themeMode

    private val _cacheSize = MutableStateFlow("计算中...")
    val cacheSize: StateFlow<String> = _cacheSize.asStateFlow()

    private val _remoteServerRunning = MutableStateFlow(false)
    val remoteServerRunning: StateFlow<Boolean> = _remoteServerRunning.asStateFlow()

    private val _syncRepo = MutableStateFlow("")
    val syncRepo: StateFlow<String> = _syncRepo.asStateFlow()

    private val _isLoggedIn = MutableStateFlow(false)
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn.asStateFlow()

    private val _loginMessage = MutableStateFlow("")
    val loginMessage: StateFlow<String> = _loginMessage.asStateFlow()

    private val _isLoggingIn = MutableStateFlow(false)
    val isLoggingIn: StateFlow<Boolean> = _isLoggingIn.asStateFlow()

    private val authRepo = AuthRepository.getInstance(application)
    private val syncService = SyncService.getInstance(application)

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
                val api = RetrofitClient.getApiService()
                val result = authRepo.login(api, serverUrl, username, password)
                if (result.isSuccess) {
                    _isLoggedIn.value = true
                    _loginMessage.value = "登录成功"
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
                val api = RetrofitClient.getApiService()
                authRepo.logout(api)
            } catch (_: Exception) {
                authRepo.clearCredentials()
            }
            _isLoggedIn.value = false
            _loginMessage.value = "已退出登录"
        }
    }

    fun toggleAdFilter(enabled: Boolean) {
        viewModelScope.launch {
            preferenceStore.setAdFilterEnabled(enabled)
        }
    }

    fun toggleAutoPlay(enabled: Boolean) {
        viewModelScope.launch {
            preferenceStore.setAutoPlay(enabled)
        }
    }

    fun setPlaybackSpeed(speed: Float) {
        viewModelScope.launch {
            preferenceStore.setPlaybackSpeed(speed)
        }
    }

    fun setThemeMode(mode: String) {
        viewModelScope.launch {
            preferenceStore.setThemeMode(mode)
        }
    }

    fun addApiNode(node: ApiNode) {
        val list = _apiNodes.value.toMutableList()
        list.add(node)
        _apiNodes.value = list
        appInitializer.saveApiNodes(list)
    }

    fun removeApiNode(key: String) {
        val list = _apiNodes.value.toMutableList()
        list.removeAll { it.key == key }
        _apiNodes.value = list
        appInitializer.saveApiNodes(list)
    }

    fun switchApiNode(nodeKey: String) {
        val node = _apiNodes.value.find { it.key == nodeKey } ?: return
        RetrofitClient.switchBaseUrl(node.url)
        viewModelScope.launch {
            preferenceStore.setCurrentApiNode(nodeKey)
        }
    }

    fun setSyncRepo(repo: String) {
        _syncRepo.value = repo
        appInitializer.setSyncRepo(repo)
    }

    fun refreshCacheSize() {
        _cacheSize.value = cacheService.formatSize(cacheService.getCacheSize())
    }

    fun clearCache() {
        cacheService.clearCache()
        refreshCacheSize()
    }

    fun clearThumbnailCache() {
        cacheService.clearThumbnailCache()
        refreshCacheSize()
    }

    fun setRemoteServerRunning(running: Boolean) {
        _remoteServerRunning.value = running
    }
}
