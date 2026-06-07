package com.supertv.app.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.supertv.app.model.ApiNode
import com.supertv.app.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    viewModel: SettingsViewModel,
    onBack: () -> Unit
) {
    val adFilterEnabled by viewModel.adFilterEnabled.collectAsState(initial = false)
    val autoPlay by viewModel.autoPlay.collectAsState(initial = true)
    val playbackSpeed by viewModel.playbackSpeed.collectAsState(initial = 1.0f)
    val themeMode by viewModel.themeMode.collectAsState(initial = "system")
    val cacheSize by viewModel.cacheSize.collectAsState()
    val remoteServerRunning by viewModel.remoteServerRunning.collectAsState()
    val syncRepo by viewModel.syncRepo.collectAsState()
    val apiNodes by viewModel.apiNodes.collectAsState()

    var showClearCacheDialog by remember { mutableStateOf(false) }
    var showApiNodeDialog by remember { mutableStateOf(false) }
    var showThemeDialog by remember { mutableStateOf(false) }
    var showAddNodeDialog by remember { mutableStateOf(false) }
    var showLoginDialog by remember { mutableStateOf(false) }

    val isLoggedIn by viewModel.isLoggedIn.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("设置", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    TextButton(onClick = onBack) { Text("返回") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BackgroundDark)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(BackgroundDark)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            item { SectionHeader("账户") }
            item {
                SettingItem(
                    title = if (isLoggedIn) "已登录" else "登录/同步",
                    subtitle = if (isLoggedIn) "点击退出登录" else "登录以同步收藏和播放记录",
                    onClick = { if (isLoggedIn) viewModel.logout() else showLoginDialog = true }
                )
            }

            item { SectionHeader("播放设置") }
            item {
                SettingSwitch(
                    title = "自动播放下一集",
                    subtitle = "当前集播放完成后自动播放下一集",
                    checked = autoPlay,
                    onCheckedChange = { viewModel.toggleAutoPlay(it) }
                )
            }
            item {
                SettingItem(
                    title = "播放速度",
                    subtitle = formatSpeed(playbackSpeed),
                    onClick = {
                        val speeds = listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f)
                        val next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.size]
                        viewModel.setPlaybackSpeed(next)
                    }
                )
            }

            item { SectionHeader("网络设置") }
            item {
                SettingSwitch(
                    title = "M3U8 广告过滤",
                    subtitle = "通过本地代理移除流媒体广告片段",
                    checked = adFilterEnabled,
                    onCheckedChange = { viewModel.toggleAdFilter(it) }
                )
            }
            item {
                SettingItem(
                    title = "API 节点",
                    subtitle = "${apiNodes.size}个节点",
                    onClick = { showApiNodeDialog = true }
                )
            }

            item { SectionHeader("外观") }
            item {
                SettingItem(
                    title = "主题模式",
                    subtitle = when (themeMode) {
                        "light" -> "浅色"
                        "dark" -> "深色"
                        else -> "跟随系统"
                    },
                    onClick = { showThemeDialog = true }
                )
            }

            item { SectionHeader("缓存管理") }
            item {
                SettingItem(
                    title = "缓存大小",
                    subtitle = cacheSize,
                    onClick = { showClearCacheDialog = true }
                )
            }

            item { SectionHeader("远程控制") }
            item {
                SettingSwitch(
                    title = "远程控制服务器",
                    subtitle = if (remoteServerRunning) "运行中" else "已停止",
                    checked = remoteServerRunning,
                    onCheckedChange = { viewModel.setRemoteServerRunning(it) }
                )
            }

            item { SectionHeader("OTA 更新") }
            item {
                SettingItem(
                    title = "同步仓库",
                    subtitle = if (syncRepo.isEmpty()) "未配置" else syncRepo,
                    onClick = { /* TODO */ }
                )
            }

            item { Spacer(Modifier.height(32.dp)) }
        }
    }

    if (showClearCacheDialog) {
        AlertDialog(
            onDismissRequest = { showClearCacheDialog = false },
            title = { Text("清除缓存") },
            text = { Text("确定要清除所有缓存吗？") },
            confirmButton = {
                TextButton(onClick = { 
                    viewModel.clearCache()
                    showClearCacheDialog = false 
                }) { Text("确定") }
            },
            dismissButton = {
                TextButton(onClick = { showClearCacheDialog = false }) { Text("取消") }
            }
        )
    }

    if (showThemeDialog) {
        AlertDialog(
            onDismissRequest = { showThemeDialog = false },
            title = { Text("选择主题") },
            text = {
                Column {
                    listOf("system" to "跟随系统", "light" to "浅色", "dark" to "深色").forEach { (mode, label) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { 
                                    viewModel.setThemeMode(mode)
                                    showThemeDialog = false 
                                }
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(selected = themeMode == mode, onClick = null)
                            Spacer(Modifier.width(8.dp))
                            Text(label)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showThemeDialog = false }) { Text("关闭") }
            }
        )
    }

    if (showApiNodeDialog) {
        ApiNodeDialog(
            nodes = apiNodes,
            onSwitch = { viewModel.switchApiNode(it.key) },
            onAdd = { showAddNodeDialog = true },
            onRemove = { viewModel.removeApiNode(it.key) },
            onDismiss = { showApiNodeDialog = false }
        )
    }

    if (showAddNodeDialog) {
        AddNodeDialog(
            onAdd = { label, url ->
                viewModel.addApiNode(ApiNode(key = label, label = label, url = url))
                showAddNodeDialog = false
            },
            onDismiss = { showAddNodeDialog = false }
        )
    }

    if (showLoginDialog) {
        LoginDialog(onDismiss = { showLoginDialog = false })
    }
}

@Composable
fun ApiNodeDialog(
    nodes: List<ApiNode>,
    onSwitch: (ApiNode) -> Unit,
    onAdd: () -> Unit,
    onRemove: (ApiNode) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("API 节点") },
        text = {
            LazyColumn {
                items(nodes) { node ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onSwitch(node) }
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(node.label, fontWeight = FontWeight.Medium)
                            Text(node.url, fontSize = 12.sp, color = Color.Gray)
                        }
                        IconButton(onClick = { onRemove(node) }) {
                            Icon(Icons.Default.Delete, contentDescription = "删除")
                        }
                    }
                }
                item {
                    TextButton(onClick = onAdd, modifier = Modifier.fillMaxWidth()) {
                        Text("+ 添加节点")
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("关闭") }
        }
    )
}

@Composable
fun AddNodeDialog(onAdd: (String, String) -> Unit, onDismiss: () -> Unit) {
    var label by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("添加节点") },
        text = {
            Column {
                TextField(value = label, onValueChange = { label = it }, label = { Text("名称") })
                TextField(value = url, onValueChange = { url = it }, label = { Text("地址") })
            }
        },
        confirmButton = {
            TextButton(onClick = { onAdd(label, url) }) { Text("添加") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        }
    )
}

@Composable
fun LoginDialog(onDismiss: () -> Unit) {
    var user by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("登录") },
        text = {
            Column {
                TextField(value = user, onValueChange = { user = it }, label = { Text("用户名") })
                TextField(value = pass, onValueChange = { pass = it }, label = { Text("密码") })
            }
        },
        confirmButton = {
            TextButton(onClick = { /* login logic */ }) { Text("登录") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        }
    )
}

@Composable
fun SectionHeader(title: String) {
    Text(
        text = title,
        fontSize = 14.sp,
        fontWeight = FontWeight.Bold,
        color = PrimaryGreen,
        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp)
    )
}

@Composable
fun SettingItem(title: String, subtitle: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = BackgroundCard
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, fontSize = 12.sp, color = Color.Gray)
        }
    }
}

@Composable
fun SettingSwitch(title: String, subtitle: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = BackgroundCard
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                Text(subtitle, fontSize = 12.sp, color = Color.Gray)
            }
            Switch(checked = checked, onCheckedChange = onCheckedChange)
        }
    }
}

private fun formatSpeed(speed: Float): String = String.format(java.util.Locale.US, "%.1fX", speed)
