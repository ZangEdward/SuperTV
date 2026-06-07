package com.supertv.app.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
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
import androidx.paging.compose.collectAsLazyPagingItems
import androidx.paging.compose.itemKey
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import com.supertv.app.model.NetDiskItem
import com.supertv.app.model.SearchResult
import com.supertv.app.ui.components.ShimmerGrid
import com.supertv.app.ui.components.VideoCard
import com.supertv.app.ui.theme.*
import com.supertv.app.viewmodel.SearchViewModel

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SearchScreen(
    viewModel: SearchViewModel,
    onResultClick: (SearchResult) -> Unit,
    onBack: () -> Unit
) {
    val query by viewModel.query.collectAsState()
    val pagingItems = viewModel.searchPagingData.collectAsLazyPagingItems()
    val netDiskResults by viewModel.netDiskResults.collectAsState()
    val searchMode by viewModel.searchMode.collectAsState()
    val suggestions by viewModel.suggestions.collectAsState()
    val searchHistory by viewModel.searchHistory.collectAsState()
    val isSearching by viewModel.isSearching.collectAsState()

    var showClearDialog by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        // Search Header
        Surface(modifier = Modifier.fillMaxWidth(), color = BackgroundDark) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = TextPrimary)
                }
                OutlinedTextField(
                    value = query,
                    onValueChange = { viewModel.updateQuery(it) },
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 16.dp, top = 8.dp, bottom = 8.dp),
                    placeholder = { Text("搜索影视、网盘资源...", color = TextTertiary) },
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
                        unfocusedBorderColor = BackgroundSurface,
                        cursorColor = PrimaryGreen,
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    )
                )
            }
        }

        // Search Tabs
        TabRow(
            selectedTabIndex = searchMode,
            containerColor = BackgroundDark,
            contentColor = PrimaryGreen,
            indicator = { tabPositions ->
                TabRowDefaults.SecondaryIndicator(
                    modifier = Modifier.tabIndicatorOffset(tabPositions[searchMode]),
                    color = PrimaryGreen
                )
            }
        ) {
            Tab(
                selected = searchMode == 0,
                onClick = { viewModel.setSearchMode(0) },
                text = { Text("全网聚合") }
            )
            Tab(
                selected = searchMode == 1,
                onClick = { viewModel.setSearchMode(1) },
                text = { Text("网盘资源") }
            )
        }

        when {
            isSearching -> {
                Box(modifier = Modifier.padding(16.dp)) { 
                    if (searchMode == 0) ShimmerGrid(columns = 3) else CircularProgressIndicator(color = PrimaryGreen, modifier = Modifier.align(Alignment.Center))
                }
            }

            searchMode == 0 && pagingItems.itemCount > 0 -> {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    contentPadding = PaddingValues(8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(
                        count = pagingItems.itemCount,
                        key = pagingItems.itemKey { "${it.id}${it.source}" }
                    ) { index ->
                        pagingItems[index]?.let { item ->
                            VideoCard(result = item, onClick = { onResultClick(item) })
                        }
                    }
                }
            }
            
            searchMode == 1 && netDiskResults.isNotEmpty() -> {
                LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                    items(netDiskResults) { item ->
                        NetDiskResultItem(item)
                    }
                }
            }

            else -> {
                SearchPlaceholder(searchHistory, onClearClick = { showClearDialog = true }, onSearch = { viewModel.search(it) })
            }
        }
    }

    if (showClearDialog) {
        ClearHistoryDialog(
            onDismiss = { showClearDialog = false },
            onConfirm = {
                viewModel.clearSearchHistory()
                showClearDialog = false
            }
        )
    }
}

@Composable
fun NetDiskResultItem(item: NetDiskItem) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { /* TODO: Open URL */ },
        colors = CardDefaults.cardColors(containerColor = BackgroundCard),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.CloudDownload, contentDescription = null, tint = PrimaryGreen)
            Spacer(Modifier.width(12.dp))
            Column {
                Text(item.title, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Row {
                    Text(item.source, color = TextTertiary, fontSize = 11.sp)
                    Spacer(Modifier.width(8.dp))
                    Text(item.size, color = TextTertiary, fontSize = 11.sp)
                    Spacer(Modifier.width(8.dp))
                    Text(item.datetime, color = TextTertiary, fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
fun SearchPlaceholder(history: List<String>, onClearClick: () -> Unit, onSearch: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        if (history.isNotEmpty()) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("搜索历史", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                TextButton(onClick = onClearClick) { Text("清空", color = TextSecondary) }
            }
            FlowRow(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                history.forEach { term ->
                    SuggestionChip(onClick = { onSearch(term) }, label = { Text(term) })
                }
            }
        } else {
            Box(modifier = Modifier.fillMaxWidth().padding(top = 100.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.History, contentDescription = null, tint = BackgroundSurface, modifier = Modifier.size(64.dp))
                    Text("暂无搜索历史", color = TextTertiary, modifier = Modifier.padding(top = 16.dp))
                }
            }
        }
    }
}

@Composable
fun ClearHistoryDialog(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = BackgroundCard,
        title = { Text("清空历史") },
        text = { Text("确定要删除所有搜索记录吗？") },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text("确认", color = ErrorRed) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消", color = TextSecondary) }
        }
    )
}
