package com.supertv.app.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
    var isImageLoaded by remember { mutableStateOf(false) }

    // 处理图片 URL
    val imageUrl = result.cover.ifBlank { result.poster }
    val processedUrl = remember(imageUrl, result.source) {
        ImageUrlHelper.processImageUrl(imageUrl, result.source)
    }
    val imageHeaders = remember(imageUrl, result.source) {
        ImageUrlHelper.getImageHeaders(imageUrl, result.source)
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // 封面图容器 (对齐 Selene: Stack 布局)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(0.7f)
                .clip(RoundedCornerShape(8.dp))
                .shadow(elevation = 4.dp, shape = RoundedCornerShape(8.dp))
        ) {
            // 背景闪烁动画
            if (!isImageLoaded) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(shimmerBrush())
                )
            }

            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(processedUrl)
                    .crossfade(true)
                    .addHeader("Referer", imageHeaders["Referer"] ?: "")
                    .addHeader("User-Agent", imageHeaders["User-Agent"] ?: "")
                    .build(),
                contentDescription = result.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop,
                onSuccess = { isImageLoaded = true }
            )

            // 年份徽章 (左上角) - 仅在搜索或推荐时显示
            if (result.year.isNotBlank() && result.year != "0") {
                Surface(
                    color = Color(0xAA2C3E50),
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier
                        .padding(4.dp)
                        .align(Alignment.TopStart)
                ) {
                    Text(
                        text = result.year,
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                    )
                }
            }

            // 评分徽章 (右上角，粉色圆形 - 对齐 Selene)
            if (result.rating.isNotBlank() && result.rating != "0") {
                Surface(
                    color = Color(0xFFE91E63),
                    shape = CircleShape,
                    modifier = Modifier
                        .padding(4.dp)
                        .size(28.dp)
                        .align(Alignment.TopEnd)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = result.rating,
                            color = Color.White,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            } else if (result.episodes.size > 1) {
                // 如果没有评分，显示集数 (绿色徽章)
                Surface(
                    color = Color(0xFF27AE60),
                    shape = RoundedCornerShape(4.dp),
                    modifier = Modifier
                        .padding(4.dp)
                        .align(Alignment.TopEnd)
                ) {
                    Text(
                        text = "${result.episodes.size}集",
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                    )
                }
            }

            // 来源标签 (底部)
            if (result.sourceName.isNotBlank()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .background(
                            brush = androidx.compose.ui.graphics.Brush.verticalGradient(
                                colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f))
                            )
                        )
                        .padding(top = 12.dp, bottom = 4.dp, start = 4.dp, end = 4.dp)
                ) {
                    Text(
                        text = result.sourceName,
                        color = Color.White.copy(alpha = 0.9f),
                        fontSize = 9.sp,
                        modifier = Modifier.align(Alignment.BottomCenter)
                    )
                }
            }
        }

        Spacer(Modifier.height(6.dp))

        // 标题 (居中，对齐 Selene)
        Text(
            text = result.title,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2, // 允许两行，对齐 Selene
            minLines = 2, // 保持高度一致
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp)
        )
    }
}

/**
 * 加载中骨架屏
 */
@Composable
fun ShimmerGrid(
    columns: Int = 3,
    count: Int = 12
) {
    val brush = shimmerBrush()
    
    LazyVerticalGrid(
        columns = GridCells.Fixed(columns),
        contentPadding = PaddingValues(8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(count) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(4.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(0.7f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(brush)
                )
                Spacer(Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.7f)
                        .height(14.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(brush)
                )
            }
        }
    }
}
