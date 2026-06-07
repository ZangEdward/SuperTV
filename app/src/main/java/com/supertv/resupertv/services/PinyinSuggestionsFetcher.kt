package com.supertv.resupertv.services

import com.supertv.resupertv.api.ApiService
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * 拼音建议获取器 — 对应 TVSearchView.tsx 的 fetchPinyinSuggestions
 *
 * 调用 atianqi 拼音智能提示 API，支持两种模式：
 * - 快速联想：直接返回拼音匹配结果
 * - 精准建议：拼音结果 → 后端验证 → 去重返回
 */
object PinyinSuggestionsFetcher {

    private const val PINYIN_API_URL =
        "https://tv.aiseet.atianqi.com/i-tvbin/qtv_video/search/get_search_smart_box"

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    private val headers = mapOf(
        "User-Agent" to "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Accept" to "application/json, text/plain, */*"
    )

    /**
     * 快速联想模式 — 直接从拼音 API 获取建议
     */
    suspend fun fastSuggest(query: String): List<String> {
        val hits = fetchPinyinHits(query)
        return hits.take(9)
    }

    /**
     * 精准建议模式 — 拼音结果 → 后端验证 → 去重
     */
    suspend fun exactSuggest(query: String, apiService: ApiService): List<String> {
        val pinyinHits = fetchPinyinHits(query)
        if (pinyinHits.isEmpty()) return emptyList()

        val finalSuggestions = mutableListOf<String>()
        val seen = mutableSetOf<String>()
        val batchSize = 4

        // 分批并发验证（每批最多4个）
        for (i in pinyinHits.indices.step(batchSize)) {
            if (finalSuggestions.size >= 9) break
            val batch = pinyinHits.subList(i, (i + batchSize).coerceAtMost(pinyinHits.size))

            // 并发调用后端验证
            val batchResults = kotlinx.coroutines.coroutineScope {
                batch.map { hit ->
                    kotlinx.coroutines.async {
                        try {
                            val response = apiService.getSuggestions(hit)
                            if (response.isSuccessful) {
                                response.body()?.map { it.trim().replace("\\s+".toRegex(), "") }?.filter { it.isNotBlank() } ?: emptyList()
                            } else emptyList()
                        } catch (_: Exception) {
                            emptyList()
                        }
                    }
                }.mapNotNull { it.await() }
            }.flatten()

            for (text in batchResults) {
                if (finalSuggestions.size >= 9) break
                if (text.isNotBlank() && text !in seen) {
                    seen.add(text)
                    finalSuggestions.add(text)
                }
            }
        }

        return finalSuggestions.take(9)
    }

    /**
     * 获取拼音首字母建议（核心 API 调用）
     */
    private suspend fun fetchPinyinHits(key: String): List<String> {
        if (key.length < 2) return emptyList()
        return kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            try {
                val url = "$PINYIN_API_URL?format=json&page_num=0&page_size=20&key=${java.net.URLEncoder.encode(key, "UTF-8")}"
                val request = Request.Builder()
                    .url(url)
                    .addHeader("User-Agent", headers["User-Agent"]!!)
                    .addHeader("Accept", headers["Accept"]!!)
                    .build()

                val response = client.newCall(request).execute()
                if (!response.isSuccessful) return@withContext emptyList()

                val body = response.body?.string() ?: return@withContext emptyList()
                val json = JSONObject(body)

                val hots = mutableListOf<String>()
                val groupDataArr = json
                    .optJSONObject("data")
                    ?.optJSONObject("search_data")
                    ?.optJSONArray("vecGroupData")
                    ?.optJSONObject(0)
                    ?.optJSONArray("group_data")

                if (groupDataArr != null) {
                    for (i in 0 until groupDataArr.length()) {
                        val item = groupDataArr.optJSONObject(i)
                        val keywordTxt = item
                            ?.optJSONObject("dtReportInfo")
                            ?.optJSONObject("reportData")
                            ?.optString("keyword_txt", "")
                        if (!keywordTxt.isNullOrBlank()) {
                            hots.add(keywordTxt.trim())
                        }
                    }
                }

                hots.take(15)
            } catch (_: Exception) {
                emptyList()
            }
        }
    }
}
