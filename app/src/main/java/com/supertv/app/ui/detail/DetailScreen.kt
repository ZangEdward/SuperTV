package com.supertv.app.ui.detail

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import com.supertv.app.model.Episode
import com.supertv.app.model.SearchResult
import com.supertv.app.model.VideoDetail
import com.supertv.app.services.EpisodeCacheManager
import com.supertv.app.ui.components.EpisodeCacheDialog
import com.supertv.app.ui.components.SourceSelectionSheet
import com.supertv.app.ui.theme.*

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
    val context = LocalContext.current
    val cacheManager = remember { EpisodeCacheManager(context) }
    var showSourcesDialog by remember { mutableStateOf(false) }
    var showCacheDialog by remember { mutableStateOf(false) }

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
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回", tint = TextPrimary)
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
                Text("共 " + detail.totalEpisodes.toString() + " 集", fontSize = 13.sp, color = TextTertiary)
            }

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
                    val sourceText = if (currentSource.isBlank()) detail.sourceName else currentSource
                    Text("播放源: " + sourceText, color = TextPrimary, fontSize = 14.sp)
                    Spacer(Modifier.weight(1f))
                    Text(allSources.size.toString() + "个源 >", color = PrimaryGreen, fontSize = 13.sp)
                }
            }

            if (detail.desc.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                Text(detail.desc, fontSize = 14.sp, color = TextSecondary, maxLines = 5, overflow = TextOverflow.Ellipsis, lineHeight = 20.sp)
            }

            if (detail.director.isNotBlank()) { Spacer(Modifier.height(8.dp)); Text("导演: " + detail.director, fontSize = 13.sp, color = TextTertiary) }
            if (detail.actor.isNotBlank()) { Spacer(Modifier.height(4.dp)); Text("主演: " + detail.actor, fontSize = 13.sp, color = TextTertiary) }

            Spacer(Modifier.height(20.dp))
            Text("播放源", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
            Spacer(Modifier.height(8.dp))
            
            // 竖向排列的播放源
            if (allSources.isEmpty() && detail.source.isNotBlank()) {
                // 如果没有其他源，显示当前详情的源
                SourceItem(
                    context = context,
                    source = SearchResult(
                        id = detail.id,
                        title = detail.title,
                        cover = detail.cover,
                        source = detail.source,
                        sourceName = detail.sourceName,
                        episodes = detail.episodes
                    ),
                    isSelected = true,
                    onClick = { /* 已经是当前源 */ }
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    allSources.forEach { source ->
                        SourceItem(
                            context = context,
                            source = source,
                            isSelected = source.source == currentSource && source.id == detail.id,
                            onClick = { onSourceSelect(source) }
                        )
                    }
                }
            }

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
                    val favText = if (isFavorite) "取消收藏" else "收藏"
                    Text(favText)
                }
                OutlinedButton(
                    onClick = { showCacheDialog = true },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = TextPrimary)
                ) {
                    Icon(Icons.Default.CloudDownload, "缓存", modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("缓存")
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
        SourceSelectionSheet(
            sources = allSources,
            currentSource = currentSource,
            currentId = detail.id,
            cover = detail.cover,
            title = detail.title,
            onSourceSelected = { source ->
                onSourceSelect(source)
                showSourcesDialog = false
            },
            onDismiss = { showSourcesDialog = false }
        )
    }

    if (showCacheDialog && detail != null) {
        EpisodeCacheDialog(
            videoId = detail.id,
            title = detail.title,
            episodes = detail.episodes,
            cachedEpisodes = cachedEpisodes,
            cacheManager = cacheManager,
            onDismiss = { showCacheDialog = false }
        )
    }
}

@Composable
private fun SourceItem(context: android.content.Context, source: SearchResult, isSelected: Boolean, onClick: () -> Unit) {
    Surface(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp), color = if (isSelected) PrimaryGreen.copy(alpha = 0.15f) else BackgroundCard) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (source.cover.isNotBlank() || source.poster.isNotBlank()) {
                AsyncImage(ImageRequest.Builder(context).data(source.cover.ifBlank { source.poster }).crossfade(true).build(),
                    null, Modifier.width(36.dp).height(50.dp).clip(RoundedCornerShape(4.dp)), contentScale = ContentScale.Crop)
                Spacer(Modifier.width(10.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(source.sourceName.ifBlank { source.source }, fontSize = 14.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) PrimaryGreen else TextPrimary)
                val episodeInfo = (if (source.episodes.isNotEmpty()) "${source.episodes.size}集 · " else "") + (source.year.ifBlank { "未知" })
                Text(episodeInfo, fontSize = 12.sp, color = TextTertiary)
            }
            if (isSelected) { Spacer(Modifier.width(6.dp)); Icon(Icons.Default.Check, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(18.dp)) }
        }
    }
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
                Text(text = (index + 1).toString(), fontSize = 16.sp, fontWeight = FontWeight.Bold, color = if (isCached) Color.White else TextPrimary)
                if (episode.title.isNotBlank()) {
                    Text(text = episode.title, fontSize = 10.sp, color = if (isCached) Color.White.copy(alpha = 0.7f) else TextTertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (isCached) {
                    Icon(Icons.Default.CheckCircle, "已缓存", tint = Color.White, modifier = Modifier.size(14.dp))
                }
            }
        }
    }
}
