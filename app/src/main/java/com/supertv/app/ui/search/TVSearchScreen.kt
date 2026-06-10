package com.supertv.app.ui.search

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowRight
import androidx.compose.material.icons.automirrored.outlined.Backspace
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.Store
import com.supertv.app.model.SearchResult
import com.supertv.app.services.PinyinSuggestionsFetcher
import com.supertv.app.services.ImageUrlHelper
import com.supertv.app.ui.components.VideoCard
import com.supertv.app.ui.theme.*
import com.supertv.app.viewmodel.SearchViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val KEY_ROWS = listOf(
    listOf("A","B","C","D","E","F"),
    listOf("G","H","I","J","K","L"),
    listOf("M","N","O","P","Q","R"),
    listOf("S","T","U","V","W","X"),
    listOf("Y","Z","0","1","2","3"),
    listOf("4","5","6","7","8","9"),
)

private const val MAX_HISTORY = 15

// TV 专用颜色 (同步 TVSearchView.tsx)
private val TV_BG = Color(0xFF121212)
private val TV_INPUT_BG = Color(0xFF1C1C1E)
private val TV_BTN_BG = Color(0xFF2A2A2E)
private val TV_FOCUSED_BG = Color(0xFF0A2A0A)
private val TV_FOCUSED_BORDER = Color(0xFF00BB5E)

@Composable
fun TVSearchScreen(
    viewModel: SearchViewModel,
    onResultClick: (SearchResult) -> Unit,
    onBack: () -> Unit
) {
    SuperTVTheme {
        val context = LocalContext.current
        val store = remember { Store.getInstance(context) }
        val apiService = remember { RetrofitClient.getApiService() }

        val results by viewModel.tvResults.collectAsState()
        val isSearching by viewModel.isSearching.collectAsState()
        val viewModelQuery by viewModel.query.collectAsState()

        var query by remember { mutableStateOf("") }
        var suggestions by remember { mutableStateOf<List<String>>(emptyList()) }
        var trending by remember { mutableStateOf<List<String>>(emptyList()) }
        var searchHistory by remember { mutableStateOf<List<String>>(emptyList()) }
        var showHistory by remember { mutableStateOf(false) }
        var isExactMode by remember { mutableStateOf(store.getBoolean("tv_search_mode_is_exact", true)) }
        var focusedKey by remember { mutableStateOf<String?>(null) }
        var debounceJob by remember { mutableStateOf<Job?>(null) }
        
        val inputFocusRequester = remember { FocusRequester() }

        // 初始化加载
        LaunchedEffect(Unit) {
            inputFocusRequester.requestFocus()
            
            // 加载历史
            searchHistory = store.getSearchHistory().take(MAX_HISTORY)

            // 加载热搜/建议
            try {
                val resp = apiService.getSuggestions("")
                if (resp.isSuccessful) {
                    trending = resp.body()?.filter { it.isNotBlank() } ?: emptyList()
                }
            } catch (_: Exception) {}
        }

        // 拼音联想逻辑
        LaunchedEffect(query, isExactMode) {
            debounceJob?.cancel()
            if (query.length < 2) {
                suggestions = emptyList()
                return@LaunchedEffect
            }
            debounceJob = launch {
                delay(200)
                suggestions = if (isExactMode) {
                    PinyinSuggestionsFetcher.exactSuggest(query, apiService)
                } else {
                    PinyinSuggestionsFetcher.fastSuggest(query)
                }
            }
        }

        fun doSearch(term: String = query) {
            if (term.isBlank()) return
            viewModel.searchTV(term)
            // 更新历史
            val updated = (listOf(term) + searchHistory.filter { it != term }).take(MAX_HISTORY)
            searchHistory = updated
            store.addSearchHistory(term)
        }

        val currentWords = if (showHistory) searchHistory else (suggestions.ifEmpty { trending })
        val wordLabel = if (showHistory) "历史" else (if (suggestions.isNotEmpty()) "拼音联想" else "建议")

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(TV_BG)
                .windowInsetsPadding(WindowInsets.safeDrawing)
        ) {
            // Close Button
            IconButton(
                onClick = onBack,
                modifier = Modifier.padding(16.dp).align(Alignment.TopEnd)
            ) {
                Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White)
            }

            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(12.dp)
            ) {
                // Left Pane (30%)
                Column(modifier = Modifier.weight(0.3f).padding(horizontal = 10.dp)) {
                    // Input Box
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 8.dp)) {
                        TVBoxItem(
                            isFocused = focusedKey == "__input",
                            onFocus = { focusedKey = "__input" },
                            modifier = Modifier.weight(1f).height(52.dp).focusRequester(inputFocusRequester),
                            onClick = { /* 默认聚焦不执行操作 */ }
                        ) {
                            Text(
                                text = query.ifEmpty { "输入拼音首字母" },
                                color = if (query.isEmpty()) Color(0xFF888888) else Color.White,
                                fontSize = 18.sp,
                                modifier = Modifier.padding(horizontal = 14.dp)
                            )
                        }
                        
                        if (query.isNotEmpty()) {
                            Spacer(Modifier.width(6.dp))
                            TVBoxItem(
                                isFocused = focusedKey == "__clear",
                                onFocus = { focusedKey = "__clear" },
                                modifier = Modifier.size(52.dp),
                                onClick = { 
                                    query = ""
                                    viewModel.clearResults()
                                    suggestions = emptyList()
                                }
                            ) {
                                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.Clear, contentDescription = "Clear", tint = Color.White, modifier = Modifier.size(20.dp))
                                }
                            }
                        }
                    }

                    // Function Buttons
                    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TVFuncBtn(
                            text = "搜索",
                            icon = Icons.Outlined.Search,
                            isFocused = focusedKey == "__search",
                            onFocus = { focusedKey = "__search" },
                            onClick = { doSearch() },
                            modifier = Modifier.weight(1f)
                        )
                        TVFuncBtn(
                            text = "退格",
                            icon = Icons.AutoMirrored.Outlined.Backspace,
                            isFocused = focusedKey == "__backspace",
                            onFocus = { focusedKey = "__backspace" },
                            onClick = { if (query.isNotEmpty()) query = query.dropLast(1) },
                            modifier = Modifier.weight(1f),
                            contentColor = Color(0xFFFF6B6B)
                        )
                    }

                    // Keyboard
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
                        KEY_ROWS.forEach { row ->
                            Row(modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                row.forEach { key ->
                                    TVKeyItem(
                                        text = key,
                                        isFocused = focusedKey == key,
                                        onFocus = { focusedKey = key },
                                        onClick = { if (query.length < 20) query += key.lowercase() },
                                        modifier = Modifier.weight(1f).height(52.dp)
                                    )
                                }
                            }
                        }
                    }

                    // Remote Button
                    TVBoxItem(
                        isFocused = focusedKey == "__remote",
                        onFocus = { focusedKey = "__remote" },
                        onClick = { /* TODO: Remote Input Modal */ },
                        modifier = Modifier.fillMaxWidth().height(52.dp).padding(top = 6.dp),
                        backgroundColor = Color(0xFF1A2A1A),
                        borderColor = Color(0xFF2A4A2A)
                    ) {
                        Text("远程输入", color = PrimaryGreen, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                    }
                }

                // Middle Pane (22%)
                Column(modifier = Modifier.weight(0.22f).padding(horizontal = 8.dp).border(width = (0.5).dp, color = Color(0xFF222222), shape = RoundedCornerShape(0.dp))) {
                    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(wordLabel, color = Color(0xFFAAAAAA), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TVSmallBtn(
                                text = if (isExactMode) "精准" else "快速",
                                isFocused = focusedKey == "__mode",
                                onFocus = { focusedKey = "__mode" },
                                onClick = { 
                                    isExactMode = !isExactMode
                                    store.putBoolean("tv_search_mode_is_exact", isExactMode)
                                }
                            )
                            
                            if (showHistory && searchHistory.isNotEmpty()) {
                                TVSmallBtn(
                                    icon = Icons.Default.Delete,
                                    isFocused = focusedKey == "__clearHistory",
                                    onFocus = { focusedKey = "__clearHistory" },
                                    onClick = { 
                                        searchHistory = emptyList()
                                        store.clearSearchHistory()
                                    }
                                )
                            }

                            TVSmallBtn(
                                text = if (showHistory) "联想" else "历史",
                                icon = Icons.AutoMirrored.Filled.ArrowRight,
                                isFocused = focusedKey == "__switch",
                                onFocus = { focusedKey = "__switch" },
                                onClick = { showHistory = !showHistory }
                            )
                        }
                    }

                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        val words = currentWords.map { it.replace("\\s+".toRegex(), "") }.distinct().take(9)
                        itemsIndexed(words) { index, word ->
                            val key = "__word_$index"
                            TVWordItem(
                                text = word,
                                isFocused = focusedKey == key,
                                onFocus = { focusedKey = key },
                                onClick = { query = word; doSearch(word) }
                            )
                        }
                    }
                }

                // Right Pane (Remaining)
                Box(modifier = Modifier.weight(0.48f).padding(horizontal = 10.dp)) {
                    if (isSearching && results.isEmpty()) {
                        com.supertv.app.ui.components.ShimmerGrid(columns = 2, count = 6)
                    } else if (results.isNotEmpty()) {
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(2),
                            contentPadding = PaddingValues(8.dp),
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            itemsIndexed(results) { _, item ->
                                TVVideoCard(
                                    result = item,
                                    onClick = { onResultClick(item) }
                                )
                            }
                            
                            if (isSearching) {
                                item(span = { GridItemSpan(maxLineSpan) }) {
                                    Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                                        CircularProgressIndicator(color = PrimaryGreen, modifier = Modifier.size(24.dp))
                                    }
                                }
                            }
                        }
                    } else if (viewModelQuery.isNotEmpty() && !isSearching) {
                        Text(
                            "未找到 \"$viewModelQuery\" 相关内容",
                            color = Color(0xFF888888),
                            fontSize = 16.sp,
                            modifier = Modifier.align(Alignment.Center),
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun TVVideoCard(
    result: SearchResult,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    var isFocused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(if (isFocused) 1.05f else 1f, label = "scale")

    // 使用 ImageUrlHelper 处理 URL 和请求头，解决防盗链和加速问题
    val processedUrl = remember(result.cover, result.source) {
        ImageUrlHelper.processImageUrl(result.cover, result.source)
    }
    val imageHeaders = remember(result.cover, result.source) {
        ImageUrlHelper.getImageHeaders(result.cover, result.source)
    }

    Column(
        modifier = Modifier
            .width(150.dp) // 稍微调整宽度，适配 1080P/720P TV
            .scale(scale)
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .clickable { onClick() }
            .padding(6.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(0.7f) // 与主页 VideoCard 比例一致
                .clip(RoundedCornerShape(8.dp))
                .border(
                    width = if (isFocused) 3.dp else 1.dp,
                    color = if (isFocused) PrimaryGreen else Color(0xFF333333),
                    shape = RoundedCornerShape(8.dp)
                )
                .background(Color(0xFF222222))
        ) {
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(processedUrl)
                    .crossfade(true)
                    .addHeader("Referer", imageHeaders["Referer"] ?: "")
                    .addHeader("User-Agent", imageHeaders["User-Agent"] ?: "")
                    .build(),
                contentDescription = result.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )

            // Rating Badge (与主页一致，位于左上)
            if (result.rating.isNotBlank() && result.rating != "0") {
                Surface(
                    color = Color(0xCC000000),
                    shape = RoundedCornerShape(bottomEnd = 8.dp),
                    modifier = Modifier.align(Alignment.TopStart)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Filled.Star,
                            contentDescription = null,
                            tint = Color(0xFFFFC107),
                            modifier = Modifier.size(10.dp)
                        )
                        Spacer(Modifier.width(2.dp))
                        Text(
                            text = result.rating,
                            color = Color.White,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Year/Source Badge (位于左下)
            if (result.sourceName.isNotBlank() || result.year.isNotBlank()) {
                Surface(
                    color = Color(0x99000000),
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier.padding(4.dp).align(Alignment.BottomStart)
                ) {
                    val label = if (result.sourceName.isNotBlank()) {
                        if (result.year.isNotBlank()) "${result.sourceName} · ${result.year}" else result.sourceName
                    } else result.year
                    
                    Text(
                        text = label,
                        color = Color.White,
                        fontSize = 9.sp,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                    )
                }
            }

            // Episode Badge (位于右上)
            if (result.episodes.isNotEmpty() || (result.type.isNotBlank())) {
                 Surface(
                    color = PrimaryGreen.copy(alpha = 0.9f),
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier.padding(4.dp).align(Alignment.TopEnd)
                ) {
                    val epText = if (result.episodes.isNotEmpty()) "${result.episodes.size}集" else result.type
                    Text(
                        text = epText,
                        color = Color.White,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                    )
                }
            }
        }
        
        Spacer(Modifier.height(6.dp))
        
        Text(
            text = result.title,
            color = if (isFocused) PrimaryGreen else Color.White,
            fontSize = 12.sp,
            fontWeight = if (isFocused) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1, // TV 建议单行，防止布局错位
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
fun TVBoxItem(
    isFocused: Boolean,
    onFocus: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    backgroundColor: Color = TV_INPUT_BG,
    borderColor: Color = Color(0xFF333333),
    content: @Composable BoxScope.() -> Unit
) {
    Box(
        modifier = modifier
            .shadow(if (isFocused) 10.dp else 0.dp, shape = RoundedCornerShape(10.dp), spotColor = TV_FOCUSED_BORDER)
            .background(if (isFocused) TV_FOCUSED_BG else backgroundColor, shape = RoundedCornerShape(10.dp))
            .border(if (isFocused) 3.dp else 2.dp, if (isFocused) TV_FOCUSED_BORDER else borderColor, shape = RoundedCornerShape(10.dp))
            .focusable()
            .onFocusChanged { if (it.isFocused) onFocus() }
            .clickable { onClick() },
        contentAlignment = Alignment.CenterStart,
        content = content
    )
}

@Composable
fun TVKeyItem(
    text: String,
    isFocused: Boolean,
    onFocus: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(if (isFocused) TV_FOCUSED_BG else TV_BTN_BG, shape = RoundedCornerShape(10.dp))
            .border(if (isFocused) 3.dp else 2.dp, if (isFocused) TV_FOCUSED_BORDER else Color(0xFF3A3A3E), shape = RoundedCornerShape(10.dp))
            .focusable()
            .onFocusChanged { if (it.isFocused) onFocus() }
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(text, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun TVFuncBtn(
    text: String,
    icon: ImageVector,
    isFocused: Boolean,
    onFocus: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    contentColor: Color = Color.White
) {
    Row(
        modifier = modifier
            .height(54.dp)
            .background(if (isFocused) TV_FOCUSED_BG else TV_BTN_BG, shape = RoundedCornerShape(12.dp))
            .border(if (isFocused) 3.dp else 2.dp, if (isFocused) TV_FOCUSED_BORDER else Color(0xFF3A3A3E), shape = RoundedCornerShape(12.dp))
            .focusable()
            .onFocusChanged { if (it.isFocused) onFocus() }
            .clickable { onClick() },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        Icon(icon, contentDescription = null, tint = contentColor, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text(text, color = contentColor, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun TVSmallBtn(
    text: String? = null,
    icon: ImageVector? = null,
    isFocused: Boolean,
    onFocus: () -> Unit,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .background(TV_BTN_BG, shape = RoundedCornerShape(8.dp))
            .border(if (isFocused) 2.dp else 0.dp, if (isFocused) TV_FOCUSED_BORDER else Color.Transparent, shape = RoundedCornerShape(8.dp))
            .padding(8.dp)
            .focusable()
            .onFocusChanged { if (it.isFocused) onFocus() }
            .clickable { onClick() },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        icon?.let { Icon(it, contentDescription = null, tint = if (isFocused) TV_FOCUSED_BORDER else Color(0xFF888888), modifier = Modifier.size(14.dp)) }
        if (text != null && icon != null) Spacer(Modifier.width(4.dp))
        text?.let { Text(it, color = if (isFocused) TV_FOCUSED_BORDER else Color(0xFF888888), fontSize = 14.sp) }
    }
}

@Composable
fun TVWordItem(
    text: String,
    isFocused: Boolean,
    onFocus: () -> Unit,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (isFocused) TV_FOCUSED_BG else TV_BTN_BG, shape = RoundedCornerShape(8.dp))
            .border(if (isFocused) 3.dp else 2.dp, if (isFocused) TV_FOCUSED_BORDER else Color(0xFF3A3A3E), shape = RoundedCornerShape(8.dp))
            .padding(vertical = 12.dp)
            .focusable()
            .onFocusChanged { if (it.isFocused) onFocus() }
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = Color(0xFFDDDDDD),
            fontSize = 16.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 12.dp)
        )
    }
}
