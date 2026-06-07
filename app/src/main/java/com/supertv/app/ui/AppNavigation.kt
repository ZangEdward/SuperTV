package com.supertv.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.supertv.app.ui.theme.*

sealed class Screen(
    val route: String,
    val title: String,
    val icon: ImageVector
) {
    data object Home : Screen("home", "首页", Icons.Rounded.Home)
    data object Movie : Screen("movie", "电影", Icons.Rounded.Movie)
    data object Tv : Screen("tv", "剧集", Icons.Rounded.LiveTv)
    data object Anime : Screen("anime", "动漫", Icons.Rounded.Pets)
    data object Show : Screen("show", "综艺", Icons.Rounded.TheaterComedy)
    data object Live : Screen("live", "直播", Icons.Rounded.Radio)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppNavigation(
    onNavigateToSearch: () -> Unit = {},
    onNavigateToDetail: (String) -> Unit = {},
    onNavigateToPlayer: (String) -> Unit = {}
) {
    var selectedScreen by remember { mutableStateOf<Screen>(Screen.Home) }

    val screens = listOf(
        Screen.Home,
        Screen.Movie,
        Screen.Tv,
        Screen.Anime,
        Screen.Show,
        Screen.Live
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                        Text(
                            "SuperTV",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = PrimaryGreen,
                            letterSpacing = 2.sp
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateToSearch) {
                        Icon(Icons.Default.Search, contentDescription = "搜索", tint = TextPrimary)
                    }
                },
                actions = {
                    IconButton(onClick = { /* 用户菜单 */ }) {
                        Icon(Icons.Default.AccountCircle, contentDescription = "用户", tint = TextPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = BackgroundDark,
                    titleContentColor = PrimaryGreen
                )
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = BackgroundNav,
                tonalElevation = 0.dp
            ) {
                screens.forEach { screen ->
                    val isSelected = selectedScreen == screen
                    NavigationBarItem(
                        icon = {
                            Icon(
                                screen.icon,
                                contentDescription = screen.title,
                                tint = if (isSelected) PrimaryGreen else TextTertiary
                            )
                        },
                        label = {
                            Text(
                                screen.title,
                                fontSize = 10.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) PrimaryGreen else TextTertiary
                            )
                        },
                        selected = isSelected,
                        onClick = { selectedScreen = screen },
                        colors = NavigationBarItemDefaults.colors(
                            indicatorColor = Color.Transparent
                        )
                    )
                }
            }
        },
        containerColor = BackgroundDark
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (selectedScreen) {
                Screen.Home -> { /* Home Content */ }
                else -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                        Text("正在开发中: ${selectedScreen.title}", color = TextSecondary)
                    }
                }
            }
        }
    }
}
