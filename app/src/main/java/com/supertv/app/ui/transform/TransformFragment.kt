package com.supertv.app.ui.transform

import android.content.res.Configuration
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
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
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Favorite
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
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
                    Surface(color = BackgroundDark) {
                        val configuration = LocalConfiguration.current
                        val isTv = (configuration.uiMode and Configuration.UI_MODE_TYPE_MASK) == Configuration.UI_MODE_TYPE_TELEVISION
                        
                        val authRepo = remember { AuthRepository.getInstance(context) }
                        var isLoggedIn by remember { mutableStateOf(authRepo.isLoggedIn()) }
                        var showUserMenu by remember { mutableStateOf(false) }

                        // 监听 401 错误，自动弹出登录框
                        LaunchedEffect(Unit) {
                            RetrofitClient.setUnauthorizedListener {
                                authRepo.clearCredentials()
                                isLoggedIn = false
                            }
                        }

                        if (!isLoggedIn) {
                            LoginDialog(onLoginSuccess = {
                                isLoggedIn = true
                                viewModel.refresh()
                            })
                        }

                        if (showUserMenu) {
                            UserMenu(
                                onClose = { showUserMenu = false },
                                onLogout = { isLoggedIn = false }
                            )
                        }

                        // Get category from arguments
                        val category = arguments?.getString("category") ?: "热门"
                        LaunchedEffect(category) {
                            viewModel.selectCategory(category)
                        }

                        if (isTv) {
                            TVHomeScreen(
                                viewModel = viewModel,
                                onItemClick = { /* 导航 */ },
                                onSearchClick = { findNavController().navigate(R.id.action_nav_transform_to_search) },
                                onUserClick = { showUserMenu = true }
                            )
                        } else {
                            HomeScreen(
                                viewModel = viewModel,
                                onItemClick = { /* 导航逻辑 */ },
                                onSearchClick = {
                                    findNavController().navigate(R.id.action_nav_transform_to_search)
                                },
                                onUserClick = { showUserMenu = true }
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

    Column(modifier = Modifier.fillMaxSize().background(BackgroundDark)) {
        // TV Header (SuperTV_old style)
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(
                    text = "视频",
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    modifier = Modifier.clickable { }
                )
                Spacer(Modifier.width(20.dp))
                Text(
                    text = "直播",
                    fontSize = 34.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.Gray,
                    modifier = Modifier.clickable { /* 跳转直播 */ }
                )
            }
            
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                IconButton(onClick = { /* 收藏 */ }) { Icon(Icons.Outlined.Favorite, null, tint = Color.White) }
                IconButton(onClick = onSearchClick) { Icon(Icons.Outlined.Search, null, tint = Color.White) }
                IconButton(onClick = { /* 设置 */ }) { Icon(Icons.Outlined.Settings, null, tint = Color.White) }
                IconButton(onClick = onUserClick) { Icon(Icons.Outlined.AccountCircle, null, tint = Color.White) }
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
                    color = if (isSelected) PrimaryGreen else Color.Transparent,
                    modifier = Modifier.padding(vertical = 4.dp)
                ) {
                    Text(
                        text = category,
                        color = if (isSelected) Color.White else Color.Gray,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }
            }
        }

        // Content Grid
        LazyVerticalGrid(
            columns = GridCells.Fixed(5),
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            val content = when (selectedCategory) {
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

@Composable
fun HomeScreen(
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
    
    Column(modifier = Modifier.fillMaxSize().background(BackgroundDark)) {
        // Selene Style Header
        SeleneHeader(onSearchClick = onSearchClick, onUserClick = onUserClick)
        
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            when (selectedCategory) {
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
                        VideoCardRow(items = recommended, onClick = onItemClick)
                    }
                }
                "剧集" -> {
                    item {
                        SectionHeader("最新剧集")
                        VideoCardRow(items = hotMovies, onClick = onItemClick)
                    }
                }
                "动漫" -> {
                    item {
                        SectionHeader("热门动漫")
                        VideoCardRow(items = animeUpdates, onClick = onItemClick)
                    }
                }
                "短剧" -> {
                    item {
                        SectionHeader("热门短剧")
                        VideoCardRow(items = shortDramas, onClick = onItemClick)
                    }
                }
                else -> {
                    item {
                        SectionHeader(selectedCategory)
                        Text("内容正在加载...", modifier = Modifier.padding(16.dp), color = TextTertiary)
                    }
                }
            }
            item { Spacer(modifier = Modifier.height(80.dp)) }
        }
    }
}

@Composable
fun SeleneHeader(onSearchClick: () -> Unit, onUserClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(horizontal = 16.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        IconButton(onClick = onSearchClick) {
            Icon(Icons.Outlined.Search, contentDescription = "搜索", tint = TextPrimary)
        }
        
        Text(
            text = "SuperTV",
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
            color = PrimaryGreen,
            letterSpacing = 1.5.sp
        )
        
        IconButton(onClick = onUserClick) {
            Icon(Icons.Outlined.AccountCircle, contentDescription = "用户", tint = TextPrimary)
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
                .background(PrimaryGreen, RoundedCornerShape(2.dp))
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = title,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = TextPrimary
        )
    }
}

@Composable
fun VideoCardRow(items: List<SearchResult>, onClick: (SearchResult) -> Unit) {
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
fun PosterCard(result: SearchResult, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(120.dp)
            .clickable(onClick = onClick)
    ) {
        Box {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(result.cover)
                    .crossfade(true)
                    .build(),
                contentDescription = result.title,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.7f)
                    .clip(RoundedCornerShape(8.dp)),
                contentScale = ContentScale.Crop
            )
        }
        Text(
            text = result.title,
            fontSize = 13.sp,
            color = TextPrimary,
            maxLines = 1,
            modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
        )
        Text(
            text = result.sourceName,
            fontSize = 11.sp,
            color = TextSecondary,
            maxLines = 1
        )
    }
}
