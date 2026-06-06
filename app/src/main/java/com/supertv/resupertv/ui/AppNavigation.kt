package com.supertv.resupertv.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.supertv.resupertv.ui.theme.*

sealed class Screen(
    val route: String,
    val title: String,
    val icon: ImageVector
) {
    data object Home : Screen("home", "首页", Icons.Default.Home)
    data object Search : Screen("search", "搜索", Icons.Default.Search)
    data object Favorites : Screen("favorites", "收藏", Icons.Default.Favorite)
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
        Screen.Search,
        Screen.Favorites,
        Screen.Settings
    )

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = BackgroundNav,
                contentColor = TextPrimary
            ) {
                screens.forEach { screen ->
                    NavigationBarItem(
                        icon = {
                            Icon(
                                screen.icon,
                                contentDescription = screen.title,
                                tint = if (selectedScreen == screen) PrimaryGreen else TextTertiary
                            )
                        },
                        label = {
                            Text(
                                screen.title,
                                fontSize = 11.sp,
                                fontWeight = if (selectedScreen == screen) FontWeight.Bold else FontWeight.Normal,
                                color = if (selectedScreen == screen) PrimaryGreen else TextTertiary
                            )
                        },
                        selected = selectedScreen == screen,
                        onClick = { selectedScreen = screen },
                        colors = NavigationBarItemDefaults.colors(
                            indicatorColor = BackgroundCard
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
                Screen.Home -> { /* TransformFragment */ }
                Screen.Search -> { onNavigateToSearch() }
                Screen.Favorites -> { /* ReflowFragment */ }
                Screen.Settings -> { /* SettingsFragment */ }
            }
        }
    }
}
