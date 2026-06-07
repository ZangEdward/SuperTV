package com.supertv.app

import android.app.Application
import com.supertv.app.services.CrashHandler

class SuperTVApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // 初始化全局错误捕获
        CrashHandler(this)
    }
}
