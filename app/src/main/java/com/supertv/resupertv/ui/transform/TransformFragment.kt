package com.supertv.resupertv.ui.transform

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import coil.compose.AsyncImage
import coil.request.CachePolicy
import coil.request.ImageRequest
import coil.size.Size
import com.supertv.resupertv.R
import com.supertv.resupertv.data.RetrofitClient
import com.supertv.resupertv.data.ServerConfig
import com.supertv.resupertv.data.Store
import com.supertv.resupertv.model.PlayRecord
import com.supertv.resupertv.model.SearchResult
import com.supertv.resupertv.ui.settings.ServerSwitchDialog
import com.supertv.resupertv.ui.theme.*

class TransformFragment : Fragment() {

    private val viewModel: TransformViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return ComposeView(requireContext()).apply {
            setContent {
                MaterialTheme {
                    HomeScreen(
                        viewModel = viewModel,
                        onItemClick = {
                            // TODO: navigate to detail/player
                        },
                        onSearchClick = {
                            findNavController().navigate(
                                R.id.action_nav_transform_to_search
                            )
                        }
                    )
                }
            }
        }
    }
}

// ====================================================================
//  HomeScreen — 仿 Selene 首页布局
//  各分区: 继续观看 | 豆瓣热播 | 推荐影视 | 最新更新
// ====================================================================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: TransformViewModel,
    onItemClick: (SearchResult) -> Unit,
    onSearchClick: () -> Unit
) {
    val playRecords by viewModel.playRecords.collectAsState()
    val hotMovies by viewModel.hotMovies.collectAsState()
    val recommended by viewModel.recommended.collectAsState()
    val newContent by viewModel.newContent.collectAsState()
    val animeUpdates by viewModel.animeUpdates.collectAsState()
    val recentPlayRecords by viewModel.recentPlayRecords.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    val context = LocalContext.current

    // 用户菜单 & 服务器切换 对话框状态
    var showUserMenu by remember { mutableStateOf(false) }
    var showServerSwitch by remember { mutableStateOf(false) }

    // 当前选中服务器标签
    val store = remember { Store.getInstance(context) }
    val currentNodeKey = remember { ServerConfig.getSelectedKey(store) }
    val currentNodeLabel = remember(currentNodeKey) {
        ServerConfig.getNodes().firstOrNull { it.key == currentNodeKey }?.label ?: ""
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        // ——— TopAppBar ———
        item {
            TopAppBar(
                title = {
                    Text("SuperTV", fontWeight = FontWeight.Bold, color = PrimaryGreen)
                },
                actions = {
                    TextButton(onClick = onSearchClick) {
                        Text("搜索", color = TextSecondary)
                    }
                    // 头像按钮 — 仿 Selene 右上角用户图标
                    IconButton(onClick = { showUserMenu = true }) {
                        Surface(
                            shape = RoundedCornerShape(50),
                            color = PrimaryGreen.copy(alpha = 0.2f),
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = if (currentNodeLabel.isNotBlank())
                                        currentNodeLabel.first().toString()
                                    else "U",
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = PrimaryGreen
                                )
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BackgroundDark)
            )
        }

        // ——— 服务器切换弹窗 ———
        if (showServerSwitch) {
            ServerSwitchDialog(onDismiss = { showServerSwitch = false })
        }

        // ——— 用户菜单弹窗 ———
        if (showUserMenu) {
            UserMenuDialog(
                currentNodeLabel = currentNodeLabel,
                onSwitchServer = {
                    showUserMenu = false
                    showServerSwitch = true
                },
                onDismiss = { showUserMenu = false }
            )
        }

        // ——— 搜索栏 ———
        item {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .clickable(onClick = onSearchClick),
                shape = RoundedCornerShape(12.dp),
                color = BackgroundCard
            ) {
                Text(
                    text = "搜索影片、电视剧、动漫...",
                    modifier = Modifier.padding(16.dp),
                    color = TextTertiary,
                    fontSize = 15.sp
                )
            }
        }

        // ——— 各分区 ———
        if (isLoading && playRecords.isEmpty() && hotMovies.isEmpty()) {
            item { LoadingShimmer() }
        } else {
            // 继续观看
            if (playRecords.isNotEmpty()) {
                item {
                    SectionHeader("继续观看")
                }
                item {
                    PlayRecordRow(records = playRecords.take(10), onClick = { /* TODO: 跳转到播放器 */ })
                }
            }

            // 动画更新 — 仿 Selene 每日放送（最近播放 + 每日更新）
            if (recentPlayRecords.isNotEmpty() || animeUpdates.isNotEmpty()) {
                item {
                    AnimeSection(
                        recentRecords = recentPlayRecords.take(6),
                        animeItems = animeUpdates,
                        onRecordClick = { /* TODO: 跳转到播放器 */ },
                        onItemClick = onItemClick
                    )
                }
            }

            // 豆瓣热播
            if (hotMovies.isNotEmpty()) {
                item { SectionHeader("豆瓣热播") }
                item { VideoCardRow(items = hotMovies, onClick = onItemClick) }
            }

            // 推荐影视
            if (recommended.isNotEmpty()) {
                item { SectionHeader("推荐影视") }
                item { VideoCardRow(items = recommended, onClick = onItemClick) }
            }

            // 最新更新
            if (newContent.isNotEmpty()) {
                item { SectionHeader("最新更新") }
                item { VideoCardRow(items = newContent, onClick = onItemClick) }
            }

            item { Spacer(Modifier.height(32.dp)) }
        }
    }
}

// ====================================================================
//  动画更新分区 — 仿 Selene 每日放送（周一~周日星期标签 + 每日内容）
// ====================================================================

private val weekdays = listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")

private val dayOfWeekIndex: Int
    get() {
        val cal = java.util.Calendar.getInstance()
        val day = cal.get(java.util.Calendar.DAY_OF_WEEK)
        return when (day) {
            java.util.Calendar.MONDAY -> 0
            java.util.Calendar.TUESDAY -> 1
            java.util.Calendar.WEDNESDAY -> 2
            java.util.Calendar.THURSDAY -> 3
            java.util.Calendar.FRIDAY -> 4
            java.util.Calendar.SATURDAY -> 5
            java.util.Calendar.SUNDAY -> 6
            else -> -1
        }
    }

@Composable
private fun AnimeSection(
    recentRecords: List<PlayRecord>,
    animeItems: List<SearchResult>,
    onRecordClick: (PlayRecord) -> Unit,
    onItemClick: (SearchResult) -> Unit
) {
    val todayIdx = remember { dayOfWeekIndex }
    var selectedDay by remember { mutableIntStateOf(todayIdx.coerceAtLeast(0)) }

    Column {
        // ——— 分区标题 ———
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, top = 20.dp, end = 16.dp, bottom = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("动画更新", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
            Text("更多 →", fontSize = 13.sp, color = PrimaryGreen)
        }

        // ——— 星期选择行（周一~周日） ———
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(weekdays.size) { idx ->
                val isToday = idx == todayIdx
                val isSelected = idx == selectedDay
                val bgColor = when {
                    isSelected -> PrimaryGreen
                    isToday -> PrimaryGreen.copy(alpha = 0.15f)
                    else -> Color.Transparent
                }
                val textColor = when {
                    isSelected -> Color.White
                    isToday -> PrimaryGreen
                    else -> TextSecondary
                }
                Surface(
                    modifier = Modifier.clickable { selectedDay = idx },
                    shape = RoundedCornerShape(20.dp),
                    color = bgColor
                ) {
                    Text(
                        text = weekdays[idx],
                        fontSize = 14.sp,
                        fontWeight = if (isSelected || isToday) FontWeight.Bold else FontWeight.Normal,
                        color = textColor,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                    )
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        // ——— 当天内容（最近播放 + 动画推荐） ———
        if (recentRecords.isNotEmpty() || animeItems.isNotEmpty()) {
            // 最近播放
            if (recentRecords.isNotEmpty()) {
                Text(
                    "最近播放", fontSize = 14.sp, color = TextSecondary,
                    modifier = Modifier.padding(start = 16.dp, top = 4.dp, bottom = 8.dp)
                )
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(recentRecords) { record ->
                        AnimePlayCard(record = record, onClick = { onRecordClick(record) })
                    }
                }
            }

            // 每日更新（按 selectedDay 分配数据）
            if (animeItems.isNotEmpty()) {
                // 将 animeItems 按星期分配（模拟，每个星期显示部分数据）
                val dayItems = animeItems
                    .filterIndexed { idx, _ -> idx % 7 == selectedDay }
                    .ifEmpty { animeItems.take(6) }

                Text(
                    weekdays[selectedDay] + "更新", fontSize = 14.sp, color = TextSecondary,
                    modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 8.dp)
                )
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(dayItems) { item ->
                        PosterCard(result = item, onClick = { onItemClick(item) })
                    }
                }
            }
        } else {
            Box(
                modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("暂无当日更新", color = TextTertiary, fontSize = 14.sp)
            }
        }
    }
}

// ====================================================================
//  动画分区中的播放记录卡片（更紧凑）
// ====================================================================

@Composable
private fun AnimePlayCard(record: PlayRecord, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .width(120.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = BackgroundCard)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.67f)
            ) {
                if (record.cover.isNotBlank()) {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(record.cover)
                            .crossfade(true)
                            .size(Size(240, 360))
                            .memoryCachePolicy(CachePolicy.ENABLED)
                            .build(),
                        contentDescription = record.title,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color(0xFF2A2A3E)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            record.title.first().toString(),
                            fontSize = 26.sp,
                            color = TextTertiary
                        )
                    }
                }

                // 集数/进度角标
                if (record.index > 0 || record.totalTime > 0) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(3.dp),
                        color = Color(0xCC000000),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            text = if (record.index > 0) "第${record.index}集" else "继续",
                            color = PrimaryGreen,
                            fontSize = 9.sp,
                            modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                        )
                    }
                }
            }

            Text(
                text = record.title,
                fontSize = 12.sp,
                color = TextPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp)
            )
        }
    }
}

// ====================================================================
//  用户菜单弹窗 — Android Material Design 风格
//  功能：显示当前服务器 + 切换服务器入口 + 版本号
// ====================================================================

@Composable
private fun UserMenuDialog(
    currentNodeLabel: String,
    onSwitchServer: () -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Card(
            modifier = Modifier
                .width(280.dp)
                .wrapContentHeight(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = BackgroundCard),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // ——— 用户信息区域 ———
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // 头像圆圈
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = PrimaryGreen.copy(alpha = 0.15f),
                        modifier = Modifier.size(56.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = if (currentNodeLabel.isNotBlank())
                                    currentNodeLabel.first().toString()
                                else "S",
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Bold,
                                color = PrimaryGreen
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        text = currentNodeLabel.ifBlank { "SuperTV" },
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Text(
                        text = "当前服务器",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                }

                HorizontalDivider(color = Color(0xFF2A2A3E), thickness = 1.dp)

                // ——— 切换服务器选项 ———
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onSwitchServer),
                    color = Color.Transparent
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(text = "🌐", fontSize = 20.sp)
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "切换服务器",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Medium,
                                color = TextPrimary
                            )
                            Text(
                                text = currentNodeLabel.ifBlank { "未选择" },
                                fontSize = 12.sp,
                                color = TextSecondary
                            )
                        }
                        Text(
                            text = "›",
                            fontSize = 20.sp,
                            color = TextTertiary
                        )
                    }
                }

                HorizontalDivider(color = Color(0xFF2A2A3E), thickness = 1.dp)

                // ——— 版本号 ———
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "SuperTV v1.0",
                        fontSize = 14.sp,
                        color = TextTertiary
                    )
                }
            }
        }
    }
}

// ====================================================================
//  分区标题
// ====================================================================

@Composable
private fun SectionHeader(title: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 16.dp, top = 20.dp, end = 16.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = TextPrimary
        )
        Text(
            text = "更多 →",
            fontSize = 13.sp,
            color = PrimaryGreen
        )
    }
}

// ====================================================================
//  继续观看 — 横向滚动卡片（带进度）
// ====================================================================

@Composable
private fun PlayRecordRow(records: List<PlayRecord>, onClick: (PlayRecord) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(records) { record ->
            PlayRecordPosterCard(record = record, onClick = { onClick(record) })
        }
    }
}

@Composable
private fun PlayRecordPosterCard(record: PlayRecord, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .width(130.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = BackgroundCard)
    ) {
        Column {
            // 封面
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.67f)
            ) {
                if (record.cover.isNotBlank()) {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(record.cover)
                            .crossfade(true)
                            .size(Size(260, 390))
                            .memoryCachePolicy(CachePolicy.ENABLED)
                            .build(),
                        contentDescription = record.title,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color(0xFF2A2A3E)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            record.title.first().toString(),
                            fontSize = 28.sp,
                            color = TextTertiary
                        )
                    }
                }

                // 集数标签
                if (record.index > 0) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(4.dp),
                        color = Color(0xCC000000),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            text = "第${record.index}集",
                            color = Color.White,
                            fontSize = 10.sp,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }

                // 进度条
                if (record.totalTime > 0) {
                    val progress = (record.playTime.toFloat() / record.totalTime).coerceIn(0f, 1f)
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .fillMaxWidth()
                            .height(3.dp)
                            .background(Color(0x4D000000))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxHeight()
                                .fillMaxWidth(progress)
                                .background(PrimaryGreen)
                        )
                    }
                }
            }

            // 标题
            Text(
                text = record.title,
                fontSize = 13.sp,
                color = TextPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)
            )
        }
    }
}

// ====================================================================
//  视频推荐 — 横向滚动卡片（仿 Selene RecommendationSection）
// ====================================================================

@Composable
private fun VideoCardRow(
    items: List<SearchResult>,
    onClick: (SearchResult) -> Unit
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(items) { item ->
            PosterCard(result = item, onClick = { onClick(item) })
        }
    }
}

@Composable
private fun PosterCard(
    result: SearchResult,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .width(130.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = BackgroundCard),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column {
            // 封面
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.67f)
                    .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
            ) {
                if (result.cover.isNotBlank()) {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(result.cover)
                            .crossfade(true)
                            .size(Size(260, 390))
                            .memoryCachePolicy(CachePolicy.ENABLED)
                            .build(),
                        contentDescription = result.title,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color(0xFF2A2A3E)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            result.title.first().toString(),
                            fontSize = 28.sp,
                            color = TextTertiary
                        )
                    }
                }

                // 来源标签
                if (result.sourceName.isNotBlank()) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(4.dp),
                        color = Color(0xCC000000),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            text = result.sourceName,
                            color = Color.White,
                            fontSize = 10.sp,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }

                // 评分 / 年份
                if (result.year.isNotBlank()) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(4.dp),
                        color = Color(0xCC000000),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            text = result.year,
                            color = Color.White,
                            fontSize = 10.sp,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }

            // 标题
            Text(
                text = result.title,
                fontSize = 13.sp,
                color = TextPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)
            )
        }
    }
}

// ====================================================================
//  加载骨架屏 — 仿 Selene shimmer 效果
// ====================================================================

@Composable
private fun LoadingShimmer() {
    Column {
        // 模拟 3 个分区骨架
        repeat(3) {
            Spacer(Modifier.height(24.dp))
            Box(
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .width(120.dp)
                    .height(20.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Color(0xFF2A2A3E))
            )
            Spacer(Modifier.height(12.dp))
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(6) {
                    ShimmerCard()
                }
            }
        }
    }
}

@Composable
private fun ShimmerCard() {
    Card(
        modifier = Modifier.width(130.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = BackgroundCard)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(0.67f)
                .background(Color(0xFF2A2A3E))
        )
        Spacer(Modifier.height(8.dp))
        Box(
            modifier = Modifier
                .padding(horizontal = 8.dp)
                .fillMaxWidth(0.8f)
                .height(14.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(Color(0xFF2A2A3E))
        )
        Spacer(Modifier.height(8.dp))
    }
}
