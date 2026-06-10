package com.supertv.app.ui.transform

import android.content.res.Configuration
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.supertv.app.R
import com.supertv.app.data.AuthRepository
import com.supertv.app.data.RetrofitClient
import com.supertv.app.model.SearchResult
import com.supertv.app.ui.components.LoginDialog
import com.supertv.app.ui.components.UserMenu
import com.supertv.app.ui.theme.*
import kotlinx.coroutines.launch

import com.supertv.app.viewmodel.MainViewModel
import androidx.fragment.app.activityViewModels
import com.supertv.app.ui.transform.tabs.*

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
                val actualIsDark by mainViewModel.isDarkTheme.collectAsState()
                var uiIsDark by remember { mutableStateOf(actualIsDark) }
                
                LaunchedEffect(actualIsDark) {
                    if (uiIsDark != actualIsDark) {
                        kotlinx.coroutines.delay(450)
                        uiIsDark = actualIsDark
                    }
                }

                val authRepo = remember { AuthRepository.getInstance(context) }
                var showUserMenu by remember { mutableStateOf(false) }
                var isLoggedIn by remember { mutableStateOf(authRepo.isLoggedIn()) }
                var showLoginDialog by remember { mutableStateOf(!isLoggedIn) }

                SuperTVTheme(darkTheme = uiIsDark) {
                    Surface(color = MaterialTheme.colorScheme.background) {
                        val configuration = LocalConfiguration.current
                        val isTv = (configuration.uiMode and Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_TELEVISION
                        
                        LaunchedEffect(Unit) {
                            RetrofitClient.setUnauthorizedListener {
                                authRepo.clearCredentials()
                                showLoginDialog = true
                            }
                        }

                        val category = arguments?.getString("category") ?: "热门"
                        LaunchedEffect(category) {
                            viewModel.selectCategory(category)
                        }

                        if (showLoginDialog) {
                            LoginDialog(
                                onLoginSuccess = {
                                    isLoggedIn = true
                                    showLoginDialog = false
                                    val syncService = com.supertv.app.data.SyncService.getInstance(requireContext())
                                    kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                                        syncService.syncAll()
                                    }
                                    viewModel.refresh()
                                },
                                onDismiss = { showLoginDialog = false }
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
                                onUserClick = { if (isLoggedIn) showUserMenu = true else showLoginDialog = true }
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
fun HomeScreen(
    viewModel: TransformViewModel,
    onItemClick: (SearchResult) -> Unit
) {
    val selectedCategory by viewModel.selectedCategory.collectAsState()
    val selectedSubCategory by viewModel.selectedSubCategory.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    
    val categories = listOf("热门", "电影", "剧集", "动漫", "综艺", "短剧")
    val subCategories = remember(selectedCategory) {
        when (selectedCategory) {
            "热门" -> emptyList()
            "电影" -> listOf("热门", "最新", "豆瓣高分", "冷门佳片", "华语", "欧美", "韩国", "日本")
            "剧集" -> listOf("热门", "华语", "欧美", "韩剧", "日剧", "泰国")
            "动漫" -> listOf("热门", "日本", "国产", "欧美")
            "综艺" -> listOf("热门", "内地", "港台", "日韩", "欧美")
            "短剧" -> listOf("热门", "最新")
            else -> listOf("热门")
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        if (selectedCategory != "热门" && subCategories.isNotEmpty()) {
            SubCategoryBar(
                subCategories = subCategories,
                selectedSubCategory = selectedSubCategory,
                onSubCategoryClick = { viewModel.selectSubCategory(it) }
            )
        }

        if (isLoading && selectedCategory != "动漫") { // 动漫由自己的 Tab 处理 Loading 或缓存
             val configuration = LocalConfiguration.current
             val columns = if (configuration.uiMode and Configuration.UI_MODE_TYPE_MASK == Configuration.UI_MODE_TYPE_TELEVISION) 5 else 3
             com.supertv.app.ui.components.ShimmerGrid(columns = columns)
        } else {
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
                label = "CategoryAnimation",
                modifier = Modifier.fillMaxSize()
            ) { targetCategory ->
                when (targetCategory) {
                    "热门" -> HomeTab(viewModel, onItemClick)
                    "电影" -> MovieTab(viewModel, onItemClick)
                    "剧集" -> TvTab(viewModel, onItemClick)
                    "动漫" -> AnimeTab(viewModel, onItemClick)
                    "综艺" -> VarietyTab(viewModel, onItemClick)
                    "短剧" -> ShortDramaTab(viewModel, onItemClick)
                    else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("暂无内容") }
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
    val selectedSubCategory by viewModel.selectedSubCategory.collectAsState()
    
    val categories = listOf("热门", "电影", "剧集", "动漫", "综艺", "短剧")
    val subCategories = remember(selectedCategory) {
        when (selectedCategory) {
            "热门" -> emptyList()
            "电影" -> listOf("热门", "最新", "豆瓣高分", "冷门佳片", "华语", "欧美", "韩国", "日本")
            "剧集" -> listOf("热门", "华语", "欧美", "韩剧", "日剧", "泰国")
            "动漫" -> listOf("热门", "日本", "国产", "欧美")
            "综艺" -> listOf("热门", "内地", "港台", "日韩", "欧美")
            "短剧" -> listOf("热门", "最新")
            else -> listOf("热门")
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "视频",
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
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
            
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { /* 收藏 */ }) { Icon(Icons.Outlined.Favorite, null, tint = MaterialTheme.colorScheme.onBackground) }
                IconButton(onClick = onSearchClick) { Icon(Icons.Outlined.Search, null, tint = MaterialTheme.colorScheme.onBackground) }
                IconButton(onClick = { /* 设置 */ }) { Icon(Icons.Outlined.Settings, null, tint = MaterialTheme.colorScheme.onBackground) }
                IconButton(onClick = onUserClick) { Icon(Icons.Outlined.AccountCircle, null, tint = MaterialTheme.colorScheme.onBackground) }
            }
        }
        LazyRow(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(categories) { category: String ->
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

        if (selectedCategory != "热门" && subCategories.isNotEmpty()) {
            LazyRow(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(subCategories) { subCategory ->
                    val isSelected = subCategory == selectedSubCategory
                    Surface(
                        onClick = { viewModel.selectSubCategory(subCategory) },
                        shape = RoundedCornerShape(20.dp),
                        color = if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f) else Color.Transparent,
                        border = if (isSelected) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null
                    ) {
                        Text(
                            text = subCategory,
                            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                        )
                    }
                }
            }
        }

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
            when (targetCategory) {
                "热门" -> HomeTab(viewModel, onItemClick) // 可以在这里传入 isTv 以适配大屏布局
                "电影" -> MovieTab(viewModel, onItemClick)
                "剧集" -> TvTab(viewModel, onItemClick)
                "动漫" -> AnimeTab(viewModel, onItemClick)
                "综艺" -> VarietyTab(viewModel, onItemClick)
                "短剧" -> ShortDramaTab(viewModel, onItemClick)
                else -> Box(Modifier.fillMaxSize())
            }
        }
    }
}

@Composable
fun SubCategoryBar(
    subCategories: List<String>,
    selectedSubCategory: String,
    onSubCategoryClick: (String) -> Unit
) {
    LazyRow(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.background)
            .padding(vertical = 8.dp),
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(subCategories) { subCategory ->
            val isSelected = subCategory == selectedSubCategory
            Surface(
                onClick = { onSubCategoryClick(subCategory) },
                shape = RoundedCornerShape(20.dp),
                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                tonalElevation = if (isSelected) 4.dp else 0.dp
            ) {
                Text(
                    text = subCategory,
                    color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                )
            }
        }
    }
}

@Composable
fun SectionHeader(title: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
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
fun VideoCardRow(itemsList: List<SearchResult>, onClick: (SearchResult) -> Unit, isGrid: Boolean = false) {
    val configuration = LocalConfiguration.current
    val isTv = configuration.uiMode and Configuration.UI_MODE_TYPE_MASK == Configuration.UI_MODE_TYPE_TELEVISION
    
    if (isGrid) {
        val columns = if (isTv) 5 else if (configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) 4 else 3
        
        LazyVerticalGrid(
            columns = GridCells.Fixed(columns),
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.heightIn(max = 10000.dp)
        ) {
            items(itemsList) { item ->
                PosterCard(result = item, onClick = { onClick(item) })
            }
        }
    } else {
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(itemsList) { item ->
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
