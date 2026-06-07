package com.supertv.app.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.supertv.app.model.SearchResult
import com.supertv.app.ui.components.ShimmerGrid
import com.supertv.app.ui.components.VideoCard
import com.supertv.app.ui.theme.*
import com.supertv.app.viewmodel.SearchViewModel

private val SeleneHistoryBg = Color(0xFF1e1e1e)
private val SeleneHistoryText = Color(0xFFffffff)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
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

    var showClearDialog by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = BackgroundDark
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { viewModel.updateQuery(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = { Text("搜索影视资源...", color = TextTertiary) },
                leadingIcon = {
                    Icon(Icons.Default.Search, contentDescription = "搜索", tint = TextTertiary)
                },
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
        }

        when {
            isSearching -> {
                Box(modifier = Modifier.padding(16.dp)) { ShimmerGrid(columns = 3) }
            }

            results.isNotEmpty() -> {
                Text(
                    text = "找到 ${results.size} 个结果",
                    fontSize = 13.sp,
                    color = TextTertiary,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                )
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    contentPadding = PaddingValues(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(results, key = { "${it.id}${it.source}" }) { item ->
                        VideoCard(result = item, onClick = { onResultClick(item) })
                    }
                }
            }

            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp)
                ) {
                    if (searchHistory.isNotEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "搜索历史",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TextPrimary
                            )
                            TextButton(
                                onClick = { showClearDialog = true }
                            ) {
                                Text(
                                    text = "清空",
                                    fontSize = 14.sp,
                                    color = TextSecondary
                                )
                            }
                        }

                        FlowRow(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            searchHistory.forEach { history ->
                                HistoryChip(
                                    text = history,
                                    onClick = { viewModel.search(history) }
                                )
                            }
                        }
                    } else {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 120.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(
                                    Icons.Default.History,
                                    contentDescription = null,
                                    tint = Color(0xFF444444),
                                    modifier = Modifier.size(80.dp)
                                )
                                Spacer(Modifier.height(24.dp))
                                Text(
                                    text = "暂无搜索历史",
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Medium,
                                    color = Color(0xFF666666)
                                )
                                Spacer(Modifier.height(12.dp))
                                Text(
                                    text = "开始搜索你喜欢的内容吧",
                                    fontSize = 14.sp,
                                    color = Color(0xFF555555)
                                )
                            }
                        }
                    }

                    if (query.isNotBlank() && suggestions.isNotEmpty()) {
                        Spacer(Modifier.height(16.dp))
                        Text(
                            text = "搜索建议",
                            fontSize = 14.sp,
                            color = TextTertiary,
                            modifier = Modifier.padding(vertical = 4.dp)
                        )
                        suggestions.forEach { suggestion ->
                            SuggestionPill(
                                text = suggestion,
                                onClick = { viewModel.search(suggestion) }
                            )
                        }
                    }
                }
            }
        }
    }

    if (showClearDialog) {
        AlertDialog(
            onDismissRequest = { showClearDialog = false },
            shape = RoundedCornerShape(16.dp),
            containerColor = BackgroundCard,
            title = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = FavoriteRed.copy(alpha = 0.1f),
                        modifier = Modifier.size(64.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = null,
                                tint = FavoriteRed,
                                modifier = Modifier.size(32.dp)
                            )
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = "清空搜索历史",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                }
            },
            text = {
                Text(
                    text = "确定要清空所有搜索历史吗？此操作无法撤销。",
                    fontSize = 14.sp,
                    color = TextSecondary,
                    modifier = Modifier.padding(vertical = 8.dp)
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.clearSearchHistory()
                        showClearDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = FavoriteRed),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("清空", color = Color.White)
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = { showClearDialog = false },
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("取消", color = TextSecondary)
                }
            }
        )
    }
}

@Composable
private fun HistoryChip(
    text: String,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        color = SeleneHistoryBg
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.History,
                contentDescription = null,
                tint = TextTertiary,
                modifier = Modifier.size(16.dp)
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = text,
                fontSize = 14.sp,
                color = SeleneHistoryText
            )
        }
    }
}

@Composable
private fun SuggestionPill(
    text: String,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 2.dp),
        color = Color.Transparent
    ) {
        Row(
            modifier = Modifier.padding(vertical = 10.dp, horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Search,
                contentDescription = null,
                tint = TextTertiary,
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = text,
                fontSize = 14.sp,
                color = TextPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
