package com.supertv.app.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.supertv.app.data.ApiNodeService
import com.supertv.app.data.AuthRepository
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.Store
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import com.supertv.app.model.*
import com.supertv.app.ui.theme.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

enum class MenuPage {
    Main, NodeSelection, AIRecommend, ReleaseCalendar, WatchHistory, Favorites, Settings, About, Stats
}

@Composable
fun UserMenu(
    onClose: () -> Unit,
    onLogout: () -> Unit,
    onNavigateToDetail: (id: String, source: String, title: String) -> Unit = { _, _, _ -> },
    onNavigateToDownloads: () -> Unit = {}
) {
    val context = LocalContext.current
    val store = remember { Store.getInstance(context) }
    val authRepo = remember { AuthRepository.getInstance(context) }
    val nodes = remember { ApiNodeService.getNodes(context) }
    
    // 获取全局主题状态
    val isDarkTheme = store.getBoolean("is_dark_theme", true)

    var currentPage by remember { mutableStateOf(MenuPage.Main) }
    var selectedNodeUrl by remember { 
        mutableStateOf(store.getApiBaseUrl() ?: nodes.firstOrNull()?.url ?: "") 
    }

    // 初始化 Retrofit
    LaunchedEffect(Unit) {
        val savedUrl = store.getApiBaseUrl()
        if (savedUrl == null && nodes.isNotEmpty()) {
            val firstUrl = nodes.first().url
            store.saveApiBaseUrl(firstUrl)
            RetrofitClient.switchBaseUrl(firstUrl)
            selectedNodeUrl = firstUrl
        } else if (savedUrl != null) {
            RetrofitClient.switchBaseUrl(savedUrl)
        }
    }

    SuperTVTheme(darkTheme = isDarkTheme) {
        Dialog(
            onDismissRequest = onClose,
            properties = DialogProperties(
                usePlatformDefaultWidth = false,
                dismissOnBackPress = true,
                dismissOnClickOutside = true
            )
        ) {
            // 使用 fillMaxSize 并确保背景覆盖全屏
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.6f))
                    .clickable { onClose() },
                contentAlignment = Alignment.Center
            ) {
                Surface(
                    modifier = Modifier
                        .widthIn(max = 400.dp)
                        .fillMaxWidth(0.85f)
                        .padding(vertical = 24.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .clickable(enabled = false) { },
                    color = MaterialTheme.colorScheme.surface,
                    tonalElevation = 8.dp
                ) {
                    // 添加滚动支持，适配横屏
                    Column(
                        modifier = Modifier
                            .padding(vertical = 8.dp)
                            .verticalScroll(rememberScrollState())
                    ) {
                        AnimatedContent(
                            targetState = currentPage,
                            transitionSpec = {
                                if (targetState == MenuPage.Main) {
                                    (slideInHorizontally { -it } + fadeIn()).togetherWith(slideOutHorizontally { it } + fadeOut())
                                } else {
                                    (slideInHorizontally { it } + fadeIn()).togetherWith(slideOutHorizontally { -it } + fadeOut())
                                }
                            },
                            label = "MenuPageTransition"
                        ) { page ->
                            when (page) {
                                MenuPage.Main -> MainMenu(
                                    onNavigateToNodes = { currentPage = MenuPage.NodeSelection },
                                    onNavigateToAI = { currentPage = MenuPage.AIRecommend },
                                    onNavigateToCalendar = { currentPage = MenuPage.ReleaseCalendar },
                                    onNavigateToHistory = { currentPage = MenuPage.WatchHistory },
                                    onNavigateToFavorites = { currentPage = MenuPage.Favorites },
                                    onNavigateToSettings = { currentPage = MenuPage.Settings },
                                    onNavigateToAbout = { currentPage = MenuPage.About },
                                    onNavigateToStats = { currentPage = MenuPage.Stats },
                                    onNavigateToDownloads = {
                                        onNavigateToDownloads()
                                        onClose()
                                    },
                                    onLogout = {
                                        val scope = CoroutineScope(Dispatchers.Main)
                                        scope.launch {
                                            authRepo.logout(RetrofitClient.getApiService())
                                            onLogout()
                                            onClose()
                                        }
                                    }
                                )
                                MenuPage.NodeSelection -> NodeSelectionMenu(
                                    nodes = nodes.toList(),
                                    selectedUrl = selectedNodeUrl,
                                    onNodeSelected = { node ->
                                        store.saveApiBaseUrl(node.url)
                                        RetrofitClient.switchBaseUrl(node.url)
                                        selectedNodeUrl = node.url
                                        currentPage = MenuPage.Main
                                    },
                                    onBack = { currentPage = MenuPage.Main }
                                )
                                MenuPage.AIRecommend -> AIRecommendMenu(onBack = { currentPage = MenuPage.Main })
                                MenuPage.ReleaseCalendar -> ReleaseCalendarMenu(onBack = { currentPage = MenuPage.Main })
                                MenuPage.WatchHistory -> WatchHistoryMenu(
                                    onBack = { currentPage = MenuPage.Main },
                                    onDetailClick = { id, src, title ->
                                        onNavigateToDetail(id, src, title)
                                        onClose()
                                    }
                                )
                                MenuPage.Favorites -> FavoritesMenu(
                                    onBack = { currentPage = MenuPage.Main },
                                    onDetailClick = { id, src, title ->
                                        onNavigateToDetail(id, src, title)
                                        onClose()
                                    }
                                )
                                MenuPage.Settings -> SettingsMenu(onBack = { currentPage = MenuPage.Main })
                                MenuPage.About -> AboutMenu(onBack = { currentPage = MenuPage.Main })
                                MenuPage.Stats -> StatsMenu(onBack = { currentPage = MenuPage.Main })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun MainMenu(
    onNavigateToNodes: () -> Unit,
    onNavigateToAI: () -> Unit,
    onNavigateToCalendar: () -> Unit,
    onNavigateToHistory: () -> Unit,
    onNavigateToFavorites: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToAbout: () -> Unit,
    onNavigateToStats: () -> Unit,
    onNavigateToDownloads: () -> Unit,
    onLogout: () -> Unit
) {
    Column {
        // User Info Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(PrimaryGreen, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Person, contentDescription = null, tint = Color.White)
            }
            Spacer(Modifier.width(16.dp))
            Column {
                val context = LocalContext.current
                val authRepo = remember { AuthRepository.getInstance(context) }
                val userInfo = authRepo.getUserInfo()
                
                Text("当前用户", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val displayName = when {
                        !userInfo?.nickname.isNullOrBlank() -> userInfo?.nickname
                        !userInfo?.username.isNullOrBlank() -> userInfo?.username
                        authRepo.getSavedUsername().isNotBlank() -> authRepo.getSavedUsername()
                        else -> "已登录"
                    }
                    Text(displayName ?: "", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                    Spacer(Modifier.width(8.dp))
                    Surface(color = PrimaryGreen.copy(alpha = 0.2f), shape = RoundedCornerShape(4.dp)) {
                        Text("V2", color = PrimaryGreen, fontSize = 10.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp))
                    }
                }
            }
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant, thickness = 1.dp)

        MenuItem(icon = Icons.Rounded.AutoAwesome, title = "AI 智能推荐", iconColor = PrimaryGreen, onClick = onNavigateToAI)
        MenuItem(icon = Icons.Rounded.CalendarMonth, title = "即将上映日历", onClick = onNavigateToCalendar)
        MenuItem(icon = Icons.Rounded.History, title = "观看历史", onClick = onNavigateToHistory)
        MenuItem(icon = Icons.Rounded.Favorite, title = "我的收藏", onClick = onNavigateToFavorites)
        MenuItem(icon = Icons.Rounded.FileDownload, title = "离线缓存", onClick = onNavigateToDownloads)
        MenuItem(icon = Icons.Rounded.Dns, title = "服务器节点", onClick = onNavigateToNodes)
        MenuItem(icon = Icons.Rounded.Settings, title = "偏好设置", onClick = onNavigateToSettings)
        MenuItem(icon = Icons.Rounded.BarChart, title = "数据统计", onClick = onNavigateToStats)
        MenuItem(icon = Icons.Rounded.Info, title = "关于我们", onClick = onNavigateToAbout)
        
        Spacer(Modifier.height(8.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant, thickness = 1.dp)
        
        MenuItem(
            icon = Icons.AutoMirrored.Rounded.Logout, 
            title = "退出登录", 
            textColor = ErrorRed,
            iconColor = ErrorRed,
            onClick = onLogout
        )
    }
}

@Composable
fun AIRecommendMenu(onBack: () -> Unit) {
    var aiResponse by remember { mutableStateOf("正在通过 GPT-5o 为您生成推荐...") }
    
    LaunchedEffect(Unit) {
        try {
            val apiService = RetrofitClient.getApiService()
            val response = apiService.getAIRecommend()
            if (response.isSuccessful) {
                aiResponse = response.body()?.content ?: "暂时没有推荐内容"
            } else {
                aiResponse = "推荐获取失败: ${response.code()}"
            }
        } catch (e: Exception) {
            aiResponse = "推荐异常: ${e.message}"
        }
    }

    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface) }
            Text("AI 智能推荐", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        }
        
        Spacer(Modifier.height(16.dp))
        
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp)
        ) {
            Text(
                aiResponse, 
                modifier = Modifier.padding(12.dp),
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 14.sp,
                lineHeight = 20.sp
            )
        }
        
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
fun ReleaseCalendarMenu(onBack: () -> Unit) {
    var calendarItems by remember { mutableStateOf<List<ReleaseItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMsg by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            val apiService = RetrofitClient.getApiService()
            val response = apiService.getReleaseCalendar()
            if (response.isSuccessful) {
                calendarItems = response.body()?.items ?: emptyList()
            } else {
                errorMsg = "加载失败: ${response.code()}"
            }
        } catch (e: Exception) {
            errorMsg = "加载异常: ${e.message}"
        } finally {
            isLoading = false
        }
    }

    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface) }
            Text("即将上映日历", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        }
        
        Text("2026年发布数据", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp))
        
        Spacer(Modifier.height(8.dp))
        
        Box(modifier = Modifier.heightIn(max = 300.dp)) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
            } else if (errorMsg != null) {
                Text(errorMsg!!, color = ErrorRed, modifier = Modifier.align(Alignment.Center))
            } else if (calendarItems.isEmpty()) {
                Text("暂无上映信息", color = TextTertiary, modifier = Modifier.align(Alignment.Center))
            } else {
                LazyColumn {
                            items(calendarItems) { item ->
                                CalendarItem(item.date, item.title, item.type)
                            }
                }
            }
        }
        
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
fun CalendarItem(date: String, title: String, type: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(date, color = PrimaryGreen, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(12.dp))
        Column {
            Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
            Text(type, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), fontSize = 10.sp)
        }
    }
}


@Composable
fun WatchHistoryMenu(onBack: () -> Unit, onDetailClick: (String, String, String) -> Unit) {
    val context = LocalContext.current
    val store = remember { Store.getInstance(context) }
    val history = remember { store.getPlayRecords() }

    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface) }
            Text("观看历史", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        }
        
        Spacer(Modifier.height(8.dp))
        
        Box(modifier = Modifier.heightIn(max = 400.dp)) {
            if (history.isEmpty()) {
                Text("暂无播放记录", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), modifier = Modifier.align(Alignment.Center).padding(vertical = 32.dp))
            } else {
                LazyColumn {
                            items(history) { item ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { onDetailClick(item.searchTitle.ifBlank { item.title }, item.sourceName, item.title) }
                                        .padding(vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    AsyncImage(
                                        model = item.cover,
                                        contentDescription = null,
                                        modifier = Modifier.size(40.dp, 60.dp).clip(RoundedCornerShape(4.dp)),
                                        contentScale = ContentScale.Crop
                                    )
                                    Spacer(Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(item.title, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, maxLines = 1)
                                        Text("第 ${item.index} 集 · ${item.sourceName}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                                    }
                                }
                            }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
fun FavoritesMenu(onBack: () -> Unit, onDetailClick: (String, String, String) -> Unit) {
    val context = LocalContext.current
    val store = remember { Store.getInstance(context) }
    val favorites = remember { store.getFavorites() }

    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface) }
            Text("我的收藏", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        }
        
        Spacer(Modifier.height(8.dp))
        
        Box(modifier = Modifier.heightIn(max = 400.dp)) {
            if (favorites.isEmpty()) {
                Text("暂无收藏内容", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), modifier = Modifier.align(Alignment.Center).padding(vertical = 32.dp))
            } else {
                LazyColumn {
                            items(favorites) { item ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { onDetailClick(item.searchTitle.ifBlank { item.title }, item.sourceName, item.title) }
                                        .padding(vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    AsyncImage(
                                        model = item.cover,
                                        contentDescription = null,
                                        modifier = Modifier.size(40.dp, 60.dp).clip(RoundedCornerShape(4.dp)),
                                        contentScale = ContentScale.Crop
                                    )
                                    Spacer(Modifier.width(12.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(item.title, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, maxLines = 1)
                                        Text("${item.sourceName} · ${item.year}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                                    }
                                }
                            }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
fun SettingsMenu(onBack: () -> Unit) {
    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface) }
            Text("偏好设置", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        }
        
        Spacer(Modifier.height(8.dp))
        
        MenuItem(icon = Icons.Rounded.Notifications, title = "推送通知", onClick = {})
        MenuItem(icon = Icons.Rounded.Language, title = "语言设置", onClick = {})
        MenuItem(icon = Icons.Rounded.Security, title = "隐私政策", onClick = {})
        
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
fun AboutMenu(onBack: () -> Unit) {
    val context = LocalContext.current
    Column(modifier = Modifier.padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface) }
            Text("关于我们", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        }
        
        Spacer(Modifier.height(24.dp))
        
        Surface(
            modifier = Modifier.size(80.dp),
            shape = RoundedCornerShape(16.dp),
            color = PrimaryGreen
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("TV", color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.ExtraBold)
            }
        }
        
        Spacer(Modifier.height(16.dp))
        Text("SuperTV 原生版", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        val versionName = packageInfo.versionName
        Text("Version $versionName", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        
        Spacer(Modifier.height(24.dp))
        Text(
            "本项目仅供学习交流使用。所有视频内容均来自第三方接口，本应用不存储任何视频资源。",
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 16.dp)
        )
        
        Spacer(Modifier.height(32.dp))
    }
}

@Composable
fun NodeSelectionMenu(
    nodes: List<ApiNode>,
    selectedUrl: String,
    onNodeSelected: (ApiNode) -> Unit,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val latencies = remember { mutableStateMapOf<String, Long>() }
    val speedTestService = remember { com.supertv.app.services.SpeedTestService() }

    // 开始测速
    LaunchedEffect(nodes) {
        nodes.forEach { node ->
            scope.launch {
                val latency = speedTestService.testLatency("${node.url}/icons/icon-512x512.png")
                latencies[node.url] = if (latency == Long.MAX_VALUE) -1L else latency
            }
        }
    }

    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回", tint = MaterialTheme.colorScheme.onSurface)
            }
            Text("选择服务器节点", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        }

        Spacer(Modifier.height(8.dp))

        LazyColumn(modifier = Modifier.heightIn(max = 400.dp)) {
                    items(nodes) { node ->
                        val isSelected = node.url == selectedUrl
                        val latency = latencies[node.url]
                        
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onNodeSelected(node) }
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                if (isSelected) Icons.Default.RadioButtonChecked else Icons.Default.RadioButtonUnchecked,
                                contentDescription = null,
                                tint = if (isSelected) PrimaryGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(Modifier.width(16.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(node.label, color = if (isSelected) PrimaryGreen else MaterialTheme.colorScheme.onSurface, fontSize = 15.sp)
                            }
                            
                            // 显示延迟而不是网址
                            if (latency != null) {
                                val latencyColor = when {
                                    latency < 0 -> ErrorRed
                                    latency < 100 -> PrimaryGreen
                                    latency < 300 -> Color(0xFFFF9800) // Orange
                                    else -> ErrorRed
                                }
                                Text(
                                    text = if (latency < 0) "不可达" else "${latency}ms",
                                    color = latencyColor,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            } else {
                                CircularProgressIndicator(modifier = Modifier.size(12.dp), strokeWidth = 2.dp, color = PrimaryGreen)
                            }
                        }
                    }
        }
    }
}

@Composable
fun MenuItem(
    icon: ImageVector,
    title: String,
    textColor: Color = Color.Unspecified, // 默认使用父组件颜色
    iconColor: Color = Color.Unspecified, // 默认使用父组件颜色
    onClick: () -> Unit
) {
    val finalTextColor = if (textColor == Color.Unspecified) MaterialTheme.colorScheme.onSurface else textColor
    val finalIconColor = if (iconColor == Color.Unspecified) MaterialTheme.colorScheme.onSurfaceVariant else iconColor

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = finalIconColor, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(16.dp))
        Text(title, color = finalTextColor, fontSize = 15.sp)
        Spacer(Modifier.weight(1f))
        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f), modifier = Modifier.size(16.dp))
    }
}

@Composable
fun StatsMenu(onBack: () -> Unit) {
    val context = LocalContext.current
    val store = remember { Store.getInstance(context) }
    
    val favoritesCount = remember { store.getFavorites().size }
    val historyCount = remember { store.getPlayRecords().size }
    val searchCount = remember { store.getSearchHistory().size }
    val cachedCount = remember { store.getCachedEpisodes().values.sumOf { it.size } }
    
    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface) }
            Text("数据统计", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        }
        
        Spacer(Modifier.height(16.dp))
        
        StatItem("我的收藏", "$favoritesCount 个项目", Icons.Rounded.Favorite, PrimaryGreen)
        StatItem("观看历史", "$historyCount 条记录", Icons.Rounded.History, Color(0xFF2196F3))
        StatItem("搜索历史", "$searchCount 次搜索", Icons.Rounded.Search, Color(0xFFFF9800))
        StatItem("缓存集数", "$cachedCount 集内容", Icons.Rounded.FileDownload, Color(0xFF9C27B0))

        Spacer(Modifier.height(16.dp))
    }
}

@Composable
fun StatItem(label: String, value: String, icon: ImageVector, color: Color) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(40.dp).background(color.copy(alpha = 0.1f), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.width(16.dp))
            Column {
                Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(value, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            }
        }
    }
}
