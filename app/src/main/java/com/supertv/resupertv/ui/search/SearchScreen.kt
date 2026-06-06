package com.supertv.resupertv.ui.search

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.supertv.resupertv.viewmodel.SearchViewModel

@Composable
fun SearchScreen(
    viewModel: SearchViewModel = viewModel()
) {
    var query by remember { mutableStateOf("") }
    val suggestions by viewModel.history.collectAsState()

    Column(modifier = Modifier.fillMaxSize().padding(12.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = {
                query = it
                viewModel.getSuggestions(it)
            },
            label = { Text("搜索...") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        
        Spacer(modifier = Modifier.height(8.dp))

        // 紧凑的 Tab 结构
        TabRow(selectedTabIndex = 0) {
            Tab(selected = true, onClick = {}, text = { Text("历史") })
            Tab(selected = false, onClick = {}, text = { Text("建议") })
        }

        LazyColumn(modifier = Modifier.fillMaxWidth()) {
            items(suggestions) { suggestion ->
                ListItem(
                    headlineContent = { Text(suggestion, style = MaterialTheme.typography.bodyMedium) },
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                )
            }
        }
    }
}
