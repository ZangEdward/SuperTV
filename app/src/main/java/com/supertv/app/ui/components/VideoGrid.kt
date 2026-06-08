package com.supertv.app.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.CachePolicy
import coil.request.ImageRequest
import coil.size.Size
import com.supertv.app.model.SearchResult
import com.supertv.app.services.CacheService
import com.supertv.app.services.ImageUrlHelper
import com.supertv.app.ui.theme.*

/**
 * 视频网格组件 - 对应原项目的 ResponsiveVideoCard / VideoCard
 *
 * 支持缩略图缓存、加载状态、响应式布局
 */
@Composable
fun VideoGrid(
    items: List<SearchResult>,
    onItemClick: (SearchResult) -> Unit,
    modifier: Modifier = Modifier,
    columns: Int = 3,
    title: String? = null
) {
    Column(modifier = modifier) {
        if (title != null) {
            Text(
                text = title,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimary,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
            )
        }

        LazyVerticalGrid(
            columns = GridCells.Fixed(columns),
            contentPadding = PaddingValues(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(items, key = { it.id + it.source }) { item ->
                VideoCard(
                    result = item,
                    onClick = { onItemClick(item) }
                )
            }
        }
    }
}

/**
 * 单张视频卡片 - 带缩略图缓存
 */
@Composable
fun VideoCard(
    result: SearchResult,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current

    // 处理图片 URL
    val processedUrl = remember(result.cover, result.source) {
        ImageUrlHelper.processImageUrl(result.cover, result.source)
    }
    val imageHeaders = remember(result.cover, result.source) {
        ImageUrlHelper.getImageHeaders(result.cover, result.source)
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(4.dp)
    ) {
        // 封面图容器
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(0.7f),
            shape = RoundedCornerShape(10.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(processedUrl)
                        .crossfade(true)
                        .addHeader("Referer", imageHeaders["Referer"] ?: "")
                        .addHeader("User-Agent", imageHeaders["User-Agent"] ?: "")
                        .build(),
                    contentDescription = result.title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )

                // Rating Badge (左上角，深色半透明背景)
                if (result.rating.isNotBlank() && result.rating != "0") {
                    Surface(
                        color = Color(0xCC000000),
                        shape = RoundedCornerShape(bottomEnd = 8.dp),
                        modifier = Modifier.align(Alignment.TopStart)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                Icons.Filled.Star,
                                contentDescription = null,
                                tint = Color(0xFFFFC107),
                                modifier = Modifier.size(10.dp)
                            )
                            Spacer(Modifier.width(2.dp))
                            Text(
                                text = result.rating,
                                color = Color.White,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                // 剧集/类型标签 (右上角，主题色背景)
                if (result.episodes.isNotEmpty() || result.type.isNotBlank()) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(4.dp),
                        color = PrimaryGreen.copy(alpha = 0.85f),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        val label = if (result.episodes.isNotEmpty()) "${result.episodes.size}集" else result.type
                        Text(
                            text = label,
                            color = Color.White,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                        )
                    }
                }

                // 底部信息条 (来源 + 年份，左下角)
                if (result.sourceName.isNotBlank() || result.year.isNotBlank()) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(4.dp),
                        color = Color(0x99000000),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        val footerText = if (result.sourceName.isNotBlank() && result.year.isNotBlank()) {
                            "${result.sourceName} · ${result.year}"
                        } else {
                            result.sourceName.ifBlank { result.year }
                        }
                        Text(
                            text = footerText,
                            color = Color.White,
                            fontSize = 9.sp,
                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        // 标题 (使用 Material3 字体样式)
        Text(
            text = result.title,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 2.dp)
        )
        
        if (result.desc.isNotBlank()) {
            Text(
                text = result.desc,
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 2.dp, end = 2.dp, top = 2.dp)
            )
        }
    }
}

/**
 * 加载中骨架屏
 */
@Composable
fun ShimmerGrid(
    columns: Int = 3,
    count: Int = 6
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(columns),
        contentPadding = PaddingValues(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(count) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = BackgroundCard)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(0.67f)
                        .background(BackgroundSurface)
                )
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.8f)
                        .height(16.dp)
                        .padding(horizontal = 8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(BackgroundSurface)
                )
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}
