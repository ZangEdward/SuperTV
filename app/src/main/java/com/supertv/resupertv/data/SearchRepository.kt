package com.supertv.resupertv.data

import com.supertv.resupertv.api.ApiService
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject

class SearchRepository @Inject constructor(private val api: ApiService) {

    // 获取搜索历史
    fun getSearchHistory(): Flow<List<String>> = flow {
        val response = api.searchVideos("history_placeholder") // 实际应调用专门的接口
        // TODO: 适配实际返回类型
        emit(emptyList()) 
    }

    // 添加搜索记录
    fun addSearchHistory(keyword: String) = flow {
        emit(api.searchVideos(keyword))
    }

    // 执行搜索
    fun searchVideos(query: String) = flow {
        emit(api.searchVideos(query))
    }
}
