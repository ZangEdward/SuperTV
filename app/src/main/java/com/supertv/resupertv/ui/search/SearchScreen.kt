package com.supertv.resupertv.ui.search

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.supertv.resupertv.model.SearchResult
import com.supertv.resupertv.ui.components.ShimmerGrid
import com.supertv.resupertv.ui.components.VideoCard
import com.supertv.resupertv.ui.theme.*
import com.supertv.resupertv.viewmodel.SearchViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    viewModel: SearchViewModel,
    onResultClick: (SearchResult) -> Unit,
    onBack: () -> Unit
) {
    val query by viewModel.query.collectAsState()
    val results by viewModel.results.collectAsState()
    val suggestions by viewModel.suggestions.collectAsState()
    val searchHistory by viewModel.searchHistory.collectAsState()
    val isSearching by viewModel.isSearching.collectAsState()

    Column(
        modifier = Modifier.fillMaxSize().background(BackgroundDark).padding(16.dp)
    ) {
        OutlinedTextField(
            value = query,
            onValueChange = { viewModel.updateQuery(it) },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("搜索影视资源...", color = TextTertiary) },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = "搜索", tint = TextTertiary) },
            trailingIcon = {
                if (query.isNotBlank()) {
                    IconButton(onClick = { viewModel.updateQuery("") }) {
                        Icon(Icons.Default.Clear, contentDescription = "清除", tint = TextTertiary)
                    }
                }
            },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { viewModel.search(query) }),
            singleLine = true,
            shape = RoundedCornerShape(24.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryGreen,
                unfocusedBorderColor = Color(0xFF444444),
                cursorColor = TextPrimary,
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary
            )
        )

        Spacer(Modifier.height(8.dp))

        when {
            isSearching -> ShimmerGrid(columns = 3)
            results.isNotEmpty() -> {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    contentPadding = PaddingValues(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items(results, key = { it.id + it.source }) { item ->
                        VideoCard(result = item, onClick = { onResultClick(item) })
                    }
                }
            }
            query.isNotBlank() && suggestions.isNotEmpty() -> {
                Text("搜索建议", fontSize = 14.sp, color = TextTertiary, modifier = Modifier.padding(vertical = 8.dp))
                LazyColumn {
                    items(suggestions) { suggestion ->
                        SuggestionItem(text = suggestion, onClick = { viewModel.search(suggestion) })
                    }
                }
            }
            searchHistory.isNotEmpty() -> {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("搜索历史", fontSize = 14.sp, color = TextTertiary)
                    TextButton(onClick = { viewModel.clearSearchHistory() }) {
                        Text("清除", color = PrimaryGreen, fontSize = 12.sp)
                    }
                }
                LazyColumn {
                    items(searchHistory) { history ->
                        SuggestionItem(text = history, onClick = { viewModel.search(history) })
                    }
                }
            }
            else -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("搜索你想看的影视内容", color = TextTertiary, fontSize = 16.sp)
                }
            }
        }
    }
}

@Composable
private fun SuggestionItem(text: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp, horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Default.Search, contentDescription = null, tint = TextTertiary, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Text(text = text, color = TextPrimary, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
