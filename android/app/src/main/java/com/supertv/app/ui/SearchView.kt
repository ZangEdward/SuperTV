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
fun SearchScreen(viewModel: SearchViewModel) {
    val suggestions by viewModel.suggestions.collectAsState()
    var query by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TextField(
            value = query,
            onValueChange = { 
                query = it
                viewModel.onQueryChanged(it)
            },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("输入搜索内容") }
        )
        
        LazyColumn {
            items(suggestions) { suggestion ->
                Text(text = suggestion, modifier = Modifier.padding(8.dp))
            }
        }
    }
}
