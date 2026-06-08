package com.supertv.app.data

import androidx.paging.PagingSource
import androidx.paging.PagingState
import com.supertv.app.api.ApiService
import com.supertv.app.model.SearchResult

class SearchPagingSource(
    private val apiService: ApiService,
    private val query: String,
    private val source: String = "all"
) : PagingSource<Int, SearchResult>() {

    override suspend fun load(params: LoadParams<Int>): LoadResult<Int, SearchResult> {
        val position = params.key ?: 1
        return try {
            // 注意：supertvold 的 api/search 可能不支持分页参数，或者参数名不同
            // 这里我们保持 position 但处理包装类
            val response = apiService.search(query, source)
            val body = response.body()
            val results = (body?.results ?: body?.data ?: emptyList()).distinctBy { it.id + it.source }
            
            LoadResult.Page(
                data = results,
                prevKey = if (position == 1) null else position - 1,
                nextKey = if (results.isEmpty()) null else position + 1
            )
        } catch (exception: Exception) {
            LoadResult.Error(exception)
        }
    }

    override fun getRefreshKey(state: PagingState<Int, SearchResult>): Int? {
        return state.anchorPosition?.let { anchorPosition ->
            state.closestPageToPosition(anchorPosition)?.prevKey?.plus(1)
                ?: state.closestPageToPosition(anchorPosition)?.nextKey?.minus(1)
        }
    }
}
