package com.supertv.app

import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import okhttp3.*
import org.json.JSONArray
import java.util.Collections

@ReactModule(name = "SearchEngineModule")
class SearchEngineModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private val client = OkHttpClient()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName() = "SearchEngineModule"

    @ReactMethod
    fun parallelSearch(pinyinHits: ReadableArray, baseUrl: String, promise: Promise) {
        scope.launch {
            val results = Collections.synchronizedSet(mutableSetOf<String>())
            val jobs = mutableListOf<Job>()

            for (i in 0 until pinyinHits.size()) {
                val hit = pinyinHits.getString(i)
                jobs += launch {
                    val url = "$baseUrl/suggestions?key=${hit}"
                    try {
                        val request = Request.Builder().url(url).build()
                        client.newCall(request).execute().use { response ->
                            if (response.isSuccessful) {
                                val body = response.body?.string()
                                if (body != null) {
                                    val jsonArray = JSONArray(body)
                                    for (j in 0 until jsonArray.length()) {
                                        results.add(jsonArray.getString(j).replace("\\s+".toRegex(), ""))
                                        if (results.size >= 9) break
                                    }
                                }
                            }
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }
            
            jobs.joinAll()
            
            val finalArray = Arguments.createArray()
            results.take(9).forEach { finalArray.pushString(it) }
            promise.resolve(finalArray)
        }
    }
}
