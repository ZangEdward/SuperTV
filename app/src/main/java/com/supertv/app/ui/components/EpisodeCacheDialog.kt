package com.supertv.app.ui.components

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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.supertv.app.model.Episode
import com.supertv.app.services.EpisodeCacheManager
import com.supertv.app.ui.theme.*

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
    val downloadStates by cacheManager.downloadStates.collectAsState()
    val downloadProgress by cacheManager.downloadProgress.collectAsState()
    var cacheSize by remember { mutableStateOf("0MB") }

    LaunchedEffect(Unit) {
        val size = cacheManager.getCacheSize()
        val mb = size / (1024 * 1024)
        cacheSize = mb.toString() + "MB"
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = BackgroundCard,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
        Column(Modifier.fillMaxWidth().padding(bottom = 32.dp)) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CloudDownload, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text("离线缓存", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                    Text("当前缓存: " + cacheSize, fontSize = 12.sp, color = TextSecondary)
                }
                FilledTonalButton(
                    onClick = {
                        episodes.forEach { ep ->
                            if (ep.index !in cachedEpisodes) {
                                cacheManager.startDownload(ep, videoId, title)
                            }
                        }
                    }
                ) {
                    Text("全部下载", fontSize = 12.sp, color = PrimaryGreen)
                }
                Spacer(Modifier.width(4.dp))
                IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, contentDescription = "Close", tint = TextTertiary) }
            }

            LazyColumn(
                modifier = Modifier.heightIn(max = 450.dp),
                contentPadding = PaddingValues(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                itemsIndexed(episodes) { idx, ep ->
                    val isCached = cachedEpisodes.contains(ep.index)
                    val taskId = videoId + "_" + ep.index
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
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = if (isCached) CacheGreen else BackgroundCard,
                modifier = Modifier.size(40.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text((index + 1).toString(), fontSize = 14.sp, fontWeight = FontWeight.Bold,
                        color = if (isCached) Color.White else TextPrimary)
                }
            }

            Spacer(Modifier.width(12.dp))

            Column(Modifier.weight(1f)) {
                val epTitle = if (episode.title.isNotBlank()) episode.title else "第" + (index + 1) + "集"
                Text(
                    text = epTitle,
                    fontSize = 14.sp, color = TextPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis
                )
                when {
                    isCached -> Text("已完成", fontSize = 11.sp, color = CacheGreen)
                    isDownloading -> {
                        val pct = (progress * 100).toInt()
                        Text("下载中 " + pct + "%", fontSize = 11.sp, color = PrimaryGreen)
                    }
                    state is EpisodeCacheManager.DownloadState.Failed -> {
                        Text("失败", fontSize = 11.sp, color = ErrorRed)
                    }
                    else -> Text("未缓存", fontSize = 11.sp, color = TextTertiary)
                }
            }

            Spacer(Modifier.width(8.dp))

            if (isDownloading) {
                IconButton(onClick = onCancel, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.Close, contentDescription = "Cancel", tint = ErrorRed)
                }
            } else if (isCached) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = CacheGreen, modifier = Modifier.size(24.dp))
            } else {
                IconButton(onClick = onCache, modifier = Modifier.size(32.dp)) {
                    Icon(Icons.Default.CloudDownload, contentDescription = "Download", tint = TextSecondary)
                }
            }
        }
    }
}
