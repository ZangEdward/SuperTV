package com.supertv.resupertv.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.supertv.resupertv.ui.components.FocusableNavButton
import com.supertv.resupertv.ui.components.VideoGrid

@Composable
fun AppNavigation(
    widthSizeClass: WindowWidthSizeClass,
    modifier: Modifier = Modifier
) {
    when (widthSizeClass) {
        WindowWidthSizeClass.Compact -> {
            Scaffold(
                bottomBar = { 
                    NavigationBar { 
                        NavigationBarItem(
                            selected = true,
                            onClick = {},
                            label = { Text("Home") },
                            icon = { Icon(Icons.Default.Home, contentDescription = null) }
                        )
                    } 
                }
            ) { padding ->
                Box(modifier = modifier.padding(padding)) { 
                    VideoGrid(items = listOf("1", "2", "3", "4", "5", "6"))
                }
            }
        }
        else -> {
            Row(modifier = modifier.fillMaxSize()) {
                NavigationRail {
                    FocusableNavButton {
                        NavigationRailItem(
                            selected = true,
                            onClick = {},
                            label = { Text("Home") },
                            icon = { Icon(Icons.Default.Home, contentDescription = null) }
                        )
                    }
                }
                Box(modifier = Modifier.weight(1f)) { 
                    VideoGrid(items = listOf("1", "2", "3", "4", "5", "6"))
                }
            }
        }
    }
}
