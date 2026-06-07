package com.supertv.app.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.Store
import com.supertv.app.model.SearchResult
import com.supertv.app.services.PinyinSuggestionsFetcher
import com.supertv.app.ui.components.ShimmerGrid
import com.supertv.app.ui.components.VideoCard
import com.supertv.app.ui.theme.*
import com.supertv.app.viewmodel.SearchViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ─── 键盘布局：A-Z + 0-9 ───
private val KEY_ROWS = listOf(
    listOf("A","B","C","D","E","F"),
    listOf("G","H","I","J","K","L"),
    listOf("M","N","O","P","Q","R"),
    listOf("S","T","U","V","W","X"),
    listOf("Y","Z","0","1","2","3"),
    listOf("4","5","6","7","8","9"),
)

private const val HISTORY_KEY = "tv_search_history"
private const val MAX_HISTORY = 15

/**
 * TV 端搜索界�?�?�?SuperTV_old-master/components/TVSearchView.tsx
 *
 * 三栏布局：键盘区 | 建议/历史 | 搜索结果
 * 拼音首字母输�?�?联网获取建议�?�?点击搜索
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TVSearchScreen(
    viewModel: SearchViewModel,
    onResultClick: (SearchResult) -> Unit,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val store = remember { Store.getInstance(context) }
    val apiService = remember { RetrofitClient.getApiService() }

    val results by viewModel.results.collectAsState()
    val isSearching by viewModel.isSearching.collectAsState()

    // ─── 本地状态（TV 搜索特有�?───
    var query by remember { mutableStateOf("") }
    var suggestions by remember { mutableStateOf<List<String>>(emptyList()) }
    var trending by remember { mutableStateOf<List<String>>(emptyList()) }
    var searchHistory by remember { mutableStateOf<List<String>>(emptyList()) }
    var showHistory by remember { mutableStateOf(false) }
    var isExactMode by remember { mutableStateOf(true) }
    var focusedKey by remember { mutableStateOf<String?>(null) }
    var debounceJob by remember { mutableStateOf<Job?>(null) }

    // ─── 初始化：加载历史 + 热门推荐 ───
    LaunchedEffect(Unit) {
        // 加载搜索历史
        val saved = store.getString(HISTORY_KEY)
        if (saved.isNotBlank()) {
            try {
                val gson = com.google.gson.Gson()
                val type = object : com.google.gson.reflect.TypeToken<List<String>>() {}.type
                searchHistory = gson.fromJson(saved, type) ?: emptyList()
            } catch (_: Exception) {}
        }
        // 加载热门推荐
        try {
            val resp = apiService.getSuggestions("")
            if (resp.isSuccessful) {
                trending = resp.body()?.filter { it.isNotBlank() }?.distinct() ?: emptyList()
            }
        } catch (_: Exception) {}
    }

    // ─── 防抖建议获取：query 变化�?200ms 后联网获�?───
    LaunchedEffect(query) {
        debounceJob?.cancel()
        if (query.length < 2) {
            suggestions = emptyList()
            return@LaunchedEffect
        }
        delay(200)
        suggestions = if (isExactMode) {
            PinyinSuggestionsFetcher.exactSuggest(query, apiService)
        } else {
            PinyinSuggestionsFetcher.fastSuggest(query)
        }
    }

    // ─── 保存历史 ───
    fun saveHistory(term: String) {
        val updated = listOf(term) + searchHistory.filter { it != term }
        val trimmed = updated.take(MAX_HISTORY)
        searchHistory = trimmed
        scope.launch {
            store.putString(HISTORY_KEY, com.google.gson.Gson().toJson(trimmed))
        }
    }

    fun doSearch(term: String) {
        if (term.isBlank()) return
        saveHistory(term)
        suggestions = emptyList()
        viewModel.search(term)
    }

    // 当前显示的词列表
    val currentWords = when {
        showHistory -> searchHistory
        suggestions.isNotEmpty() -> suggestions
        else -> trending
    }
    val wordLabel = when {
        showHistory -> "搜索历史"
        suggestions.isNotEmpty() -> "拼音联想"
        else -> "热门推荐"
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        // ─── 顶部�?───
        TopAppBar(
            title = { Text("TV 搜索", fontWeight = FontWeight.Bold, color = TextPrimary) },
            navigationIcon = {
                TextButton(onClick = onBack) { Text("�?返回", color = PrimaryGreen) }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = BackgroundDark)
        )

        // ─── 三栏主体 ───
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            // ===== 左栏：键盘区 =====
            LeftKeyboardPane(
                query = query,
                onQueryChange = { query = it; viewModel.updateQuery(it) },
                onSearch = { doSearch(query) },
                onBackspace = { if (query.isNotEmpty()) query = query.dropLast(1) },
                onClear = { query = ""; suggestions = emptyList(); viewModel.updateQuery("") },
                focusedKey = focusedKey,
                onFocusChange = { focusedKey = it }
            )

            Spacer(Modifier.width(12.dp))

            // ===== 中栏：建�?历史 =====
            MiddleSuggestionPane(
                words = currentWords,
                label = wordLabel,
                isExactMode = isExactMode,
                showHistory = showHistory,
                onToggleMode = { isExactMode = !isExactMode },
                onToggleHistory = { showHistory = !showHistory },
                onClearHistory = {
                    searchHistory = emptyList()
                    scope.launch { store.putString(HISTORY_KEY, "[]") }
                },
                onWordClick = { word -> doSearch(word) },
                focusedKey = focusedKey,
                onFocusChange = { focusedKey = it }
            )

            Spacer(Modifier.width(12.dp))

            // ===== 右栏：搜索结�?=====
            RightResultsPane(
                results = results,
                isSearching = isSearching,
                query = query,
                onResultClick = onResultClick,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

// ─── 左栏：键�?+ 输入�?───
@Composable
private fun LeftKeyboardPane(
    query: String,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onBackspace: () -> Unit,
    onClear: () -> Unit,
    focusedKey: String?,
    onFocusChange: (String?) -> Unit
) {
    Column(
        modifier = Modifier.width(280.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // 输入�?
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            shape = RoundedCornerShape(8.dp),
            color = BackgroundCard
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 12.dp),
                contentAlignment = Alignment.CenterStart
            ) {
                Text(
                    text = if (query.isEmpty()) "输入拼音首字�? else query,
                    fontSize = 18.sp,
                    color = if (query.isEmpty()) TextTertiary else TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        // 功能按钮行：搜索 | 退�?
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // 搜索按钮
            TVFuncButton(
                text = "搜索",
                icon = Icons.Default.Search,
                onClick = onSearch,
                isFocused = focusedKey == "__search",
                onFocus = { onFocusChange("__search") },
                onBlur = { onFocusChange(null) },
                modifier = Modifier.weight(1f),
                color = PrimaryGreen
            )
            // 退格按�?
            TVFuncButton(
                text = "退�?,
                icon = Icons.Default.Backspace,
                onClick = onBackspace,
                isFocused = focusedKey == "__backspace",
                onFocus = { onFocusChange("__backspace") },
                onBlur = { onFocusChange(null) },
                modifier = Modifier.weight(1f),
                color = FavoriteRed
            )
            // 清除按钮
            if (query.isNotEmpty()) {
                TVFuncButton(
                    text = "",
                    icon = Icons.Default.Clear,
                    onClick = onClear,
                    isFocused = focusedKey == "__clear",
                    onFocus = { onFocusChange("__clear") },
                    onBlur = { onFocusChange(null) },
                    modifier = Modifier.width(48.dp),
                    color = TextTertiary
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        // 字母数字键盘
        KEY_ROWS.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                row.forEach { key ->
                    TVKeyButton(
                        key = key,
                        isFocused = focusedKey == key,
                        onFocus = { onFocusChange(key) },
                        onBlur = { onFocusChange(null) },
                        onClick = {
                            if (query.length < 20) onQueryChange(query + key.lowercase())
                        }
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
        }
    }
}

// ─── 键盘按键 ───
@Composable
private fun TVKeyButton(
    key: String,
    isFocused: Boolean,
    onFocus: () -> Unit,
    onBlur: () -> Unit,
    onClick: () -> Unit
) {
    val bgColor = if (isFocused) PrimaryGreen else BackgroundCard
    val borderColor = if (isFocused) PrimaryGreen else Color(0xFF2A2A3E)
    val focusRequester = remember { FocusRequester() }

    Surface(
        modifier = Modifier
            .aspectRatio(1f)
            .focusRequester(focusRequester)
            .focusable()
            .onFocusChanged { if (it.isFocused) onFocus() else onBlur() }
            .clickable(onClick = onClick)
            .border(1.dp, borderColor, RoundedCornerShape(8.dp)),
        shape = RoundedCornerShape(8.dp),
        color = bgColor
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = key,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = if (isFocused) Color.White else TextPrimary,
                textAlign = TextAlign.Center
            )
        }
    }
}

// ─── 功能按钮 ───
@Composable
private fun TVFuncButton(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
    isFocused: Boolean,
    onFocus: () -> Unit,
    onBlur: () -> Unit,
    modifier: Modifier = Modifier,
    color: Color = PrimaryGreen
) {
    val bgColor = if (isFocused) color else BackgroundCard
    val focusRequester = remember { FocusRequester() }

    Surface(
        modifier = modifier
            .height(44.dp)
            .focusRequester(focusRequester)
            .focusable()
            .onFocusChanged { if (it.isFocused) onFocus() else onBlur() }
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        color = bgColor
    ) {
        Row(
            modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(icon, contentDescription = null, tint = if (isFocused) Color.White else color, modifier = Modifier.size(18.dp))
            if (text.isNotEmpty()) {
                Spacer(Modifier.width(4.dp))
                Text(text = text, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = if (isFocused) Color.White else color)
            }
        }
    }
}

// ─── 中栏：建�?历史 ───
@Composable
private fun MiddleSuggestionPane(
    words: List<String>,
    label: String,
    isExactMode: Boolean,
    showHistory: Boolean,
    onToggleMode: () -> Unit,
    onToggleHistory: () -> Unit,
    onClearHistory: () -> Unit,
    onWordClick: (String) -> Unit,
    focusedKey: String?,
    onFocusChange: (String?) -> Unit
) {
    Column(modifier = Modifier.width(240.dp)) {
        // 标题�?
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(label, fontSize = 13.sp, color = TextTertiary)
            Spacer(Modifier.weight(1f))

            // 清空历史
            if (showHistory && words.isNotEmpty()) {
                TVSmallButton(
                    icon = Icons.Default.DeleteOutline,
                    onClick = onClearHistory,
                    isFocused = focusedKey == "__clearHistory",
                    onFocus = { onFocusChange("__clearHistory") },
                    onBlur = { onFocusChange(null) }
                )
            }

            // 切换 精准/快�?模式
            TVSmallButton(
                text = "精准建议",
                icon = null,
                onClick = onToggleMode,
                isFocused = focusedKey == "__mode",
                onFocus = { onFocusChange("__mode") },
                onBlur = { onFocusChange(null) }
            )

            // 切换 历史/联想
            TVSmallButton(
                text = if (showHistory) "联想" else "历史",
                icon = Icons.Default.SwapHoriz,
                onClick = onToggleHistory,
                isFocused = focusedKey == "__switch",
                onFocus = { onFocusChange("__switch") },
                onBlur = { onFocusChange(null) }
            )
        }

        Spacer(Modifier.height(8.dp))

        // 词列�?
        LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(words.distinct().take(9)) { word ->
                val wordFocusKey = "__word_${word.hashCode()}"
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusable()
                        .onFocusChanged {
                            if (it.isFocused) onFocusChange(wordFocusKey)
                            else if (focusedKey == wordFocusKey) onFocusChange(null)
                        }
                        .clickable { onWordClick(word) },
                    shape = RoundedCornerShape(8.dp),
                    color = if (focusedKey == wordFocusKey) BackgroundSurface else Color.Transparent
                ) {
                    Text(
                        text = word,
                        fontSize = 14.sp,
                        color = TextPrimary,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

// ─── 小型按钮 ───
@Composable
private fun TVSmallButton(
    text: String? = null,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    onClick: () -> Unit,
    isFocused: Boolean,
    onFocus: () -> Unit,
    onBlur: () -> Unit
) {
    val bgColor = if (isFocused) PrimaryGreen.copy(alpha = 0.2f) else Color.Transparent
    val focusRequester = remember { FocusRequester() }

    Surface(
        modifier = Modifier
            .focusRequester(focusRequester)
            .focusable()
            .onFocusChanged { if (it.isFocused) onFocus() else onBlur() }
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(6.dp),
        color = bgColor
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(14.dp))
            }
            if (text != null) {
                if (icon != null) Spacer(Modifier.width(3.dp))
                Text(text = text, fontSize = 12.sp, color = if (isFocused) PrimaryGreen else TextSecondary)
            }
        }
    }
}

// ─── 右栏：搜索结�?───
@Composable
private fun RightResultsPane(
    results: List<SearchResult>,
    isSearching: Boolean,
    query: String,
    onResultClick: (SearchResult) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        if (isSearching) {
            ShimmerGrid(columns = 3, count = 6)
        } else if (results.isNotEmpty()) {
            Text(
                text = "找到 ${results.size} 个结�?,
                fontSize = 13.sp,
                color = TextTertiary,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                contentPadding = PaddingValues(4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(results, key = { it.id + it.source }) { item ->
                    VideoCard(result = item, onClick = { onResultClick(item) })
                }
            }
        } else if (query.isNotEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text("无搜索结�?, color = TextTertiary, fontSize = 14.sp)
            }
        } else {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text("输入关键词开始搜�?, color = TextTertiary, fontSize = 14.sp)
            }
        }
    }
}
