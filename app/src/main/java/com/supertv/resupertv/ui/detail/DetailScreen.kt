package com.supertv.resupertv.ui.detail

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.supertv.resupertv.api.ApiService
import com.supertv.resupertv.data.RetrofitClient

@Composable
fun DetailScreen(source: String, id: String) {
    val apiService = remember { RetrofitClient.create(ApiService::class.java) }
    var detail by remember { mutableStateOf<Map<String, Any>?>(null) }

    LaunchedEffect(id) {
        detail = apiService.getVideoDetail(source, id)
    }

    Column(modifier = Modifier.padding(16.dp)) {
        Text(text = "剧集选择", style = MaterialTheme.typography.titleLarge)
        
        // 渲染剧集选集
        val episodes = (detail?.get("episodes") as? List<*>) ?: emptyList<String>()
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(episodes) { ep ->
                Button(onClick = { /* 播放逻辑 */ }) {
                    Text(text = "第 ${ep.toString()} 集")
                }
            }
        }
    }
}
