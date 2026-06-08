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

@Composable
fun GlobalHeader(
    onUserClick: () -> Unit,
    onSearchClick: () -> Unit,
    onDownloadClick: () -> Unit,
    onThemeToggle: () -> Unit,
    isDarkTheme: Boolean
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // 左侧头像
        IconButton(
            onClick = onUserClick,
            modifier = Modifier.size(40.dp)
        ) {
            Icon(
                Icons.Outlined.AccountCircle,
                contentDescription = "用户",
                tint = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.size(32.dp)
            )
        }

        // 中间搜索框
        Surface(
            modifier = Modifier
                .weight(1f)
                .height(40.dp)
                .clickable { onSearchClick() },
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
            border = null
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Outlined.Search,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    "搜索影片、资源...",
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                    fontSize = 14.sp
                )
            }
        }

        // 右侧下载/缓存按钮
        IconButton(onClick = onDownloadClick) {
            Icon(
                Icons.Outlined.FileDownload,
                contentDescription = "下载",
                tint = MaterialTheme.colorScheme.onBackground
            )
        }

        // 主题切换按钮
        IconButton(onClick = onThemeToggle) {
            Icon(
                if (isDarkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                contentDescription = "切换主题",
                tint = if (isDarkTheme) Color(0xFFFFD700) else MaterialTheme.colorScheme.onBackground
            )
        }
    }
}
