package com.supertv.app.ui.search

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    val results by viewModel.results.collectAsState()
    val netDiskResults by viewModel.netDiskResults.collectAsState()
    val searchMode by viewModel.searchMode.collectAsState()
    val searchHistory by viewModel.searchHistory.collectAsState()
    val isSearching by viewModel.isSearching.collectAsState()

    var showClearDialog by remember { mutableStateOf(false) }
    var selectedNetDiskType by remember { mutableStateOf("") }
    
    // 使用主题色
    val backgroundColor = MaterialTheme.colorScheme.background
    val textColor = MaterialTheme.colorScheme.onBackground
    val secondaryTextColor = MaterialTheme.colorScheme.onSurfaceVariant

    // 当网盘结果更新时，默认选择第一个 Tab
    LaunchedEffect(netDiskResults) {
        if (netDiskResults.isNotEmpty() && (selectedNetDiskType.isBlank() || !netDiskResults.containsKey(selectedNetDiskType))) {
            selectedNetDiskType = netDiskResults.keys.first()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundColor)
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        // Search Header
        Surface(modifier = Modifier.fillMaxWidth(), color = backgroundColor, tonalElevation = 2.dp) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = textColor)
                }
                OutlinedTextField(
                    value = query,
                    onValueChange = { viewModel.updateQuery(it) },
                    modifier = Modifier
                        .weight(1f)
                        .padding(end = 16.dp, top = 4.dp),
                    placeholder = { Text("搜索影视、网盘资源...", fontSize = 14.sp) },
                    leadingIcon = {
                        Icon(Icons.Default.Search, contentDescription = "搜索", modifier = Modifier.size(20.dp))
                    },
                    trailingIcon = {
                        if (query.isNotBlank()) {
                            IconButton(onClick = { viewModel.updateQuery("") }) {
                                Icon(Icons.Default.Clear, contentDescription = "清除", modifier = Modifier.size(20.dp))
                            }
                        }
                    },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { viewModel.search(query) }),
                    singleLine = true,
                    shape = RoundedCornerShape(28.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PrimaryGreen,
                        unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                        cursorColor = PrimaryGreen,
                        focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                        unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                    )
                )
            }
        }

        // Search Tabs
        TabRow(
            selectedTabIndex = searchMode,
            containerColor = backgroundColor,
            contentColor = PrimaryGreen,
            divider = { HorizontalDivider(thickness = 0.5.dp, color = MaterialTheme.colorScheme.outlineVariant) },
            indicator = { tabPositions ->
                TabRowDefaults.SecondaryIndicator(
                    modifier = Modifier.tabIndicatorOffset(tabPositions[searchMode]),
                    color = PrimaryGreen,
                    height = 3.dp
                )
            }
        ) {
            Tab(
                selected = searchMode == 0,
                onClick = { viewModel.setSearchMode(0) },
                text = { Text("全网聚合", fontSize = 15.sp, fontWeight = if (searchMode == 0) FontWeight.Bold else FontWeight.Normal) }
            )
            Tab(
                selected = searchMode == 1,
                onClick = { viewModel.setSearchMode(1) },
                text = { Text("网盘资源", fontSize = 15.sp, fontWeight = if (searchMode == 1) FontWeight.Bold else FontWeight.Normal) }
            )
        }

        when {
            isSearching -> {
                Box(modifier = Modifier.fillMaxSize()) { 
                    if (searchMode == 0) {
                        ShimmerGrid(columns = 2) 
                    } else {
                        CircularProgressIndicator(color = PrimaryGreen, modifier = Modifier.align(Alignment.Center))
                    }
                }
            }

            searchMode == 0 && results.isNotEmpty() -> {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    contentPadding = PaddingValues(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(results, key = { "${it.id}${it.source}" }) { item ->
                        VideoCard(result = item, onClick = { onResultClick(item) })
                    }
                }
            }
            
            searchMode == 0 && results.isEmpty() && query.isNotBlank() && !isSearching -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.SearchOff, null, tint = secondaryTextColor, modifier = Modifier.size(64.dp))
                        Spacer(Modifier.height(16.dp))
                        Text("未找到相关影视资源", color = secondaryTextColor)
                    }
                }
            }
            
            searchMode == 1 && netDiskResults.isNotEmpty() -> {
                Column(modifier = Modifier.fillMaxSize()) {
                    // 网盘分类 Tabs
                    ScrollableTabRow(
                        selectedTabIndex = netDiskResults.keys.toList().indexOf(selectedNetDiskType).coerceAtLeast(0),
                        containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.5f),
                        edgePadding = 16.dp,
                        divider = {},
                        indicator = {}
                    ) {
                        netDiskResults.forEach { (type, items) ->
                            val isSelected = selectedNetDiskType == type
                            Tab(
                                selected = isSelected,
                                onClick = { selectedNetDiskType = type },
                                text = { 
                                    Surface(
                                        color = if (isSelected) PrimaryGreen else MaterialTheme.colorScheme.surfaceVariant,
                                        shape = RoundedCornerShape(16.dp)
                                    ) {
                                        Text(
                                            text = "${getNetDiskName(type)} (${items.size})",
                                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                            fontSize = 12.sp,
                                            color = if (isSelected) Color.White else secondaryTextColor
                                        )
                                    }
                                }
                            )
                        }
                    }

                    val currentData = netDiskResults[selectedNetDiskType] ?: emptyList()
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(currentData) { item ->
                            NetDiskResultItem(item)
                        }
                    }
                }
            }

            else -> {
                SearchPlaceholder(searchHistory, onClearClick = { showClearDialog = true }, onSearch = { viewModel.search(it) })
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
}

private fun getNetDiskName(type: String): String {
    return when (type.lowercase()) {
        "quark" -> "夸克"
        "magnet" -> "磁力"
        "baidu" -> "百度"
        "aliyun" -> "阿里"
        "xunlei" -> "迅雷"
        "pikpak" -> "PikPak"
        "uc" -> "UC"
        else -> type.uppercase()
    }
}

@Composable
fun NetDiskResultItem(item: NetDiskItem) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val uriHandler = LocalUriHandler.current

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(12.dp),
        border = androidx.compose.foundation.BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = item.source,
                    color = PrimaryGreen,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = item.datetime.take(10), // 只显示日期
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    fontSize = 11.sp
                )
            }
            
            Spacer(Modifier.height(8.dp))
            
            Text(
                text = item.title,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 20.sp
            )
            
            if (item.note.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = item.note,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 18.sp
                )
            }
            
            Spacer(Modifier.height(16.dp))
            
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { 
                        clipboardManager.setText(AnnotatedString(item.url))
                        Toast.makeText(context, "已复制链接", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(vertical = 8.dp)
                ) {
                    Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("复制链接", fontSize = 12.sp)
                }
                
                Button(
                    onClick = { 
                        try {
                            uriHandler.openUri(item.url)
                        } catch (e: Exception) {
                            Toast.makeText(context, "无法打开链接", Toast.LENGTH_SHORT).show()
                        }
                    },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                    contentPadding = PaddingValues(vertical = 8.dp)
                ) {
                    Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(16.dp), tint = Color.White)
                    Spacer(Modifier.width(6.dp))
                    Text("直接打开", fontSize = 12.sp, color = Color.White)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
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
                Text("搜索历史", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                TextButton(onClick = onClearClick) { Text("清空", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            FlowRow(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                history.forEach { term ->
                    SuggestionChip(
                        onClick = { onSearch(term) },
                        label = { Text(term) },
                        shape = RoundedCornerShape(16.dp),
                        colors = SuggestionChipDefaults.suggestionChipColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            labelColor = MaterialTheme.colorScheme.onSurfaceVariant
                        ),
                        border = null
                    )
                }
            }
        } else {
            Box(modifier = Modifier.fillMaxWidth().padding(top = 100.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.History, contentDescription = null, tint = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.size(64.dp))
                    Text("暂无搜索历史", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), modifier = Modifier.padding(top = 16.dp))
                }
            }
        }
    }
}

@Composable
fun ClearHistoryDialog(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
        title = { Text("清空历史") },
        text = { Text("确定要删除所有搜索记录吗？") },
        confirmButton = {
            TextButton(onClick = onConfirm) { Text("确认", color = ErrorRed) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    )
}
