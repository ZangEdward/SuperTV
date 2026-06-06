package com.supertv.resupertv.services

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log

/**
 * 原生 DLNA 服务封装
 * 对应原项目中 dlnaService.ts 的逻辑
 */
class DlnaService : Service() {

    override fun onCreate() {
        super.onCreate()
        Log.d("DlnaService", "DLNA Service Started")
        // 初始化 DLNA 控制点，监听本地网络媒体渲染设备
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // 在这里处理投屏请求，如设置渲染目标、播放控制等
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d("DlnaService", "DLNA Service Stopped")
    }
}
