package com.supertv.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.supertv.app.SearchEngineModule

@Composable
fun SearchScreen(searchEngine: SearchEngineModule) {
    var query by remember { mutableStateOf("") }
    var suggestions by remember { mutableStateOf<List<String>>(emptyList()) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TextField(
            value = query,
            onValueChange = { 
                query = it
                // 这里调用原生并行搜索逻辑
                // 在 Compose 中通常通过 ViewModel 绑定
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("输入拼音首字母搜索") }
        )
        
        LazyColumn {
            items(suggestions) { suggestion ->
                Text(text = suggestion, modifier = Modifier.padding(8.dp))
            }
        }
    }
}
