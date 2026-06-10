package com.supertv.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.supertv.app.ui.theme.PrimaryGreen

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.material3.ripple
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import com.supertv.app.R

data class HeaderNavItem(
    val id: Int,
    val labelRes: Int,
    val icon: androidx.compose.ui.graphics.vector.ImageVector
)

@Composable
fun GlobalHeader(
    onUserClick: () -> Unit,
    onSearchClick: () -> Unit,
    onDownloadClick: () -> Unit,
    onThemeToggle: () -> Unit,
    isDarkTheme: Boolean,
    navItems: List<HeaderNavItem> = emptyList(),
    currentDestId: Int? = null,
    onNavItemClick: (Int) -> Unit = {}
) {
    val isTablet = navItems.isNotEmpty()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(if (isTablet) 64.dp else 56.dp)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(if (isTablet) 12.dp else 8.dp)
    ) {
        // 左侧头像
        IconButton(
            onClick = onUserClick,
            modifier = Modifier.size(if (isTablet) 40.dp else 36.dp)
        ) {
            Icon(
                Icons.Outlined.AccountCircle,
                contentDescription = "用户",
                tint = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.size(if (isTablet) 32.dp else 28.dp)
            )
        }

        // 中间搜索框
        Surface(
            modifier = Modifier
                .widthIn(max = if (isTablet) 280.dp else 400.dp)
                .then(if (isTablet) Modifier else Modifier.weight(1f))
                .height(36.dp)
                .clickable { onSearchClick() },
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f),
            border = null
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Outlined.Search,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    "搜索影片...",
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    fontSize = 13.sp,
                    maxLines = 1
                )
            }
        }

        if (isTablet) {
            // 平板导航项
            Row(
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                navItems.forEach { item ->
                    val isSelected = item.id == currentDestId
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 4.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = ripple(bounded = true, color = PrimaryGreen.copy(alpha = 0.1f)),
                                onClick = { onNavItemClick(item.id) }
                            )
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = stringResource(item.labelRes),
                            color = if (isSelected) PrimaryGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 16.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                        )
                        if (isSelected) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomCenter)
                                    .padding(top = 28.dp)
                                    .width(16.dp)
                                    .height(3.dp)
                                    .background(PrimaryGreen, RoundedCornerShape(2.dp))
                            )
                        }
                    }
                }
            }
        }

        // 右侧功能按钮
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            // 主题切换按钮
            IconButton(onClick = onThemeToggle, modifier = Modifier.size(36.dp)) {
                Icon(
                    if (isDarkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                    contentDescription = "切换主题",
                    tint = if (isDarkTheme) Color(0xFFFFD700) else MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.size(24.dp)
                )
            }

            // 下载按钮
            IconButton(onClick = onDownloadClick, modifier = Modifier.size(36.dp)) {
                Icon(
                    Icons.Outlined.FileDownload,
                    contentDescription = "下载",
                    tint = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}
