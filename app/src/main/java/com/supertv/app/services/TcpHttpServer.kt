package com.supertv.app.services

import android.util.Log
import kotlinx.coroutines.*
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder

/**
 * TCP HTTP 服务�?- 对应原项目的 services/tcpHttpServer.ts
 *
 * 在设备上运行一个轻量级 HTTP 服务器，用于远程控制
 */
class TcpHttpServer {

    companion object {
        private const val TAG = "TcpHttpServer"
        private const val DEFAULT_PORT = 9527
    }

    private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var requestHandler: ((String, Map<String, String>) -> String)? = null

    /**
     * 设置请求处理�?
     */
    fun setRequestHandler(handler: (method: String, params: Map<String, String>) -> String) {
        requestHandler = handler
    }

    /**
     * 启动服务�?
     */
    fun start(port: Int = DEFAULT_PORT): Boolean {
        return try {
            serverSocket = ServerSocket(port)
            isRunning = true
            Log.i(TAG, "HTTP Server started on port $port")

            scope.launch {
                while (isRunning) {
                    try {
                        val clientSocket = serverSocket?.accept() ?: continue
                        launch { handleClient(clientSocket) }
                    } catch (e: Exception) {
                        if (isRunning) {
                            Log.w(TAG, "Accept failed", e)
                        }
                    }
                }
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start server", e)
            false
        }
    }

    private fun handleClient(clientSocket: Socket) {
        try {
            val input = BufferedReader(InputStreamReader(clientSocket.getInputStream()))
            val output: OutputStream = clientSocket.getOutputStream()

            val requestLine = input.readLine() ?: return
            val parts = requestLine.split(" ")
            if (parts.size < 3) return

            val method = parts[0]
            val path = parts[1]

            // 读取请求�?
            val headers = mutableMapOf<String, String>()
            var line: String?
            while (input.readLine().also { line = it } != null) {
                if (line.isNullOrBlank()) break
                val colonIndex = line.indexOf(":")
                if (colonIndex > 0) {
                    val key = line.substring(0, colonIndex).trim()
                    val value = line.substring(colonIndex + 1).trim()
                    headers[key] = value
                }
            }

            // 解析参数
            val params = parseParams(path)
            val handler = requestHandler

            val responseBody = if (handler != null) {
                handler(method, params)
            } else {
                """{"status":"ok","message":"SuperTV Remote Server"}"""
            }

            val response = buildResponse(responseBody)
            output.write(response.toByteArray())
            output.flush()

            clientSocket.close()
        } catch (e: Exception) {
            Log.w(TAG, "Handle client failed", e)
        } finally {
            try {
                clientSocket.close()
            } catch (_: Exception) {}
        }
    }

    private fun parseParams(path: String): Map<String, String> {
        val params = mutableMapOf<String, String>()
        val queryStart = path.indexOf("?")
        if (queryStart < 0) return params

        val query = path.substring(queryStart + 1)
        query.split("&").forEach { pair ->
            val eqIndex = pair.indexOf("=")
            if (eqIndex > 0) {
                val key = URLDecoder.decode(pair.substring(0, eqIndex), "UTF-8")
                val value = URLDecoder.decode(pair.substring(eqIndex + 1), "UTF-8")
                params[key] = value
            }
        }
        return params
    }

    private fun buildResponse(body: String): String {
        return """
            HTTP/1.1 200 OK
            Content-Type: application/json; charset=utf-8
            Access-Control-Allow-Origin: *
            Content-Length: ${body.toByteArray().size}
            Connection: close

            $body
        """.trimIndent().replace("\n", "\r\n")
    }

    /**
     * 停止服务�?
     */
    fun stop() {
        isRunning = false
        try {
            serverSocket?.close()
        } catch (_: Exception) {}
        serverSocket = null
        scope.cancel()
    }

    fun isActive(): Boolean = isRunning

    fun destroy() {
        stop()
    }
}
