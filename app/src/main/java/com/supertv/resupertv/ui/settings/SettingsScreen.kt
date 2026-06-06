package com.supertv.resupertv.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 设置页面 (Compose 版本) - 对应原项目的 components/settings 组件
 *
 * 使用 Material3 构建的设置页面
 */
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

    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        // 标题栏
        TopAppBar(
            title = { Text("设置", fontWeight = FontWeight.Bold) },
            navigationIcon = {
                TextButton(onClick = onBack) {
                    Text("← 返回", color = Color.White)
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = Color(0xFF0D0D1A),
                titleContentColor = Color.White
            )
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            // ===== 播放设置 =====
            item {
                SectionHeader("播放设置")
            }

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
            item {
                SectionHeader("网络设置")
            }

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
                    title = "API 节点 (${apiNodes.size}个)",
                    subtitle = apiNodes.firstOrNull()?.label ?: "未配置",
                    onClick = { showApiNodeDialog = true }
                )
            }

            // ===== 外观 =====
            item {
                SectionHeader("外观")
            }

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
            item {
                SectionHeader("缓存管理")
            }

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
            item {
                SectionHeader("远程控制")
            }

            item {
                SettingSwitch(
                    title = "远程控制服务器",
                    subtitle = if (remoteServerRunning) "运行中" else "已停止",
                    checked = remoteServerRunning,
                    onCheckedChange = { viewModel.setRemoteServerRunning(it) }
                )
            }

            // ===== OTA更新 =====
            item {
                SectionHeader("OTA 更新")
            }

            item {
                SettingItem(
                    title = "同步仓库",
                    subtitle = syncRepo.ifBlank { "未配置" },
                    onClick = {
                        // TODO: 显示输入对话框配置同步仓库
                    }
                )
            }

            item {
                SettingItem(
                    title = "检查更新",
                    subtitle = "点击检查新版本",
                    onClick = {
                        // TODO: 实现检查更新逻辑
                    }
                )
            }

            item { Spacer(Modifier.height(32.dp)) }
        }
    }

    // 清除缓存对话框
    if (showClearCacheDialog) {
        AlertDialog(
            onDismissRequest = { showClearCacheDialog = false },
            title = { Text("清除缓存") },
            text = { Text("确定要清除所有缓存吗？这包括已下载的视频和缩略图。") },
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

    // 主题选择对话框
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
                                .padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = themeMode == mode,
                                onClick = {
                                    viewModel.setThemeMode(mode)
                                    showThemeDialog = false
                                }
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(label, color = Color.White)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showThemeDialog = false }) { Text("关闭") }
            }
        )
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        fontSize = 14.sp,
        fontWeight = FontWeight.Bold,
        color = Color(0xFF6200EE),
        modifier = Modifier.padding(top = 16.dp, bottom = 4.dp)
    )
}

@Composable
private fun SettingItem(
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = Color(0xFF1A1A2E)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, fontSize = 15.sp, color = Color.White, fontWeight = FontWeight.Medium)
            if (subtitle.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(subtitle, fontSize = 12.sp, color = Color.Gray)
            }
        }
    }
}

@Composable
private fun SettingSwitch(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = Color(0xFF1A1A2E)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(title, fontSize = 15.sp, color = Color.White, fontWeight = FontWeight.Medium)
                if (subtitle.isNotBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(subtitle, fontSize = 12.sp, color = Color.Gray)
                }
            }
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color(0xFF6200EE),
                    checkedTrackColor = Color(0xFF3700B3)
                )
            )
        }
    }
}

private fun formatSpeed(speed: Float): String {
    return when {
        speed < 1.0f -> "%.2fX".format(speed)
        else -> "%.1fX".format(speed)
    }
}
