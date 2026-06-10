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
import androidx.compose.foundation.lazy.grid.GridItemSpan
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
import androidx.compose.ui.draw.clip
import coil.compose.AsyncImage
import coil.request.ImageRequest
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
    onNavigateToDetail: (SearchResult) -> Unit,
    onBack: () -> Unit
) {
    val query by viewModel.query.collectAsState()
    val results by viewModel.results.collectAsState()
    val netDiskResults by viewModel.netDiskResults.collectAsState()
    val searchMode by viewModel.searchMode.collectAsState()
    val searchHistory by viewModel.searchHistory.collectAsState()
    val isSearching by viewModel.isSearching.collectAsState()

    val suggestions by viewModel.suggestions.collectAsState()

    var showClearDialog by remember { mutableStateOf(false) }
    var selectedNetDiskType by remember { mutableStateOf("") }
    
    // 快速换源相关
    var selectedResultForSources by remember { mutableStateOf<SearchResult?>(null) }
    
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
                            IconButton(onClick = { viewModel.clearResults() }) {
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

        // Search Progress Indicators (对齐用户要求：展示当前搜索词和进度)
        if (isSearching && searchMode == 0) {
            val progress by viewModel.searchProgress.collectAsState()
            val currentTerm by viewModel.currentSearchTerm.collectAsState()
            
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = if (currentTerm.isNotBlank()) "正在检索: $currentTerm" else "启动搜索引擎...",
                        fontSize = 11.sp,
                        color = PrimaryGreen,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = "${(progress * 100).toInt()}%",
                        fontSize = 11.sp,
                        color = secondaryTextColor,
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(Modifier.height(4.dp))
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth().height(2.dp).clip(RoundedCornerShape(1.dp)),
                    color = PrimaryGreen,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant
                )
            }
        }

        when {
            isSearching && results.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize()) { 
                    if (searchMode == 0) {
                        ShimmerGrid(columns = 3) // 对齐手机端 3 列
                    } else {
                        CircularProgressIndicator(color = PrimaryGreen, modifier = Modifier.align(Alignment.Center))
                    }
                }
            }

            searchMode == 0 && (results.isNotEmpty() || (isSearching && results.isNotEmpty())) -> {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(3),
                    contentPadding = PaddingValues(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(results, key = { "${it.id}${it.source}" }) { item ->
                        VideoCard(result = item, onClick = { 
                            selectedResultForSources = item 
                            viewModel.loadDetail(item.id, item.source, item.title)
                        })
                    }
                    
                    if (isSearching) {
                        // 搜索中且已有结果，在底部显示正在检索的提示
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(16.dp),
                                horizontalArrangement = Arrangement.Center,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = PrimaryGreen)
                                Spacer(Modifier.width(12.dp))
                                Text("全网激进检索中...", fontSize = 12.sp, color = secondaryTextColor)
                            }
                        }
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
                if (query.isNotBlank() && suggestions.isNotEmpty() && results.isEmpty()) {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(suggestions) { suggestion ->
                            ListItem(
                                headlineContent = { Text(suggestion) },
                                leadingContent = { Icon(Icons.Default.History, null, tint = secondaryTextColor) },
                                modifier = Modifier.clickable { viewModel.search(suggestion) }
                            )
                            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), thickness = 0.5.dp, color = MaterialTheme.colorScheme.outlineVariant)
                        }
                    }
                } else {
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

        // 快速换源 BottomSheet
        selectedResultForSources?.let { result ->
            val allSources by viewModel.allSources.collectAsState()
            
            ModalBottomSheet(
                onDismissRequest = { selectedResultForSources = null },
                containerColor = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
            ) {
                Column(Modifier.padding(bottom = 32.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        AsyncImage(
                            model = result.cover,
                            contentDescription = null,
                            modifier = Modifier.size(60.dp, 80.dp).clip(RoundedCornerShape(8.dp)),
                            contentScale = androidx.compose.ui.layout.ContentScale.Crop
                        )
                        Spacer(Modifier.width(16.dp))
                        Column(Modifier.weight(1f)) {
                            Text(result.title, fontWeight = FontWeight.Bold, fontSize = 18.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${result.sourceName} · ${result.year}", color = secondaryTextColor, fontSize = 14.sp)
                        }
                        Button(
                            onClick = { 
                                onNavigateToDetail(result)
                                selectedResultForSources = null
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                        ) {
                            Text("完整详情")
                        }
                    }
                    
                    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), thickness = 0.5.dp, color = MaterialTheme.colorScheme.outlineVariant)
                    
                    Text("选择播放源", modifier = Modifier.padding(16.dp), fontWeight = FontWeight.Bold, color = PrimaryGreen)

                    LazyColumn(modifier = Modifier.heightIn(max = 300.dp)) {
                        val currentSources = (if (allSources.any { it.title == result.title }) allSources else listOf(result))
                            .filter { it.source != "douban" && it.source != "bangumi" }
                            
                        if (currentSources.isEmpty()) {
                            item {
                                Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        CircularProgressIndicator(modifier = Modifier.size(24.dp), color = PrimaryGreen, strokeWidth = 2.dp)
                                        Spacer(Modifier.height(16.dp))
                                        Text("全网激进检索播放源中...", color = secondaryTextColor, fontSize = 14.sp)
                                    }
                                }
                            }
                        } else {
                            items(currentSources) { source ->
                                SearchSourceItem(
                                    context = LocalContext.current,
                                    source = source,
                                    onClick = {
                                        onResultClick(source)
                                        selectedResultForSources = null
                                    }
                                )
                            }
                        }
                    }
                }
            }
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NetDiskResultItem(item: NetDiskItem) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val uriHandler = LocalUriHandler.current
    
    val info = item.parsedInfo
    val displayTitle = if (info.title.isNotBlank()) info.title else item.title.ifBlank { item.name }
    
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
                Surface(
                    color = PrimaryGreen.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text(
                        text = item.source.uppercase(),
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        color = PrimaryGreen,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                
                val displayDate = if (item.datetime.startsWith("0001")) "未知日期" else item.datetime.take(10)
                Text(
                    text = displayDate,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    fontSize = 11.sp
                )
            }
            
            Spacer(Modifier.height(8.dp))
            
            Text(
                text = displayTitle,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 22.sp
            )
            
            // 解析出的标签
            FlowRow(
                modifier = Modifier.padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (info.type.isNotBlank()) {
                    TagItem(info.type, MaterialTheme.colorScheme.secondary)
                }
                if (info.quality.isNotBlank()) {
                    TagItem(info.quality, PrimaryGreen)
                }
                if (info.year.isNotBlank()) {
                    TagItem(info.year, MaterialTheme.colorScheme.tertiary)
                }
                if (info.language.isNotBlank()) {
                    TagItem(info.language, MaterialTheme.colorScheme.outline)
                }
                if (info.episode.isNotBlank()) {
                    TagItem(info.episode, Color(0xFFFFA000))
                }
            }

            if (item.note.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = item.note,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                    fontSize = 13.sp,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 18.sp
                )
            }
            
            if (item.password.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                Surface(
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.5f),
                    shape = RoundedCornerShape(6.dp),
                    modifier = Modifier.clickable {
                        clipboardManager.setText(AnnotatedString(item.password))
                        Toast.makeText(context, "提取码已复制: ${item.password}", Toast.LENGTH_SHORT).show()
                    }
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.VpnKey, null, modifier = Modifier.size(14.dp), tint = PrimaryGreen)
                        Spacer(Modifier.width(6.dp))
                        Text("提取码: ${item.password}", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        Spacer(Modifier.width(8.dp))
                        Icon(Icons.Default.ContentCopy, null, modifier = Modifier.size(12.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            // 图片预览 (如果有)
            if (!item.images.isNullOrEmpty()) {
                Spacer(Modifier.height(12.dp))
                androidx.compose.foundation.lazy.LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(item.images) { imgUrl ->
                        AsyncImage(
                            model = ImageRequest.Builder(LocalContext.current)
                                .data(imgUrl)
                                .crossfade(true)
                                .build(),
                            contentDescription = null,
                            modifier = Modifier
                                .size(100.dp, 140.dp)
                                .clip(RoundedCornerShape(8.dp)),
                            contentScale = androidx.compose.ui.layout.ContentScale.Crop
                        )
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { 
                        clipboardManager.setText(AnnotatedString(item.url))
                        Toast.makeText(context, "链接已复制", Toast.LENGTH_SHORT).show()
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
                    Text("打开资源", fontSize = 12.sp, color = Color.White)
                }
            }
        }
    }
}

@Composable
private fun TagItem(text: String, color: Color) {
    Surface(
        color = color.copy(alpha = 0.1f),
        shape = RoundedCornerShape(4.dp),
        border = androidx.compose.foundation.BorderStroke(0.5.dp, color.copy(alpha = 0.3f))
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            color = color,
            fontSize = 10.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
fun SearchSourceItem(
    context: android.content.Context,
    source: SearchResult,
    onClick: () -> Unit
) {
    ListItem(
        headlineContent = { Text(source.sourceName, fontWeight = FontWeight.Medium) },
        supportingContent = { Text("${source.episodes.size}集 · ${source.year}") },
        leadingContent = {
            Icon(Icons.Default.PlayCircle, null, tint = PrimaryGreen)
        },
        modifier = Modifier.clickable { onClick() },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent)
    )
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
