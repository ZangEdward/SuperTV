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

    private const val DEFAULT_TIMEOUT = 30L
    private const val DEFAULT_BASE_URL = "https://ltv.955598.xyz/" // 使用默认有效节点替代 example.com

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BASIC
    }

    private var authToken: String? = null
    private var authCookies: String? = null
    private var onUnauthorized: (() -> Unit)? = null

    /**
     * 预初始化，从存储中恢复节点
     */
    fun init(context: android.content.Context) {
        val store = Store.getInstance(context)
        val savedUrl = store.getApiBaseUrl()
        if (!savedUrl.isNullOrBlank()) {
            switchBaseUrl(savedUrl)
        } else {
            val nodes = ApiNodeService.getNodes(context)
            if (nodes.isNotEmpty()) {
                val firstUrl = nodes.first().url
                store.saveApiBaseUrl(firstUrl)
                switchBaseUrl(firstUrl)
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
        .connectTimeout(DEFAULT_TIMEOUT, TimeUnit.SECONDS)
        .readTimeout(DEFAULT_TIMEOUT, TimeUnit.SECONDS)
        .writeTimeout(DEFAULT_TIMEOUT, TimeUnit.SECONDS)
        .addInterceptor(loggingInterceptor)
        .addInterceptor { chain ->
            val requestBuilder = chain.request().newBuilder()
                .addHeader("User-Agent", "SuperTV/1.0")
                .addHeader("Accept", "application/json")
                // 移除冗余且可能引起误解的 Accept-Charset，依靠标准 Accept 处理
            
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
                onUnauthorized?.invoke()
            }
            
            // 优化乱码处理：检测 UTF-8 异常并尝试 GBK 补救
            val contentType = response.body?.contentType()
            if (contentType != null && contentType.subtype == "json" && contentType.charset() == null) {
                val source = response.body?.source()
                source?.request(Long.MAX_VALUE)
                val buffer = source?.buffer
                
                // 尝试以 UTF-8 读取
                var bodyString = buffer?.clone()?.readString(Charsets.UTF_8) ?: ""
                
                // 如果包含替换字符，说明可能是 GBK 编码
                if (bodyString.contains("\ufffd")) {
                    android.util.Log.w("RetrofitClient", "Detected probable GBK response, retrying decode...")
                    bodyString = buffer?.clone()?.readString(Charset.forName("GBK")) ?: ""
                }
                
                @Suppress("DEPRECATION")
                val newBody = okhttp3.ResponseBody.create(contentType, bodyString)
                return@addInterceptor response.newBuilder()
                    .body(newBody)
                    .build()
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
     */
    @Synchronized
    fun switchBaseUrl(newBaseUrl: String) {
        val url = if (newBaseUrl.endsWith("/")) newBaseUrl else "$newBaseUrl/"
        if (url == currentBaseUrl) return
        
        if (!url.startsWith("http://") && !url.startsWith("https://")) return
        
        currentBaseUrl = url
        retrofit = null
        apiService = null
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
