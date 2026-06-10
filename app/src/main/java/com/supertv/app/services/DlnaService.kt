package com.supertv.app.services

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import com.supertv.app.model.DLNADevice
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.Socket

/**
 * DLNA 投屏服务 - 对应原项目的 services/dlnaService.ts
 *
 * 支持发现 DLNA 设备和控制投屏播?
 */
class DlnaService(private val context: Context) {

    companion object {
        private const val TAG = "DlnaService"
        private const val M_SEARCH_PORT = 1900
        private const val M_SEARCH_ADDR = "239.255.255.250"
        private const val SEARCH_TIMEOUT = 3000L

        private val SSDP_SEARCH_REQUEST = """
            M-SEARCH * HTTP/1.1
            HOST: 239.255.255.250:1900
            MAN: "ssdp:discover"
            MX: 3
            ST: urn:schemas-upnp-org:device:MediaRenderer:1
        """.trimIndent()
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private var multicastLock: WifiManager.MulticastLock? = null

    private val _devices = MutableStateFlow<List<DLNADevice>>(emptyList())
    val devices: StateFlow<List<DLNADevice>> = _devices.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    private val _connectedDevice = MutableStateFlow<DLNADevice?>(null)
    val connectedDevice: StateFlow<DLNADevice?> = _connectedDevice.asStateFlow()

    /**
     * 搜索 DLNA 设备
     */
    fun discoverDevices() {
        if (_isSearching.value) return
        _isSearching.value = true
        _devices.value = emptyList()

        scope.launch {
            try {
                // 获取组播锁
                multicastLock = wifiManager.createMulticastLock("DlnaSearchLock").apply {
                    setReferenceCounted(true)
                    acquire()
                }

                val socket = DatagramSocket()
                socket.soTimeout = 2000
                socket.broadcast = true

                val sendData = SSDP_SEARCH_REQUEST.toByteArray(Charsets.UTF_8)
                
                // 同时向组播和广播地址发送，提高发现率
                val addresses = listOf(
                    InetAddress.getByName(M_SEARCH_ADDR),
                    InetAddress.getByName("255.255.255.255")
                )

                // 连续发送多次脉冲
                repeat(3) {
                    addresses.forEach { addr ->
                        val sendPacket = DatagramPacket(sendData, sendData.size, addr, M_SEARCH_PORT)
                        socket.send(sendPacket)
                    }
                    delay(200)
                }

                val foundDevices = mutableListOf<DLNADevice>()
                val startTime = System.currentTimeMillis()
                val totalWaitTime = 5000L // 增加等待时间

                while (System.currentTimeMillis() - startTime < totalWaitTime) {
                    try {
                        val receiveData = ByteArray(2048) // 增大缓冲区
                        val receivePacket = DatagramPacket(receiveData, receiveData.size)
                        socket.receive(receivePacket)

                        val response = String(receivePacket.data, 0, receivePacket.length, Charsets.UTF_8)
                        val device = parseDevice(response)
                        if (device != null && foundDevices.none { it.id == device.id }) {
                            foundDevices.add(device)
                            _devices.value = foundDevices.toList() // 实时更新列表
                        }
                    } catch (e: Exception) {
                        // Timeout or other socket error
                        if (System.currentTimeMillis() - startTime >= totalWaitTime) break
                    }
                }
                socket.close()
            } catch (e: Exception) {
                Log.e(TAG, "Device discovery failed", e)
            } finally {
                // 释放组播锁
                try {
                    multicastLock?.let {
                        if (it.isHeld) it.release()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Release multicast lock failed", e)
                }
                _isSearching.value = false
            }
        }
    }

    /**
     * 连接�?DLNA 设备
     */
    fun connectToDevice(device: DLNADevice) {
        _connectedDevice.value = device
    }

    /**
     * 投屏播放
     */
    suspend fun playMedia(device: DLNADevice, url: String, title: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val body = buildPlayBody(url, title)
                val response = sendSoapRequest(device.controlUrl, body, device.host, device.port)
                Log.i(TAG, "Play response: $response")
                true
            } catch (e: Exception) {
                Log.e(TAG, "Play failed", e)
                false
            }
        }
    }

    /**
     * 暂停投屏
     */
    suspend fun pauseMedia(device: DLNADevice): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val body = buildPauseBody()
                sendSoapRequest(device.controlUrl, body, device.host, device.port)
                true
            } catch (e: Exception) {
                Log.e(TAG, "Pause failed", e)
                false
            }
        }
    }

    /**
     * 停止投屏
     */
    suspend fun stopMedia(device: DLNADevice): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val body = buildStopBody()
                sendSoapRequest(device.controlUrl, body, device.host, device.port)
                true
            } catch (e: Exception) {
                Log.e(TAG, "Stop failed", e)
                false
            }
        }
    }

    /**
     * 断开连接
     */
    fun disconnect() {
        _connectedDevice.value = null
    }

    private fun parseDevice(response: String): DLNADevice? {
        val locationRegex = Regex("""LOCATION:\s*(http://[^\s]+)""", RegexOption.IGNORE_CASE)
        val usnRegex = Regex("""USN:\s*([^\s]+)""", RegexOption.IGNORE_CASE)
        val serverRegex = Regex("""SERVER:\s*([^\r\n]+)""", RegexOption.IGNORE_CASE)
        val friendlyNameRegex = Regex("""(?:FRIENDLYNAME|X-Friendly-Name):\s*([^\r\n]+)""", RegexOption.IGNORE_CASE)

        val location = locationRegex.find(response)?.groupValues?.getOrNull(1) ?: return null
        val usn = usnRegex.find(response)?.groupValues?.getOrNull(1) ?: return null
        val server = serverRegex.find(response)?.groupValues?.getOrNull(1) ?: "Unknown"
        val friendlyName = friendlyNameRegex.find(response)?.groupValues?.getOrNull(1)

        val host = try {
            InetAddress.getByName(java.net.URL(location).host).hostAddress ?: ""
        } catch (_: Exception) { "" }

        val port = try {
            java.net.URL(location).port
        } catch (_: Exception) { 0 }

        // 规范化设备名称：优先使用 friendlyName，否则尝试从 Server 提取或使用 IP
        val normalizedName = when {
            !friendlyName.isNullOrBlank() -> friendlyName.trim()
            server.contains("UPnP/1.0") -> {
                // 如果 Server 是标准 UPnP 格式，尝试取前半部分并过滤掉 Linux 等通用词
                val raw = server.substringBefore(" ").trim()
                if (raw.lowercase() in listOf("linux", "windows", "unix", "unknown")) "DLNA Device ($host)" else raw
            }
            else -> "DLNA Device ($host)"
        }

        return DLNADevice(
            id = usn,
            name = normalizedName,
            host = host,
            port = if (port > 0) port else 80,
            controlUrl = location,
            descriptionUrl = location
        )
    }

    private fun sendSoapRequest(controlUrl: String, body: String, host: String, port: Int): String {
        val url = java.net.URL(controlUrl)
        val socket = Socket(host, if (port > 0) port else url.port.let { if (it > 0) it else 80 })
        socket.soTimeout = 10000

        val request = buildHttpRequest(controlUrl, body, host)
        socket.getOutputStream().write(request.toByteArray())
        socket.getOutputStream().flush()

        val response = socket.getInputStream().bufferedReader().use { it.readText() }
        socket.close()
        return response
    }

    private fun buildHttpRequest(url: String, body: String, host: String): String {
        return """POST $url HTTP/1.1
HOST: $host
CONTENT-TYPE: text/xml; charset="utf-8"
SOAPACTION: "urn:schemas-upnp-org:service:AVTransport:1#Play"
CONTENT-LENGTH: ${body.toByteArray().size}

$body""".replace("\n", "\r\n")
    }

    private fun buildPlayBody(url: String, title: String): String {
        return """<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <Speed>1</Speed>
    </u:Play>
  </s:Body>
</s:Envelope>"""
    }

    private fun buildPauseBody(): String {
        return """<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Pause xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
    </u:Pause>
  </s:Body>
</s:Envelope>"""
    }

    private fun buildStopBody(): String {
        return """<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Stop xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
    </u:Stop>
  </s:Body>
</s:Envelope>"""
    }

    fun destroy() {
        scope.cancel()
    }
}
