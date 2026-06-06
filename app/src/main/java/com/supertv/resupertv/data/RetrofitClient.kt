package com.supertv.resupertv.data

import com.supertv.resupertv.api.ApiService
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {
    private var retrofit: Retrofit? = null
    
    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    fun setBaseUrl(url: String) {
        retrofit = Retrofit.Builder()
            .baseUrl(url.endsWith("/").let { if (it) url else "$url/" })
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    fun <T> create(service: Class<T>): T {
        if (retrofit == null) {
            throw IllegalStateException("Base URL not set. Call setBaseUrl first.")
        }
        return retrofit!!.create(service)
    }
}
