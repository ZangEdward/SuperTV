package com.supertv.resupertv.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.supertv.resupertv.model.ApiNode
import com.supertv.resupertv.ui.theme.*

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
    val isLoggingIn by viewModel.isLoggingIn.collectAsState()
    val loginMessage by viewModel.loginMessage.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(BackgroundDark)) {
        TopAppBar(
            title = { Text("设置", fontWeight = FontWeight.Bold, color = TextPrimary) },
            navigationIcon = {
                TextButton(onClick = onBack) {
                    Text("← 返回", color = PrimaryGreen)
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = BackgroundDark)
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            // ===== 账户 =====
            item { SectionHeader("账户") }
            item {
                SettingItem(
                    title = if (isLoggedIn) "已登录" else "登录/同步",
                    subtitle = if (isLoggedIn) "点击退出登录" else "登录以同步收藏和播放记录",
                    onClick = {
                        if (isLoggedIn) {
                            viewModel.logout()
                        } else {
                            showLoginDialog = true
                        }
                    }
                )
            }

            // ===== 播放设置 =====
            item { SectionHeader("播放设置") }
            item {
                SettingSwitch(
                    title = "自动播放下一集",
                    subtitle = "当前集播放完成后自动播放下一个",
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
                        val currentIndex = speeds.indexOf(playbackSpeed)
                        val nextIndex = (currentIndex + 1) % speeds.size
                        viewModel.setPlaybackSpeed(speeds[nextIndex])
                    }
                )
            }

            // ===== 网络设置 =====
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
                    subtitle = "${apiNodes.size}个节点 · ${apiNodes.firstOrNull()?.label ?: "未配置"}",
                    onClick = { showApiNodeDialog = true }
                )
            }

            // ===== 外观 =====
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

            // ===== 缓存 =====
            item { SectionHeader("缓存管理") }
            item {
                SettingItem(
                    title = "缓存大小",
                    subtitle = cacheSize,
                    onClick = { showClearCacheDialog = true }
                )
            }
            item {
                SettingItem(
                    title = "清除缩略图缓存",
                    subtitle = "重新加载所有封面图片",
                    onClick = { viewModel.clearThumbnailCache() }
                )
            }

            // ===== 远程控制 =====
            item { SectionHeader("远程控制") }
            item {
                SettingSwitch(
                    title = "远程控制服务器",
                    subtitle = if (remoteServerRunning) "运行中 · 端口 9527" else "已停止",
                    checked = remoteServerRunning,
                    onCheckedChange = { viewModel.setRemoteServerRunning(it) }
                )
            }

            // ===== OTA更新 =====
            item { SectionHeader("OTA 更新") }
            item {
                SettingItem(
                    title = "同步仓库",
                    subtitle = syncRepo.ifBlank { "未配置" },
                    onClick = { /* TODO */ }
                )
            }
            item {
                SettingItem(
                    title = "检查更新",
                    subtitle = "点击检查新版本",
                    onClick = { /* TODO */ }
                )
            }

            item { Spacer(Modifier.height(32.dp)) }
        }
    }

    if (showClearCacheDialog) {
        AlertDialog(
            onDismissRequest = { showClearCacheDialog = false },
            title = { Text("清除缓存", color = TextPrimary) },
            text = { Text("确定要清除所有缓存吗？", color = TextSecondary) },
            confirmButton = {
                TextButton(onClick = { viewModel.clearCache(); showClearCacheDialog = false }) { Text("确定", color = PrimaryGreen) }
            },
            dismissButton = {
                TextButton(onClick = { showClearCacheDialog = false }) { Text("取消", color = TextTertiary) }
            },
            containerColor = BackgroundCard
        )
    }

    if (showThemeDialog) {
        AlertDialog(
            onDismissRequest = { showThemeDialog = false },
            title = { Text("选择主题", color = TextPrimary) },
            text = {
                Column {
                    listOf("system" to "跟随系统", "light" to "浅色", "dark" to "深色").forEach { (mode, label) ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).clickable { viewModel.setThemeMode(mode); showThemeDialog = false },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = themeMode == mode,
                                onClick = { viewModel.setThemeMode(mode); showThemeDialog = false },
                                colors = RadioButtonDefaults.colors(selectedColor = PrimaryGreen)
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(label, color = TextPrimary)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showThemeDialog = false }) { Text("关闭", color = PrimaryGreen) }
            },
            containerColor = BackgroundCard
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
                viewModel.addApiNode(ApiNode(key = label.lowercase().replace(" ", "_"), label = label, url = url))
                showAddNodeDialog = false
            },
            onDismiss = { showAddNodeDialog = false }
        )
    }

    if (showLoginDialog) {
        LoginDialog(
            viewModel = viewModel,
            onDismiss = { showLoginDialog = false }
        )
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
        title = { Text("API 节点", color = TextPrimary) },
        text = {
            LazyColumn {
                items(nodes) { node ->
                    Surface(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { onSwitch(node) },
                        shape = RoundedCornerShape(8.dp),
                        color = BackgroundCard
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(node.label, color = TextPrimary, fontWeight = FontWeight.Medium)
                                Text(node.url, color = TextTertiary, fontSize = 12.sp)
                            }
                            TextButton(onClick = { onRemove(node) }) {
                                Text("删除", color = ErrorRed)
                            }
                        }
                    }
                }
                item {
                    TextButton(
                        onClick = onAdd,
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                    ) {
                        Text("+ 添加节点", color = PrimaryGreen)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("关闭", color = PrimaryGreen) }
        },
        containerColor = BackgroundDark
    )
}

@Composable
fun AddNodeDialog(
    onAdd: (String, String) -> Unit,
    onDismiss: () -> Unit
) {
    var label by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("添加节点", color = TextPrimary) },
        text = {
            Column {
                OutlinedTextField(
                    value = label,
                    onValueChange = { label = it },
                    label = { Text("节点名称") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PrimaryGreen,
                        unfocusedTextColor = TextPrimary,
                        focusedTextColor = TextPrimary
                    )
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("API 地址") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PrimaryGreen,
                        unfocusedTextColor = TextPrimary,
                        focusedTextColor = TextPrimary
                    )
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { if (label.isNotBlank() && url.isNotBlank()) onAdd(label, url) },
                enabled = label.isNotBlank() && url.isNotBlank()
            ) { Text("添加", color = PrimaryGreen) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消", color = TextTertiary) }
        },
        containerColor = BackgroundDark
    )
}

@Composable
fun LoginDialog(
    viewModel: SettingsViewModel,
    onDismiss: () -> Unit
) {
    var serverUrl by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val isLoggingIn by viewModel.isLoggingIn.collectAsState()
    val loginMessage by viewModel.loginMessage.collectAsState()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("登录", color = TextPrimary) },
        text = {
            Column {
                if (loginMessage.isNotBlank()) {
                    Text(loginMessage, color = if (loginMessage.contains("成功")) PrimaryGreen else ErrorRed, fontSize = 13.sp)
                    Spacer(Modifier.height(8.dp))
                }
                OutlinedTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = { Text("服务器地址") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    enabled = !isLoggingIn,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PrimaryGreen,
                        unfocusedTextColor = TextPrimary,
                        focusedTextColor = TextPrimary
                    )
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text("用户名") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    enabled = !isLoggingIn,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PrimaryGreen,
                        unfocusedTextColor = TextPrimary,
                        focusedTextColor = TextPrimary
                    )
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("密码") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    enabled = !isLoggingIn,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PrimaryGreen,
                        unfocusedTextColor = TextPrimary,
                        focusedTextColor = TextPrimary
                    ),
                    visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation()
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    viewModel.login(serverUrl, username, password)
                },
                enabled = !isLoggingIn && serverUrl.isNotBlank() && username.isNotBlank() && password.isNotBlank()
            ) {
                Text(if (isLoggingIn) "登录中..." else "登录", color = PrimaryGreen)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isLoggingIn) { Text("取消", color = TextTertiary) }
        },
        containerColor = BackgroundDark
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
fun SettingItem(
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = BackgroundCard
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, fontSize = 15.sp, color = TextPrimary, fontWeight = FontWeight.Medium)
            if (subtitle.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(subtitle, fontSize = 12.sp, color = TextTertiary)
            }
        }
    }
}

@Composable
fun SettingSwitch(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = BackgroundCard
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, fontSize = 15.sp, color = TextPrimary, fontWeight = FontWeight.Medium)
                if (subtitle.isNotBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(subtitle, fontSize = 12.sp, color = TextTertiary)
                }
            }
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = PrimaryGreen,
                    checkedTrackColor = PrimaryGreenDark
                )
            )
        }
    }
}

private fun formatSpeed(speed: Float): String = when {
    speed < 1.0f -> "%.2fX".format(speed)
    else -> "%.1fX".format(speed)
}
