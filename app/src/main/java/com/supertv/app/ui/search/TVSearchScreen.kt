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
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
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

    var query by remember { mutableStateOf("") }
    var suggestions by remember { mutableStateOf<List<String>>(emptyList()) }
    var trending by remember { mutableStateOf<List<String>>(emptyList()) }
    var searchHistory by remember { mutableStateOf<List<String>>(emptyList()) }
    var showHistory by remember { mutableStateOf(false) }
    var isExactMode by remember { mutableStateOf(true) }
    var focusedKey by remember { mutableStateOf<String?>(null) }
    var debounceJob by remember { mutableStateOf<Job?>(null) }

    LaunchedEffect(Unit) {
        val saved = store.getString(HISTORY_KEY, "")
        if (saved.isNotBlank()) {
            try {
                val gson = com.google.gson.Gson()
                val type = object : com.google.gson.reflect.TypeToken<List<String>>() {}.type
                searchHistory = gson.fromJson(saved, type) ?: emptyList()
            } catch (_: Exception) {}
        }
        try {
            val resp = apiService.getSuggestions("")
            if (resp.isSuccessful) {
                trending = resp.body()?.filter { it.isNotBlank() }?.distinct() ?: emptyList()
            }
        } catch (_: Exception) {}
    }

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
        TopAppBar(
            title = { Text("TV 搜索", fontWeight = FontWeight.Bold, color = TextPrimary) },
            navigationIcon = {
                TextButton(onClick = onBack) { Text(" 返回", color = PrimaryGreen) }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = BackgroundDark)
        )

        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
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
                    text = if (query.isEmpty()) "输入拼音首字母" else query,
                    fontSize = 18.sp,
                    color = if (query.isEmpty()) TextTertiary else TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
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
            TVFuncButton(
                text = "退格",
                icon = Icons.AutoMirrored.Filled.Backspace,
                onClick = onBackspace,
                isFocused = focusedKey == "__backspace",
                onFocus = { onFocusChange("__backspace") },
                onBlur = { onFocusChange(null) },
                modifier = Modifier.weight(1f),
                color = FavoriteRed
            )
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

    Surface(
        modifier = Modifier
            .aspectRatio(1f)
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

@Composable
private fun TVFuncButton(
    text: String,
    icon: ImageVector,
    onClick: () -> Unit,
    isFocused: Boolean,
    onFocus: () -> Unit,
    onBlur: () -> Unit,
    modifier: Modifier = Modifier,
    color: Color = PrimaryGreen
) {
    val bgColor = if (isFocused) color else BackgroundCard

    Surface(
        modifier = modifier
            .height(44.dp)
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
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(label, fontSize = 13.sp, color = TextTertiary)
            Spacer(Modifier.weight(1f))

            if (showHistory && words.isNotEmpty()) {
                TVSmallButton(
                    icon = Icons.Default.Delete,
                    onClick = onClearHistory,
                    isFocused = focusedKey == "__clearHistory",
                    onFocus = { onFocusChange("__clearHistory") },
                    onBlur = { onFocusChange(null) }
                )
            }

            TVSmallButton(
                text = "建议",
                icon = null,
                onClick = onToggleMode,
                isFocused = focusedKey == "__mode",
                onFocus = { onFocusChange("__mode") },
                onBlur = { onFocusChange(null) }
            )

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

@Composable
private fun TVSmallButton(
    text: String? = null,
    icon: ImageVector? = null,
    onClick: () -> Unit,
    isFocused: Boolean,
    onFocus: () -> Unit,
    onBlur: () -> Unit
) {
    val bgColor = if (isFocused) PrimaryGreen.copy(alpha = 0.2f) else Color.Transparent

    Surface(
        modifier = Modifier
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
            ShimmerGrid(columns = 3)
        } else if (results.isNotEmpty()) {
            Text(
                text = "找到 ${results.size} 个结果",
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
                items(results, key = { "${it.id}${it.source}" }) { item ->
                    VideoCard(result = item, onClick = { onResultClick(item) })
                }
            }
        } else if (query.isNotEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text("无搜索结果", color = TextTertiary, fontSize = 14.sp)
            }
        } else {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text("输入关键词开始搜索", color = TextTertiary, fontSize = 14.sp)
            }
        }
    }
}
