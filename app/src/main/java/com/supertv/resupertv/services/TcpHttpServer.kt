package com.supertv.resupertv.services

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.*
import java.net.ServerSocket

/**
 * TCP/HTTP 控制服务
 * 对应原项目中 tcpHttpServer.ts 的逻辑
 */
class TcpHttpServer : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + Job())

    override fun onCreate() {
        super.onCreate()
        startServer()
    }

    private fun startServer() {
        serviceScope.launch {
            try {
                val serverSocket = ServerSocket(8080)
                Log.d("TcpHttpServer", "Server started on port 8080")
                while (isActive) {
                    val client = serverSocket.accept()
                    // 处理来自前端或远程控制端的 TCP/HTTP 请求
                }
            } catch (e: Exception) {
                Log.e("TcpHttpServer", "Server error: ${e.message}")
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }
}
