package com.supertv.resupertv.ui.detail

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
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
import com.supertv.resupertv.model.VideoDetail

/**
 * 视频详情页 - 对应原项目的 app/detail.tsx
 *
 * 展示视频信息、剧集列表、来源切换等
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetailScreen(
    detail: VideoDetail?,
    isLoading: Boolean,
    isFavorite: Boolean,
    cachedEpisodes: Set<Int>,
    onEpisodeClick: (Episode) -> Unit,
    onToggleFavorite: () -> Unit,
    onBack: () -> Unit,
    onPlayAll: () -> Unit
) {
    if (isLoading) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            CircularProgressIndicator(color = Color(0xFF6200EE))
        }
        return
    }

    if (detail == null) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text("无法加载详情", color = Color.Gray, fontSize = 16.sp)
        }
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
    ) {
        // 封面+信息区
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(280.dp)
        ) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(detail.cover)
                    .crossfade(true)
                    .build(),
                contentDescription = detail.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )

            // 渐变遮罩
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                Color(0xFF0D0D1A)
                            ),
                            startY = 200f
                        )
                    )
            )

            // 返回按钮
            IconButton(
                onClick = onBack,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(8.dp)
                    .background(Color(0x66000000), RoundedCornerShape(50))
            ) {
                Icon(Icons.Default.ArrowBack, "返回", tint = Color.White)
            }

            // 收藏按钮
            IconButton(
                onClick = onToggleFavorite,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp)
                    .background(Color(0x66000000), RoundedCornerShape(50))
            ) {
                Icon(
                    if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                    "收藏",
                    tint = if (isFavorite) Color.Red else Color.White
                )
            }
        }

        // 标题和信息
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = detail.title,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )

            Spacer(Modifier.height(4.dp))

            // 元信息
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                if (detail.year.isNotBlank()) {
                    Text(detail.year, fontSize = 13.sp, color = Color.Gray)
                }
                if (detail.area.isNotBlank()) {
                    Text(detail.area, fontSize = 13.sp, color = Color.Gray)
                }
                Text("共${detail.totalEpisodes}集", fontSize = 13.sp, color = Color.Gray)
            }

            // 来源
            if (detail.sourceName.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    "来源: ${detail.sourceName}",
                    fontSize = 12.sp,
                    color = Color(0xFF6200EE)
                )
            }

            // 描述
            if (detail.desc.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                Text(
                    detail.desc,
                    fontSize = 14.sp,
                    color = Color(0xFFAAAAAA),
                    maxLines = 5,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 20.sp
                )
            }

            // 演职人员
            if (detail.director.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                Text("导演: ${detail.director}", fontSize = 13.sp, color = Color.Gray)
            }
            if (detail.actor.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text("主演: ${detail.actor}", fontSize = 13.sp, color = Color.Gray)
            }

            // 操作按钮
            Spacer(Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Button(
                    onClick = onPlayAll,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6200EE)),
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
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White)
                ) {
                    Icon(
                        if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                        "收藏",
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(if (isFavorite) "取消收藏" else "收藏")
                }
            }

            // 剧集列表
            Spacer(Modifier.height(20.dp))
            Text(
                "剧集列表",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
            Spacer(Modifier.height(8.dp))

            if (detail.episodes.isEmpty()) {
                Text("暂无剧集信息", color = Color.Gray, fontSize = 14.sp)
            } else {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    itemsIndexed(detail.episodes) { index, episode ->
                        val isCached = cachedEpisodes.contains(index)
                        EpisodeCard(
                            episode = episode,
                            index = index,
                            isCached = isCached,
                            onClick = { onEpisodeClick(episode) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EpisodeCard(
    episode: Episode,
    index: Int,
    isCached: Boolean,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .width(80.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isCached) Color(0xFF1B5E20) else Color(0xFF1A1A2E)
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "${index + 1}",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                if (episode.title.isNotBlank()) {
                    Text(
                        text = episode.title,
                        fontSize = 10.sp,
                        color = Color.Gray,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                if (isCached) {
                    Icon(
                        Icons.Default.CheckCircle,
                        "已缓存",
                        tint = Color(0xFF4CAF50),
                        modifier = Modifier.size(14.dp)
                    )
                }
            }
        }
    }
}
