package com.supertv.app.ui

import okhttp3.*
import java.util.concurrent.TimeUnit

class RemoteControlService {
    private val client = OkHttpClient.Builder()
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    fun startWebSocket(url: String, onMessage: (String) -> Unit) {
        val request = Request.Builder().url(url).build()
        client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                onMessage(text)
            }
        })
    }
}
