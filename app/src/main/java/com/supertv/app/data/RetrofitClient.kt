package com.supertv.app.data

import com.supertv.app.api.ApiService
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.nio.charset.Charset
import java.util.concurrent.TimeUnit

/**
 * Retrofit网络客户端 - 对应原项目的 services/api.ts 中的API类
 *
 * 支持多节点切换，动态修改 baseUrl，以及自动处理 401 登录失效
 */
object RetrofitClient {

    private const val DEFAULT_TIMEOUT = 10L
    private const val DEFAULT_BASE_URL = "https://ltv.955598.xyz/"

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BASIC
    }

    private var authToken: String? = null
    private var authCookies: String? = null
    private var onUnauthorized: (() -> Unit)? = null
    private var lastUnauthorizedTime: Long = 0
    private const val UNAUTHORIZED_COOLDOWN = 5000L // 5秒冷却时间

    private var store: Store? = null

    /**
     * 预初始化，从存储中恢复节点
     */
    fun init(context: android.content.Context) {
        this.store = Store.getInstance(context)
        val savedUrl = store?.getApiBaseUrl()
        if (!savedUrl.isNullOrBlank()) {
            switchBaseUrl(savedUrl, false) // 初始化时不重复保存
        } else {
            val nodes = ApiNodeService.getNodes(context)
            if (nodes.isNotEmpty()) {
                val firstUrl = nodes.first().url
                switchBaseUrl(firstUrl, true)
            }
        }
    }

    /**
     * 设置认证信息
     */
    fun setAuth(token: String?, cookies: String?) {
        authToken = token
        authCookies = cookies
    }

    /**
     * 设置 401 未授权监听
     */
    fun setUnauthorizedListener(listener: () -> Unit) {
        onUnauthorized = listener
    }

    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .connectionPool(okhttp3.ConnectionPool(10, 5, TimeUnit.MINUTES))
        .addInterceptor(loggingInterceptor)
        .addInterceptor { chain ->
            val request = chain.request()
            val requestBuilder = request.newBuilder()
                .addHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
                .addHeader("Accept", "application/json")
                .addHeader("Referer", "https://movie.douban.com/")
                .addHeader("Connection", "keep-alive")
            
            // 注意：不要手动添加 Accept-Encoding，让 OkHttp 自动处理 Gzip，否则拦截器读到的是压缩后的乱码
            
            // 添加 Token (Selene 风格)
            authToken?.let {
                if (it.isNotBlank()) {
                    requestBuilder.addHeader("Authorization", "Bearer $it")
                }
            }
            
            // 添加 Cookies (SuperTV_old 风格)
            authCookies?.let {
                if (it.isNotBlank()) {
                    requestBuilder.addHeader("Cookie", it)
                }
            }
            
            val response = chain.proceed(requestBuilder.build())
            
            // 如果返回 401，通知 UI 弹出登录框
            if (response.code == 401) {
                val now = System.currentTimeMillis()
                if (now - lastUnauthorizedTime > UNAUTHORIZED_COOLDOWN) {
                    lastUnauthorizedTime = now
                    onUnauthorized?.invoke()
                }
            }
            
            // 优化乱码处理：仅在 JSON 响应且未显式指定 UTF-8 时尝试修复
            val contentType = response.body?.contentType()
            val isJson = contentType?.subtype?.contains("json", ignoreCase = true) == true
            
            // 检查响应头是否已经经过了 Gzip 处理（OkHttp 自动解压后会移除该头）
            // 如果该头还在，说明我们要么手动加了头，要么 OkHttp 没自动处理
            val isCompressed = response.header("Content-Encoding") != null

            if (isJson && !isCompressed) {
                val source = response.body?.source()
                source?.request(Long.MAX_VALUE)
                val buffer = source?.buffer
                
                // 尝试以 UTF-8 读取
                var bodyString = buffer?.clone()?.readString(Charsets.UTF_8) ?: ""
                
                // 如果包含替换字符，且不包含正常的 JSON 特征，说明可能是 GBK 编码
                if (bodyString.contains("\ufffd") && !bodyString.startsWith("{") && !bodyString.startsWith("[")) {
                    android.util.Log.w("RetrofitClient", "Detected probable encoded response, retrying decode...")
                    bodyString = buffer?.clone()?.readString(Charset.forName("GBK")) ?: ""
                }
                
                // 关键修复：如果修复逻辑导致 body 为空或异常，不替换原 body
                if (bodyString.isNotBlank()) {
                    @Suppress("DEPRECATION")
                    val newBody = okhttp3.ResponseBody.create(contentType, bodyString)
                    return@addInterceptor response.newBuilder()
                        .body(newBody)
                        .build()
                }
            }
            
            response
        }
        .build()

    @Volatile
    private var currentBaseUrl: String = DEFAULT_BASE_URL

    @Volatile
    private var apiService: ApiService? = null

    @Volatile
    private var retrofit: Retrofit? = null

    /**
     * 获取ApiService实例
     */
    fun getApiService(): ApiService {
        return try {
            val currentService = apiService
            if (currentService != null) {
                currentService
            } else {
                createApiService()
            }
        } catch (e: Exception) {
            throw e
        }
    }

    @Synchronized
    private fun createApiService(): ApiService {
        return apiService ?: run {
            val newRetrofit = buildRetrofit()
            retrofit = newRetrofit
            val newService = newRetrofit.create(ApiService::class.java)
            apiService = newService
            newService
        }
    }

    /**
     * 切换API节点
     * @param saveToStore 是否持久化到存储
     */
    @Synchronized
    fun switchBaseUrl(newBaseUrl: String, saveToStore: Boolean = true) {
        val url = if (newBaseUrl.endsWith("/")) newBaseUrl else "$newBaseUrl/"
        
        if (!url.startsWith("http://") && !url.startsWith("https://")) return

        if (saveToStore) {
            store?.saveApiBaseUrl(url)
            android.util.Log.d("RetrofitClient", "Saved to Store: $url")
        }

        if (url == currentBaseUrl && apiService != null) {
            android.util.Log.d("RetrofitClient", "URL same as current, skipping recreation")
            return
        }
        
        currentBaseUrl = url
        retrofit = null
        apiService = null
        android.util.Log.d("RetrofitClient", "Switched currentBaseUrl to: $url")
    }

    /**
     * 获取当前基础URL
     */
    fun getCurrentBaseUrl(): String = currentBaseUrl

    private fun buildRetrofit(): Retrofit {
        val gson = com.google.gson.GsonBuilder()
            .setLenient()
            .disableHtmlEscaping()
            .create()

        return Retrofit.Builder()
            .baseUrl(currentBaseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }
}
