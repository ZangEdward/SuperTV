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
            .height(56.dp) // 降低高度
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp) // 减小间距
    ) {
        // 左侧头像
        IconButton(
            onClick = onUserClick,
            modifier = Modifier.size(36.dp)
        ) {
            Icon(
                Icons.Outlined.AccountCircle,
                contentDescription = "用户",
                tint = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.size(28.dp)
            )
        }

        // 中间搜索框 - 稍微拉长且变薄
        Surface(
            modifier = Modifier
                .weight(1f)
                .height(36.dp) // 变薄
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
                    "搜索影片、网盘资源...",
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    fontSize = 13.sp,
                    maxLines = 1 // 拍成一行
                )
            }
        }

        // 右侧下载/缓存按钮
        IconButton(onClick = onDownloadClick, modifier = Modifier.size(36.dp)) {
            Icon(
                Icons.Outlined.FileDownload,
                contentDescription = "下载",
                tint = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.size(24.dp)
            )
        }

        // 主题切换按钮
        IconButton(onClick = onThemeToggle, modifier = Modifier.size(36.dp)) {
            Icon(
                if (isDarkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                contentDescription = "切换主题",
                tint = if (isDarkTheme) Color(0xFFFFD700) else MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}
