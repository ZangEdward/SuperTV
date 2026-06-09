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
    latencies: Map<String, Long> = emptyMap(),
    isAllSourcesLoading: Boolean = false,
    isDarkTheme: Boolean = true, // 新增
    onThemeToggle: () -> Unit = {}, // 新增
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

    // 使用主题色替代硬编码色
    val backgroundColor = MaterialTheme.colorScheme.background
    val cardColor = MaterialTheme.colorScheme.surfaceVariant
    val textColor = MaterialTheme.colorScheme.onBackground
    val secondaryTextColor = MaterialTheme.colorScheme.onSurfaceVariant

    // 激进搜索加载状态 (模仿 SuperTV_old)
    val isAggressiveLoading = (detail?.source == "douban" || detail?.source == "bangumi") 
        && (detail?.episodes?.isEmpty() == true) && isAllSourcesLoading

    if (isLoading || isAggressiveLoading) {
        Box(modifier = Modifier.fillMaxSize().background(backgroundColor), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(color = PrimaryGreen)
                if (isAggressiveLoading) {
                    Spacer(Modifier.height(24.dp))
                    Text(
                        "全网激进检索中...",
                        color = secondaryTextColor,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "正在匹配最佳播放源",
                        color = secondaryTextColor.copy(alpha = 0.7f),
                        fontSize = 12.sp
                    )
                }
            }
        }
        return
    }

    if (detail == null) {
        Box(modifier = Modifier.fillMaxSize().background(backgroundColor), contentAlignment = Alignment.Center) {
            Text("无法加载详情", color = secondaryTextColor, fontSize = 16.sp)
        }
        return
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).background(backgroundColor)
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
                    Brush.verticalGradient(listOf(Color.Transparent, backgroundColor), startY = 200f)
                )
            )
            
            // 顶部按钮栏
            Row(
                modifier = Modifier.fillMaxWidth().padding(8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = onBack,
                    modifier = Modifier.background(Color(0x66000000), RoundedCornerShape(50))
                ) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回", tint = Color.White)
                }
                
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    // 主题切换按钮
                    IconButton(
                        onClick = onThemeToggle,
                        modifier = Modifier.background(Color(0x66000000), RoundedCornerShape(50))
                    ) {
                        Icon(
                            if (isDarkTheme) Icons.Default.LightMode else Icons.Default.DarkMode,
                            "切换主题",
                            tint = if (isDarkTheme) Color(0xFFFFD700) else Color.White
                        )
                    }
                    
                    IconButton(
                        onClick = onToggleFavorite,
                        modifier = Modifier.background(Color(0x66000000), RoundedCornerShape(50))
                    ) {
                        Icon(
                            if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            "收藏",
                            tint = if (isFavorite) FavoriteRed else Color.White
                        )
                    }
                }
            }
        }

        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = detail.title, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = textColor)

            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                if (detail.year.isNotBlank()) Text(detail.year, fontSize = 13.sp, color = secondaryTextColor)
                if (detail.area.isNotBlank()) Text(detail.area, fontSize = 13.sp, color = secondaryTextColor)
                val epText = if (detail.totalEpisodes > 0) "共 ${detail.totalEpisodes} 集" else "全网检索中..."
                Text(epText, fontSize = 13.sp, color = secondaryTextColor)
            }

            Spacer(Modifier.height(8.dp))
            Surface(
                modifier = Modifier.fillMaxWidth().clickable { showSourcesDialog = true },
                shape = RoundedCornerShape(8.dp),
                color = cardColor
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Source, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    val sourceText = if (currentSource.isBlank()) detail.sourceName else currentSource
                    Text("当前源: " + sourceText, color = textColor, fontSize = 14.sp)
                    Spacer(Modifier.weight(1f))
                    Text(allSources.size.toString() + "个备选源 >", color = PrimaryGreen, fontSize = 13.sp)
                }
            }

            if (detail.desc.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                Text(detail.desc, fontSize = 14.sp, color = textColor.copy(alpha = 0.8f), maxLines = 5, overflow = TextOverflow.Ellipsis, lineHeight = 20.sp)
            }

            if (detail.director.isNotBlank()) { Spacer(Modifier.height(8.dp)); Text("导演: " + detail.director, fontSize = 13.sp, color = secondaryTextColor) }
            if (detail.actor.isNotBlank()) { Spacer(Modifier.height(4.dp)); Text("主演: " + detail.actor, fontSize = 13.sp, color = secondaryTextColor) }

            Spacer(Modifier.height(24.dp))
            
            // 选项卡切换 (模仿 SuperTV_old)
            var selectedTab by remember { mutableIntStateOf(0) }
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Color.Transparent,
                contentColor = PrimaryGreen,
                divider = { HorizontalDivider(thickness = 0.5.dp, color = secondaryTextColor.copy(alpha = 0.2f)) }
            ) {
                Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }) {
                    Box(Modifier.padding(vertical = 12.dp)) { Text("剧集选集", fontWeight = if(selectedTab == 0) FontWeight.Bold else FontWeight.Normal) }
                }
                Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }) {
                    Box(Modifier.padding(vertical = 12.dp)) { 
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("播放源", fontWeight = if(selectedTab == 1) FontWeight.Bold else FontWeight.Normal)
                            if (isAllSourcesLoading) {
                                Spacer(Modifier.width(6.dp))
                                CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 2.dp, color = PrimaryGreen)
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))

            if (selectedTab == 0) {
                // 剧集网格展示
                if (detail.episodes.isEmpty()) {
                    Box(Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                        Text("暂无剧集信息，请尝试切换播放源", color = secondaryTextColor, fontSize = 14.sp)
                    }
                } else {
                    // 使用垂直网格展示剧集 (FlowRow 效果)
                    Column {
                        val chunks = detail.episodes.chunked(4) // 每行 4 个
                        chunks.forEach { rowEpisodes ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                rowEpisodes.forEach { episode ->
                                    val index = detail.episodes.indexOf(episode)
                                    Box(Modifier.weight(1f)) {
                                        EpisodeCard(
                                            episode = episode, index = index,
                                            isCached = cachedEpisodes.contains(index),
                                            onClick = { onEpisodeClick(episode) }
                                        )
                                    }
                                }
                                // 补齐空位
                                if (rowEpisodes.size < 4) {
                                    repeat(4 - rowEpisodes.size) { Box(Modifier.weight(1f)) }
                                }
                            }
                        }
                    }
                }
            } else {
                // 播放源列表
                if (allSources.isEmpty() && detail.source.isNotBlank() && detail.source != "douban" && detail.source != "bangumi") {
                    SourceItem(
                        context = context,
                        source = SearchResult(
                            id = detail.id,
                            title = detail.title,
                            cover = detail.cover,
                            source = detail.source,
                            sourceName = detail.sourceName,
                            episodesList = detail.episodes
                        ),
                        isSelected = true,
                        onClick = { /* 已经是当前源 */ }
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        allSources.forEach { source ->
                            val latency = latencies[source.id + source.source]
                            SourceItem(
                                context = context,
                                source = source,
                                isSelected = source.source == currentSource && source.id == detail.id,
                                latency = latency,
                                onClick = { onSourceSelect(source) }
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = onPlayAll,
                    modifier = Modifier.weight(1.1f),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.PlayArrow, "播放", modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("开始播放", maxLines = 1)
                }
                OutlinedButton(
                    onClick = onToggleFavorite,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = textColor)
                ) {
                    Icon(if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder, "收藏", modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(if (isFavorite) "取消" else "收藏", maxLines = 1)
                }
                OutlinedButton(
                    onClick = { showCacheDialog = true },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = textColor)
                ) {
                    Icon(Icons.Default.CloudDownload, "缓存", modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text("缓存", maxLines = 1)
                }
            }
        }
        Spacer(Modifier.height(40.dp))
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
private fun SourceItem(
    context: android.content.Context,
    source: SearchResult,
    isSelected: Boolean,
    latency: Long? = null,
    onClick: () -> Unit
) {
    val cardColor = MaterialTheme.colorScheme.surfaceVariant
    val textColor = MaterialTheme.colorScheme.onBackground
    val secondaryTextColor = MaterialTheme.colorScheme.onSurfaceVariant

    Surface(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp), color = if (isSelected) PrimaryGreen.copy(alpha = 0.15f) else cardColor) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (source.cover.isNotBlank() || source.poster.isNotBlank()) {
                AsyncImage(ImageRequest.Builder(context).data(source.cover.ifBlank { source.poster }).crossfade(true).build(),
                    null, Modifier.width(36.dp).height(50.dp).clip(RoundedCornerShape(4.dp)), contentScale = ContentScale.Crop)
                Spacer(Modifier.width(10.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(source.sourceName.ifBlank { source.source }, fontSize = 14.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) PrimaryGreen else textColor)
                
                val episodeInfo = (if (source.episodes.isNotEmpty()) "${source.episodes.size}集 · " else "") + (source.year.ifBlank { "未知" })
                Text(episodeInfo, fontSize = 12.sp, color = secondaryTextColor)
            }
            
            if (latency != null) {
                val color = when {
                    latency < 100 -> PrimaryGreen
                    latency < 300 -> Color(0xFFFFA000)
                    else -> ErrorRed
                }
                Text("${latency}ms", color = color, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(8.dp))
            }

            if (isSelected) { Icon(Icons.Default.Check, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(18.dp)) }
        }
    }
}

@Composable
private fun EpisodeCard(episode: Episode, index: Int, isCached: Boolean, onClick: () -> Unit) {
    val cardColor = MaterialTheme.colorScheme.surfaceVariant
    val textColor = MaterialTheme.colorScheme.onBackground
    val secondaryTextColor = MaterialTheme.colorScheme.onSurfaceVariant

    Card(
        modifier = Modifier.width(80.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = if (isCached) CacheGreen else cardColor)
    ) {
        Box(modifier = Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(text = (index + 1).toString(), fontSize = 16.sp, fontWeight = FontWeight.Bold, color = if (isCached) Color.White else textColor)
                if (episode.title.isNotBlank()) {
                    Text(text = episode.title, fontSize = 10.sp, color = if (isCached) Color.White.copy(alpha = 0.7f) else secondaryTextColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (isCached) {
                    Icon(Icons.Default.CheckCircle, "已缓存", tint = Color.White, modifier = Modifier.size(14.dp))
                }
            }
        }
    }
}
