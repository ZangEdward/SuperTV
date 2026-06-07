package com.supertv.app

import android.app.Application
import android.util.Log
import com.supertv.app.services.CrashHandler

class SuperTVApp : Application() {
    override fun onCreate() {
        super.onCreate()
        try {
            // 初始化全局错误捕获
            CrashHandler(this)
        } catch (e: Exception) {
            Log.e("SuperTVApp", "Failed to initialize CrashHandler", e)
        }
    }
}
