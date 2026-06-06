package com.supertv.resupertv.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * 应用主导航 - 对应原项目的 navigation 组件
 *
 * 底部导航 + Fragment 容器的 Compose 实现
 */
sealed class Screen(
    val route: String,
    val title: String,
    val icon: ImageVector
) {
    data object Home : Screen("home", "首页", Icons.Default.Home)
    data object Favorites : Screen("favorites", "收藏", Icons.Default.Favorite)
    data object Explore : Screen("explore", "浏览", Icons.Default.Explore)
    data object Settings : Screen("settings", "设置", Icons.Default.Settings)
}

@Composable
fun AppNavigation(
    onNavigateToSearch: () -> Unit = {},
    onNavigateToDetail: (String) -> Unit = {},
    onNavigateToPlayer: (String) -> Unit = {}
) {
    var selectedScreen by remember { mutableStateOf<Screen>(Screen.Home) }

    val screens = listOf(
        Screen.Home,
        Screen.Favorites,
        Screen.Explore,
        Screen.Settings
    )

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = Color(0xFF0D0D1A),
                contentColor = Color.White
            ) {
                screens.forEach { screen ->
                    NavigationBarItem(
                        icon = { Icon(screen.icon, contentDescription = screen.title) },
                        label = {
                            Text(
                                screen.title,
                                fontSize = 11.sp,
                                fontWeight = if (selectedScreen == screen) FontWeight.Bold else FontWeight.Normal
                            )
                        },
                        selected = selectedScreen == screen,
                        onClick = { selectedScreen = screen },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color(0xFF6200EE),
                            selectedTextColor = Color(0xFF6200EE),
                            unselectedIconColor = Color.Gray,
                            unselectedTextColor = Color.Gray,
                            indicatorColor = Color(0xFF1A1A2E)
                        )
                    )
                }
            }
        }
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues)) {
            // 根据选中的 Screen 显示对应的页面
            when (selectedScreen) {
                Screen.Home -> {
                    // TransformScreen 会通过 ComposeView 在 Fragment 中渲染
                    // 这里由 Fragment 容器管理
                }
                Screen.Favorites -> { /* ReflowFragment */ }
                Screen.Explore -> { /* SlideshowFragment */ }
                Screen.Settings -> { /* SettingsFragment */ }
            }
        }
    }
}
