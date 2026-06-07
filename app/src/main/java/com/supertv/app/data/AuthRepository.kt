package com.supertv.app.data

import android.content.Context
import android.content.SharedPreferences
import com.supertv.app.api.ApiService
import com.supertv.app.api.LoginResponse
import com.supertv.app.api.UserInfo
import com.supertv.app.model.Favorite
import com.supertv.app.model.PlayRecord
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 认证与同步仓�?- 参考旧项目�?authStore.ts + storage.ts
 */
class AuthRepository private constructor(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("auth", Context.MODE_PRIVATE)
    private val gson = Gson()

    companion object {
        @Volatile
        private var instance: AuthRepository? = null

        private const val KEY_TOKEN = "token"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_USERNAME = "username"
        private const val KEY_PASSWORD = "password"
        private const val KEY_USER_INFO = "user_info"

        fun getInstance(context: Context): AuthRepository {
            return instance ?: synchronized(this) {
                instance ?: AuthRepository(context.applicationContext).also { instance = it }
            }
        }
    }

    /** 是否已登�?*/
    fun isLoggedIn(): Boolean = prefs.contains(KEY_TOKEN)

    /** 获取 token */
    fun getToken(): String? = prefs.getString(KEY_TOKEN, null)

    /** 获取用户信息 */
    fun getUserInfo(): UserInfo? {
        val json = prefs.getString(KEY_USER_INFO, null) ?: return null
        return try { gson.fromJson(json, UserInfo::class.java) } catch (_: Exception) { null }
    }

    /** 获取服务器地址 */
    fun getServerUrl(): String = prefs.getString(KEY_SERVER_URL, "") ?: ""

    /** 登录 */
    suspend fun login(apiService: ApiService, serverUrl: String, username: String, password: String): Result<LoginResponse> {
        return withContext(Dispatchers.IO) {
            try {
                RetrofitClient.switchBaseUrl(serverUrl)
                val api = RetrofitClient.getApiService()
                val response = api.login(username, password)
                if (response.isSuccessful && response.body() != null) {
                    val loginResp = response.body()!!
                    if (loginResp.success) {
                        saveCredentials(serverUrl, username, password, loginResp.token, loginResp.user)
                        Result.success(loginResp)
                    } else {
                        Result.failure(Exception(loginResp.message.ifBlank { "登录失败" }))
                    }
                } else {
                    Result.failure(Exception("服务器错�? ${response.code()}"))
                }
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    /** 登出 */
    suspend fun logout(apiService: ApiService) {
        withContext(Dispatchers.IO) {
            try { apiService.logout() } catch (_: Exception) {}
        }
        clearCredentials()
    }

    /** 保存凭据 */
    private fun saveCredentials(serverUrl: String, username: String, password: String, token: String, user: UserInfo?) {
        prefs.edit()
            .putString(KEY_SERVER_URL, serverUrl)
            .putString(KEY_USERNAME, username)
            .putString(KEY_PASSWORD, password)
            .putString(KEY_TOKEN, token)
            .putString(KEY_USER_INFO, if (user != null) gson.toJson(user) else null)
            .apply()
    }

    /** 清除凭据 */
    fun clearCredentials() {
        prefs.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_USER_INFO)
            .apply()
    }

    /** 获取保存的用户名 */
    fun getSavedUsername(): String = prefs.getString(KEY_USERNAME, "") ?: ""

    /** 获取保存的密�?*/
    fun getSavedPassword(): String = prefs.getString(KEY_PASSWORD, "") ?: ""

    /** 尝试自动登录 */
    suspend fun tryAutoLogin(apiService: ApiService): Boolean {
        val serverUrl = getServerUrl()
        val username = getSavedUsername()
        val password = getSavedPassword()
        if (serverUrl.isBlank() || username.isBlank() || password.isBlank()) return false
        val result = login(apiService, serverUrl, username, password)
        return result.isSuccess
    }

}
