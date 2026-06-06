package com.supertv.resupertv.ui.detail

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.supertv.resupertv.model.Episode
import com.supertv.resupertv.model.SearchResult
import com.supertv.resupertv.model.VideoDetail
import com.supertv.resupertv.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetailScreen(
    detail: VideoDetail?,
    isLoading: Boolean,
    isFavorite: Boolean,
    cachedEpisodes: Set<Int>,
    allSources: List<SearchResult> = emptyList(),
    currentSource: String = "",
    onEpisodeClick: (Episode) -> Unit,
    onToggleFavorite: () -> Unit,
    onBack: () -> Unit,
    onPlayAll: () -> Unit,
    onSourceSelect: (SearchResult) -> Unit = {}
) {
    var showSourcesDialog by remember { mutableStateOf(false) }

    if (isLoading) {
        Box(modifier = Modifier.fillMaxSize().background(BackgroundDark), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = PrimaryGreen)
        }
        return
    }

    if (detail == null) {
        Box(modifier = Modifier.fillMaxSize().background(BackgroundDark), contentAlignment = Alignment.Center) {
            Text("无法加载详情", color = TextTertiary, fontSize = 16.sp)
        }
        return
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).background(BackgroundDark)
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(280.dp)) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current).data(detail.cover).crossfade(true).build(),
                contentDescription = detail.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
            Box(
                modifier = Modifier.fillMaxSize().background(
                    Brush.verticalGradient(listOf(Color.Transparent, BackgroundDark), startY = 200f)
                )
            )
            IconButton(
                onClick = onBack,
                modifier = Modifier.align(Alignment.TopStart).padding(8.dp).background(Color(0x66000000), RoundedCornerShape(50))
            ) {
                Icon(Icons.Default.ArrowBack, "返回", tint = TextPrimary)
            }
            IconButton(
                onClick = onToggleFavorite,
                modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).background(Color(0x66000000), RoundedCornerShape(50))
            ) {
                Icon(
                    if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                    "收藏",
                    tint = if (isFavorite) FavoriteRed else TextPrimary
                )
            }
        }

        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = detail.title, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextPrimary)

            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                if (detail.year.isNotBlank()) Text(detail.year, fontSize = 13.sp, color = TextTertiary)
                if (detail.area.isNotBlank()) Text(detail.area, fontSize = 13.sp, color = TextTertiary)
                Text("共${detail.totalEpisodes}集", fontSize = 13.sp, color = TextTertiary)
            }

            // 来源选择器
            Spacer(Modifier.height(8.dp))
            Surface(
                modifier = Modifier.fillMaxWidth().clickable { showSourcesDialog = true },
                shape = RoundedCornerShape(8.dp),
                color = BackgroundCard
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Source, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("播放源: ${currentSource.ifBlank { detail.sourceName }}", color = TextPrimary, fontSize = 14.sp)
                    Spacer(Modifier.weight(1f))
                    Text("${allSources.size}个源 >", color = PrimaryGreen, fontSize = 13.sp)
                }
            }

            if (detail.desc.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                Text(detail.desc, fontSize = 14.sp, color = TextSecondary, maxLines = 5, overflow = TextOverflow.Ellipsis, lineHeight = 20.sp)
            }

            if (detail.director.isNotBlank()) { Spacer(Modifier.height(8.dp)); Text("导演: ${detail.director}", fontSize = 13.sp, color = TextTertiary) }
            if (detail.actor.isNotBlank()) { Spacer(Modifier.height(4.dp)); Text("主演: ${detail.actor}", fontSize = 13.sp, color = TextTertiary) }

            Spacer(Modifier.height(16.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = onPlayAll,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.PlayArrow, "播放", modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("播放全部")
                }
                OutlinedButton(
                    onClick = onToggleFavorite,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = TextPrimary)
                ) {
                    Icon(if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder, "收藏", modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(if (isFavorite) "取消收藏" else "收藏")
                }
            }

            Spacer(Modifier.height(20.dp))
            Text("剧集列表", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
            Spacer(Modifier.height(8.dp))

            if (detail.episodes.isEmpty()) {
                Text("暂无剧集信息", color = TextTertiary, fontSize = 14.sp)
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    itemsIndexed(detail.episodes) { index, episode ->
                        EpisodeCard(
                            episode = episode, index = index,
                            isCached = cachedEpisodes.contains(index),
                            onClick = { onEpisodeClick(episode) }
                        )
                    }
                }
            }
        }
    }

    if (showSourcesDialog && allSources.isNotEmpty()) {
        SourceSelectionDialog(
            sources = allSources,
            currentSourceKey = currentSource,
            onSelect = { source ->
                onSourceSelect(source)
                showSourcesDialog = false
            },
            onDismiss = { showSourcesDialog = false }
        )
    }
}

@Composable
fun SourceSelectionDialog(
    sources: List<SearchResult>,
    currentSourceKey: String,
    onSelect: (SearchResult) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("选择播放源", color = TextPrimary) },
        text = {
            Column {
                sources.forEach { source ->
                    val isSelected = source.source == currentSourceKey
                    Surface(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { onSelect(source) },
                        shape = RoundedCornerShape(8.dp),
                        color = if (isSelected) PrimaryGreenDark else BackgroundCard
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(source.sourceName, color = TextPrimary, fontWeight = FontWeight.Medium)
                                Text("${source.episodes.size}集 · ${source.year}", color = TextTertiary, fontSize = 12.sp)
                            }
                            if (isSelected) {
                                Icon(Icons.Default.Check, contentDescription = null, tint = PrimaryGreen)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("关闭", color = PrimaryGreen) } },
        containerColor = BackgroundDark
    )
}

@Composable
private fun EpisodeCard(episode: Episode, index: Int, isCached: Boolean, onClick: () -> Unit) {
    Card(
        modifier = Modifier.width(80.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = if (isCached) CacheGreen else BackgroundCard)
    ) {
        Box(modifier = Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(text = "${index + 1}", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                if (episode.title.isNotBlank()) {
                    Text(text = episode.title, fontSize = 10.sp, color = TextTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (isCached) {
                    Icon(Icons.Default.CheckCircle, "已缓存", tint = CacheGreen, modifier = Modifier.size(14.dp))
                }
            }
        }
    }
}
