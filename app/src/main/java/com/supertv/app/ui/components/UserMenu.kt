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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.supertv.app.data.ApiNodeService
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.Store
import com.supertv.app.model.ApiNode
import com.supertv.app.ui.theme.*

enum class MenuPage {
    Main, NodeSelection, AIRecommend, ReleaseCalendar
}

@Composable
fun UserMenu(
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val store = remember { Store.getInstance(context) }
    val nodes = remember { ApiNodeService.getNodes(context) }
    
    var currentPage by remember { mutableStateOf(MenuPage.Main) }
    var selectedNodeUrl by remember { 
        mutableStateOf(store.getApiBaseUrl() ?: nodes.firstOrNull()?.url ?: "") 
    }

    // 初始化 Retrofit
    LaunchedEffect(Unit) {
        if (store.getApiBaseUrl() == null && nodes.isNotEmpty()) {
            val firstUrl = nodes.first().url
            store.saveApiBaseUrl(firstUrl)
            RetrofitClient.switchBaseUrl(firstUrl)
            selectedNodeUrl = firstUrl
        } else if (store.getApiBaseUrl() != null) {
            RetrofitClient.switchBaseUrl(store.getApiBaseUrl()!!)
        }
    }

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.6f))
                .clickable { onClose() },
            contentAlignment = Alignment.Center
        ) {
            Surface(
                modifier = Modifier
                    .width(320.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .clickable(enabled = false) { },
                color = BackgroundCard,
                tonalElevation = 8.dp
            ) {
                Column(modifier = Modifier.padding(vertical = 16.dp)) {
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
                                onNavigateToCalendar = { currentPage = MenuPage.ReleaseCalendar }
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
    onNavigateToCalendar: () -> Unit
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
                Text("当前用户", fontSize = 12.sp, color = TextSecondary)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("演示模式", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                    Spacer(Modifier.width(8.dp))
                    Surface(color = PrimaryGreen.copy(alpha = 0.2f), shape = RoundedCornerShape(4.dp)) {
                        Text("V2", color = PrimaryGreen, fontSize = 10.sp, modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp))
                    }
                }
            }
        }

        HorizontalDivider(color = BackgroundSurface, thickness = 1.dp)

        MenuItem(icon = Icons.Rounded.AutoAwesome, title = "AI 智能推荐", iconColor = PrimaryGreen, onClick = onNavigateToAI)
        MenuItem(icon = Icons.Rounded.CalendarMonth, title = "即将上映日历", onClick = onNavigateToCalendar)
        MenuItem(icon = Icons.Rounded.Dns, title = "服务器节点", onClick = onNavigateToNodes)
        MenuItem(icon = Icons.Rounded.Storage, title = "清除缓存", onClick = { /* TODO */ })
        
        Spacer(Modifier.height(8.dp))
        HorizontalDivider(color = BackgroundSurface, thickness = 1.dp)
        
        MenuItem(
            icon = Icons.AutoMirrored.Rounded.Logout, 
            title = "退出登录", 
            textColor = ErrorRed,
            iconColor = ErrorRed,
            onClick = { /* TODO */ }
        )
    }
}

@Composable
fun AIRecommendMenu(onBack: () -> Unit) {
    var aiResponse by remember { mutableStateOf("正在通过 GPT-5o 为您生成推荐...") }
    val apiService = RetrofitClient.getApiService()
    
    LaunchedEffect(Unit) {
        try {
            val response = apiService.getAIRecommend()
            if (response.isSuccessful) {
                aiResponse = response.body()?.content ?: "暂时没有推荐内容"
            }
        } catch (e: Exception) {
            aiResponse = "推荐失败: ${e.message}"
        }
    }

    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = TextPrimary) }
            Text("AI 智能推荐", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        }
        
        Spacer(Modifier.height(16.dp))
        
        Surface(
            color = BackgroundSurface,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp)
        ) {
            Text(
                aiResponse, 
                modifier = Modifier.padding(12.dp),
                color = TextPrimary,
                fontSize = 14.sp,
                lineHeight = 20.sp
            )
        }
        
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
fun ReleaseCalendarMenu(onBack: () -> Unit) {
    // Similar implementation for Calendar
    Column(modifier = Modifier.padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = TextPrimary) }
            Text("即将上映日历", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        }
        
        Text("2026年 1月发布数据", color = TextSecondary, fontSize = 12.sp, modifier = Modifier.padding(start = 8.dp))
        
        Spacer(Modifier.height(8.dp))
        
        LazyColumn(modifier = Modifier.heightIn(max = 300.dp)) {
            // Mock or Fetch
            item { CalendarItem("2026-01-28", "阿凡达：火与灰", "电影") }
            item { CalendarItem("2026-02-14", "新蝙蝠侠 2", "电影") }
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
            Text(title, color = TextPrimary, fontSize = 14.sp)
            Text(type, color = TextTertiary, fontSize = 10.sp)
        }
    }
}


@Composable
fun NodeSelectionMenu(
    nodes: List<ApiNode>,
    selectedUrl: String,
    onNodeSelected: (ApiNode) -> Unit,
    onBack: () -> Unit
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回", tint = TextPrimary)
            }
            Text("选择服务器节点", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
        }

        Spacer(Modifier.height(8.dp))

        LazyColumn(modifier = Modifier.heightIn(max = 400.dp)) {
            items(nodes) { node ->
                val isSelected = node.url == selectedUrl
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
                        tint = if (isSelected) PrimaryGreen else TextSecondary,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(Modifier.width(16.dp))
                    Column {
                        Text(node.label, color = if (isSelected) PrimaryGreen else TextPrimary, fontSize = 15.sp)
                        Text(node.url, color = TextTertiary, fontSize = 12.sp)
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
    textColor: Color = TextPrimary,
    iconColor: Color = TextSecondary,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(16.dp))
        Text(title, color = textColor, fontSize = 15.sp)
        Spacer(Modifier.weight(1f))
        Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TextTertiary, modifier = Modifier.size(16.dp))
    }
}
