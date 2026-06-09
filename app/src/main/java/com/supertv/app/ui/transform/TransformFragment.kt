package com.supertv.app.ui.transform

import android.content.res.Configuration
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.supertv.app.R
import com.supertv.app.data.AuthRepository
import com.supertv.app.data.RetrofitClient
import com.supertv.app.model.SearchResult
import com.supertv.app.ui.components.LoginDialog
import com.supertv.app.ui.components.UserMenu
import com.supertv.app.ui.theme.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

import com.supertv.app.ui.components.GlobalHeader
import com.supertv.app.viewmodel.MainViewModel

import androidx.fragment.app.activityViewModels

class TransformFragment : Fragment() {
    private val viewModel: TransformViewModel by viewModels()
    private val mainViewModel: MainViewModel by activityViewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return ComposeView(requireContext()).apply {
            setContent {
                val isDarkTheme by mainViewModel.isDarkTheme.collectAsState()
                val authRepo = remember { AuthRepository.getInstance(context) }
                var showUserMenu by remember { mutableStateOf(false) }
                var isLoggedIn by remember { mutableStateOf(authRepo.isLoggedIn()) }
                var showLoginDialog by remember { mutableStateOf(!isLoggedIn) }

                SuperTVTheme(darkTheme = isDarkTheme) {
                    Surface(color = MaterialTheme.colorScheme.background) {
                        val configuration = LocalConfiguration.current
                        val isTv = (configuration.uiMode and Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_TELEVISION
                        
                        // 监听 401 错误，自动弹出登录框
                        LaunchedEffect(Unit) {
                            RetrofitClient.setUnauthorizedListener {
                                authRepo.clearCredentials()
                                showLoginDialog = true
                            }
                        }

                        // Get category from arguments
                        val category = arguments?.getString("category") ?: "热门"
                        LaunchedEffect(category) {
                            viewModel.selectCategory(category)
                        }

                        if (showLoginDialog) {
                            LoginDialog(
                                onLoginSuccess = {
                                    isLoggedIn = true
                                    showLoginDialog = false
                                    // 登录后同步数据
                                    val syncService = com.supertv.app.data.SyncService.getInstance(requireContext())
                                    kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                                        syncService.syncAll()
                                    }
                                    viewModel.refresh()
                                },
                                onDismiss = {
                                    showLoginDialog = false
                                }
                            )
                        }

                        if (showUserMenu) {
                            UserMenu(
                                onClose = { showUserMenu = false },
                                onLogout = {
                                    isLoggedIn = false
                                    showLoginDialog = true
                                },
                                onNavigateToDetail = { id, source, title ->
                                    val bundle = Bundle().apply {
                                        putString("id", id)
                                        putString("source", source)
                                        putString("title", title)
                                    }
                                    // 动态判断当前目的地，执行正确的 Action
                                    val currentDest = findNavController().currentDestination?.id
                                    val actionId = when (currentDest) {
                                        R.id.nav_movie -> R.id.action_nav_movie_to_detail
                                        R.id.nav_tv -> R.id.action_nav_tv_to_detail
                                        R.id.nav_anime -> R.id.action_nav_anime_to_detail
                                        R.id.nav_show -> R.id.action_nav_show_to_detail
                                        R.id.nav_short_drama -> R.id.action_nav_short_drama_to_detail
                                        else -> R.id.action_nav_transform_to_detail
                                    }
                                    findNavController().navigate(actionId, bundle)
                                },
                                onNavigateToDownloads = {
                                    findNavController().navigate(R.id.action_nav_transform_to_slideshow)
                                }
                            )
                        }

                        if (isTv) {
                            TVHomeScreen(
                                viewModel = viewModel,
                                onItemClick = { result ->
                                    val bundle = Bundle().apply {
                                        putString("id", result.id)
                                        putString("source", result.source)
                                        putString("title", result.title)
                                        putString("cover", result.cover.ifBlank { result.poster })
                                    }
                                    val currentDest = findNavController().currentDestination?.id
                                    val actionId = when (currentDest) {
                                        R.id.nav_movie -> R.id.action_nav_movie_to_detail
                                        R.id.nav_tv -> R.id.action_nav_tv_to_detail
                                        R.id.nav_anime -> R.id.action_nav_anime_to_detail
                                        R.id.nav_show -> R.id.action_nav_show_to_detail
                                        R.id.nav_short_drama -> R.id.action_nav_short_drama_to_detail
                                        else -> R.id.action_nav_transform_to_detail
                                    }
                                    findNavController().navigate(actionId, bundle)
                                },
                                onSearchClick = { findNavController().navigate(R.id.action_nav_transform_to_search) },
                                onUserClick = { 
                                    if (isLoggedIn) showUserMenu = true else showLoginDialog = true
                                }
                            )
                        } else {
                            HomeScreen(
                                viewModel = viewModel,
                                onItemClick = { result ->
                                    val bundle = Bundle().apply {
                                        putString("id", result.id)
                                        putString("source", result.source)
                                        putString("title", result.title)
                                        putString("cover", result.cover.ifBlank { result.poster })
                                    }
                                    val destId = findNavController().currentDestination?.id
                                    val actionId = when (destId) {
                                        R.id.nav_movie -> R.id.action_nav_movie_to_detail
                                        R.id.nav_tv -> R.id.action_nav_tv_to_detail
                                        R.id.nav_anime -> R.id.action_nav_anime_to_detail
                                        R.id.nav_show -> R.id.action_nav_show_to_detail
                                        R.id.nav_short_drama -> R.id.action_nav_short_drama_to_detail
                                        else -> R.id.action_nav_transform_to_detail
                                    }
                                    findNavController().navigate(actionId, bundle)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun TVHomeScreen(
    viewModel: TransformViewModel,
    onItemClick: (SearchResult) -> Unit,
    onSearchClick: () -> Unit,
    onUserClick: () -> Unit
) {
    val selectedCategory by viewModel.selectedCategory.collectAsState()
    val hotMovies by viewModel.hotMovies.collectAsState(initial = emptyList())
    val recommended by viewModel.recommended.collectAsState(initial = emptyList())
    val animeUpdates by viewModel.animeUpdates.collectAsState(initial = emptyList())
    val shortDramas by viewModel.shortDramas.collectAsState(initial = emptyList())
    
    val categories = listOf("热门", "电影", "剧集", "动漫", "综艺", "短剧")

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        // TV Header (SuperTV_old style)
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(
                    text = "视频",
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.clickable { }
                )
                Spacer(Modifier.width(20.dp))
                Text(
                    text = "直播",
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clickable { /* 跳转直播 */ }
                )
            }
            
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                IconButton(onClick = { /* 收藏 */ }) { Icon(Icons.Outlined.Favorite, null, tint = MaterialTheme.colorScheme.onBackground) }
                IconButton(onClick = onSearchClick) { Icon(Icons.Outlined.Search, null, tint = MaterialTheme.colorScheme.onBackground) }
                IconButton(onClick = { /* 设置 */ }) { Icon(Icons.Outlined.Settings, null, tint = MaterialTheme.colorScheme.onBackground) }
                IconButton(onClick = onUserClick) { Icon(Icons.Outlined.AccountCircle, null, tint = MaterialTheme.colorScheme.onBackground) }
            }
        }

        // Category Bar
        LazyRow(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(categories) { category ->
                val isSelected = category == selectedCategory
                Surface(
                    onClick = { viewModel.selectCategory(category) },
                    shape = RoundedCornerShape(8.dp),
                    color = if (isSelected) MaterialTheme.colorScheme.primary else Color.Transparent,
                    modifier = Modifier.padding(vertical = 4.dp)
                ) {
                    Text(
                        text = category,
                        color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }
            }
        }

        // Content Grid
        AnimatedContent(
            targetState = selectedCategory,
            transitionSpec = {
                val oldIndex = categories.indexOf(initialState)
                val newIndex = categories.indexOf(targetState)
                if (newIndex > oldIndex) {
                    (slideInHorizontally { it } + fadeIn()).togetherWith(slideOutHorizontally { -it } + fadeOut())
                } else {
                    (slideInHorizontally { -it } + fadeIn()).togetherWith(slideOutHorizontally { it } + fadeOut())
                }.using(SizeTransform(clip = false))
            },
            label = "TVCategoryAnimation",
            modifier = Modifier.fillMaxSize()
        ) { targetCategory ->
            LazyVerticalGrid(
                columns = GridCells.Fixed(5),
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                val content = when (targetCategory) {
                    "热门" -> hotMovies
                    "电影" -> recommended
                    "剧集" -> animeUpdates
                    "短剧" -> shortDramas
                    else -> emptyList()
                }
                items(content) { item ->
                    PosterCard(result = item, onClick = { onItemClick(item) })
                }
            }
        }
    }
}

@Composable
fun HomeScreen(
    viewModel: TransformViewModel,
    onItemClick: (SearchResult) -> Unit
) {
    val selectedCategory by viewModel.selectedCategory.collectAsState()
    val hotMovies by viewModel.hotMovies.collectAsState(initial = emptyList())
    val recommended by viewModel.recommended.collectAsState(initial = emptyList())
    val animeUpdates by viewModel.animeUpdates.collectAsState(initial = emptyList())
    val shortDramas by viewModel.shortDramas.collectAsState(initial = emptyList())
    val isLoading by viewModel.isLoading.collectAsState()
    
    val categories = listOf("热门", "电影", "剧集", "动漫", "综艺", "短剧")

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.statusBars)
    ) {
        if (isLoading && hotMovies.isEmpty() && recommended.isEmpty() && animeUpdates.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
        } else {
    AnimatedContent(
        targetState = selectedCategory,
        transitionSpec = {
            val oldIndex = categories.indexOf(initialState)
            val newIndex = categories.indexOf(targetState)
            if (newIndex > oldIndex) {
                // 向左滑入 (Forward)
                (slideInHorizontally { it } + fadeIn()).togetherWith(slideOutHorizontally { -it } + fadeOut())
            } else {
                // 向右滑入 (Backward)
                (slideInHorizontally { -it } + fadeIn()).togetherWith(slideOutHorizontally { it } + fadeOut())
            }.using(SizeTransform(clip = false))
        },
        label = "CategoryAnimation",
        modifier = Modifier.fillMaxSize()
    ) { targetCategory ->
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    when (targetCategory) {
                        "热门" -> {
                            item {
                                SectionHeader("豆瓣热播")
                                VideoCardRow(items = hotMovies, onClick = onItemClick)
                            }
                            item {
                                SectionHeader("精品推荐")
                                VideoCardRow(items = recommended, onClick = onItemClick)
                            }
                            item {
                                SectionHeader("动漫更新")
                                VideoCardRow(items = animeUpdates, onClick = onItemClick)
                            }
                            item {
                                SectionHeader("热门短剧")
                                VideoCardRow(items = shortDramas, onClick = onItemClick)
                            }
                        }
                        "电影" -> {
                            item {
                                SectionHeader("精品电影")
                                VideoCardRow(items = recommended, onClick = onItemClick, isGrid = true)
                            }
                        }
                        "剧集" -> {
                            item {
                                SectionHeader("最新剧集")
                                VideoCardRow(items = hotMovies, onClick = onItemClick, isGrid = true)
                            }
                        }
                        "动漫" -> {
                            item {
                                // 星期选择器 (Task 4)
                                val weekdays = listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")
                                var currentDay by remember { mutableIntStateOf(
                                    java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_WEEK).let { 
                                        if (it == 1) 7 else it - 1 
                                    }
                                )}

                                ScrollableTabRow(
                                    selectedTabIndex = currentDay - 1,
                                    containerColor = Color.Transparent,
                                    contentColor = PrimaryGreen,
                                    edgePadding = 16.dp,
                                    divider = {}
                                ) {
                                    weekdays.forEachIndexed { index, name ->
                                        Tab(
                                            selected = currentDay == index + 1,
                                            onClick = { 
                                                currentDay = index + 1
                                                viewModel.selectWeekday(currentDay)
                                            },
                                            text = { Text(name, fontSize = 14.sp) }
                                        )
                                    }
                                }
                                
                                Spacer(Modifier.height(16.dp))
                                SectionHeader("每日更新动漫")
                                VideoCardRow(items = animeUpdates, onClick = onItemClick, isGrid = true)
                            }
                        }
                        "综艺" -> {
                            item {
                                SectionHeader("热门综艺")
                                VideoCardRow(items = animeUpdates, onClick = onItemClick, isGrid = true)
                            }
                        }
                        "短剧" -> {
                            item {
                                SectionHeader("热门短剧")
                                VideoCardRow(items = shortDramas, onClick = onItemClick, isGrid = true)
                            }
                        }
                        else -> {
                            item {
                                SectionHeader(targetCategory)
                                if (isLoading && recommended.isEmpty()) {
                                    Text("内容正在加载...", modifier = Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                } else if (recommended.isEmpty()) {
                                    Text("暂无内容", modifier = Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                } else {
                                    VideoCardRow(items = recommended, onClick = onItemClick, isGrid = true)
                                }
                            }
                        }
                    }
                    item { Spacer(modifier = Modifier.height(80.dp)) }
                }
            }
        }
    }
}

@Composable
fun SectionHeader(title: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .width(4.dp)
                .height(18.dp)
                .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(2.dp))
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = title,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground
        )
    }
}

@Composable
fun VideoCardRow(items: List<SearchResult>, onClick: (SearchResult) -> Unit, isGrid: Boolean = false) {
    if (isGrid) {
        val configuration = LocalConfiguration.current
        val columns = if (configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) 5 else 3
        
        LazyVerticalGrid(
            columns = GridCells.Fixed(columns),
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.heightIn(max = 5000.dp)
        ) {
            items(items) { item ->
                PosterCard(result = item, onClick = { onClick(item) })
            }
        }
    } else {
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(items) { item ->
                PosterCard(result = item, onClick = { onClick(item) })
            }
        }
    }
}

@Composable
fun PosterCard(result: SearchResult, onClick: () -> Unit) {
    com.supertv.app.ui.components.VideoCard(
        result = result,
        onClick = onClick,
        modifier = Modifier.width(130.dp)
    )
}
