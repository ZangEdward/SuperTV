package com.supertv.app.data

import com.supertv.app.api.ApiService
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Retrofit网络客户�?- 对应原项目的 services/api.ts 中的API�?
 *
 * 支持多节点切换，动态修�?baseUrl
 */
object RetrofitClient {

    private const val DEFAULT_TIMEOUT = 30L
    private const val DEFAULT_BASE_URL = "https://api.example.com/"

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BASIC
    }

    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(DEFAULT_TIMEOUT, TimeUnit.SECONDS)
        .readTimeout(DEFAULT_TIMEOUT, TimeUnit.SECONDS)
        .writeTimeout(DEFAULT_TIMEOUT, TimeUnit.SECONDS)
        .addInterceptor(loggingInterceptor)
        .addInterceptor { chain ->
            val request = chain.request().newBuilder()
                .addHeader("User-Agent", "SuperTV/1.0")
                .addHeader("Accept", "application/json")
                .build()
            chain.proceed(request)
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
            // 如果初始化失败（如 URL 非法），返回一个代理或抛出更清晰的异常
            // 这里为了防止闪退，如果真的报错了，在调用处还会有 try-catch
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
        
        // 简单验证 URL 合法性，防止 Retrofit 抛出异常
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
            .disableHtmlEscaping() // 关键修复：防止中文被转义
            .create()

        return Retrofit.Builder()
            .baseUrl(currentBaseUrl)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }
}
