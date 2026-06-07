package com.supertv.resupertv.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.supertv.resupertv.model.Episode
import com.supertv.resupertv.services.EpisodeCacheManager
import com.supertv.resupertv.ui.theme.*
import kotlinx.coroutines.launch

/**
 * 剧集缓存管理弹窗 — 现代 UI
 * 显示所有剧集的缓存状态、下载进度、批量操作
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EpisodeCacheDialog(
    videoId: String,
    title: String,
    episodes: List<Episode>,
    cachedEpisodes: Set<Int>,
    cacheManager: EpisodeCacheManager,
    onDismiss: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val downloadStates by cacheManager.downloadStates.collectAsState()
    val downloadProgress by cacheManager.downloadProgress.collectAsState()
    var cacheSize by remember { mutableStateOf("计算中...") }

    // 计算缓存大小
    LaunchedEffect(Unit) {
        val size = cacheManager.getCacheSize()
        cacheSize = when {
            size < 1024 -> "${size}B"
            size < 1024 * 1024 -> "${size / 1024}KB"
            else -> "${size / (1024 * 1024)}MB"
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = BackgroundCard,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
        Column(Modifier.fillMaxWidth().padding(bottom = 32.dp)) {
            // 标题
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CloudDownload, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text("离线缓存", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                    Text("缓存大小: $cacheSize", fontSize = 12.sp, color = TextSecondary)
                }
                // 全部缓存按钮
                FilledTonalButton(
                    onClick = {
                        episodes.forEach { ep ->
                            if (ep.index !in cachedEpisodes) {
                                cacheManager.startDownload(ep, videoId, title)
                            }
                        }
                    },
                    colors = ButtonDefaults.filledTonalButtonColors(containerColor = PrimaryGreen.copy(alpha = 0.15f))
                ) {
                    Icon(Icons.Default.CloudDownload, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("全部缓存", fontSize = 12.sp, color = PrimaryGreen)
                }
                Spacer(Modifier.width(4.dp))
                IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, contentDescription = "关闭", tint = TextTertiary) }
            }

            // 剧集列表
            LazyColumn(
                modifier = Modifier.heightIn(max = 450.dp),
                contentPadding = PaddingValues(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                itemsIndexed(episodes) { idx, ep ->
                    val isCached = ep.index in cachedEpisodes
                    val taskId = "${videoId}_${ep.index}"
                    val state = downloadStates[taskId]
                    val progress = downloadProgress[taskId] ?: 0f

                    CacheEpisodeItem(
                        index = idx,
                        episode = ep,
                        isCached = isCached,
                        state = state,
                        progress = progress,
                        onCache = { cacheManager.startDownload(ep, videoId, title) },
                        onCancel = { cacheManager.cancelDownload(videoId, ep.index) }
                    )
                }
            }
        }
    }
}

@Composable
private fun CacheEpisodeItem(
    index: Int,
    episode: Episode,
    isCached: Boolean,
    state: EpisodeCacheManager.DownloadState?,
    progress: Float,
    onCache: () -> Unit,
    onCancel: () -> Unit
) {
    val isDownloading = state is EpisodeCacheManager.DownloadState.Downloading

    Surface(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)),
        shape = RoundedCornerShape(12.dp),
        color = BackgroundSurface
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            // 集数编号
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = if (isCached) CacheGreen else BackgroundCard,
                modifier = Modifier.size(40.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text("${index + 1}", fontSize = 14.sp, fontWeight = FontWeight.Bold,
                        color = if (isCached) Color.White else TextPrimary)
                }
            }

            Spacer(Modifier.width(12.dp))

            // 标题
            Column(Modifier.weight(1f)) {
                Text(
                    text = if (episode.title.isNotBlank()) episode.title else "第${index + 1}集",
                    fontSize = 14.sp, color = TextPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis
                )
                // 状态/进度
                when {
                    isCached -> Text("已缓存", fontSize = 11.sp, color = CacheGreen)
                    isDownloading -> {
                        val pct = (progress * 100).toInt()
                        Text("下载中 $pct%", fontSize = 11.sp, color = PrimaryGreen)
                    }
                    state is EpisodeCacheManager.DownloadState.Failed -> {
                        Text("下载失败: ${state.error}", fontSize = 11.sp, color = ErrorRed, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    else -> Text("未缓存", fontSize = 11.sp, color = TextTertiary)
                }
            }

            Spacer(Modifier.width(8.dp))

            // 进度条（下载中）
            if (isDownloading) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.size(28.dp),
                        strokeWidth = 3.dp,
                        color = PrimaryGreen,
                        trackColor = BackgroundCard
                    )
                    Spacer(Modifier.height(2.dp))
                    IconButton(
                        onClick = onCancel,
                        modifier = Modifier.size(20.dp)
                    ) {
                        Icon(Icons.Default.Close, contentDescription = "取消", tint = ErrorRed, modifier = Modifier.size(14.dp))
                    }
                }
            } else if (isCached) {
                // 已缓存 — 勾选
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = CacheGreen, modifier = Modifier.size(24.dp))
            } else {
                // 未缓存 — 下载按钮
                IconButton(
                    onClick = onCache,
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(Icons.Default.CloudDownload, contentDescription = "缓存", tint = TextSecondary)
                }
            }
        }

        // 下载进度条
        if (isDownloading && progress > 0) {
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp).padding(bottom = 8.dp),
                color = PrimaryGreen,
                trackColor = BackgroundCard
            )
        }
    }
}
