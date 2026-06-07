package com.supertv.app

import android.app.Application
import android.util.Log
import com.supertv.app.data.ApiNodeService
import com.supertv.app.data.AuthRepository
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.Store
import com.supertv.app.services.CrashHandler

class SuperTVApp : Application() {
    override fun onCreate() {
        super.onCreate()
        try {
            // 初始化全局错误捕获
            CrashHandler(this)
            
            // 初始化网络客户端，确保不使用 mock 地址
            val store = Store.getInstance(this)
            val authRepo = AuthRepository.getInstance(this)
            
            // 加载认证信息 (Token + Cookies)
            RetrofitClient.setAuth(
                authRepo.getToken(),
                getSharedPreferences("auth", MODE_PRIVATE).getString("cookies", null)
            )

            val savedUrl = store.getApiBaseUrl()
            if (savedUrl != null) {
                RetrofitClient.switchBaseUrl(savedUrl)
            } else {
                val nodes = ApiNodeService.getNodes(this)
                if (nodes.isNotEmpty()) {
                    val firstUrl = nodes.first().url
                    store.saveApiBaseUrl(firstUrl)
                    RetrofitClient.switchBaseUrl(firstUrl)
                }
            }
        } catch (e: Exception) {
            Log.e("SuperTVApp", "Initialization failed", e)
        }
    }
}
