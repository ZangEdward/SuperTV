package com.supertv.app.ui.live

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.supertv.app.ui.theme.*

data class LiveChannel(
    val id: String,
    val name: String,
    val group: String,
    val logo: String = ""
)

@Composable
fun LiveScreen() {
    val channels = listOf(
        LiveChannel("1", "CCTV-1 综合", "央视频道"),
        LiveChannel("2", "CCTV-3 综艺", "央视频道"),
        LiveChannel("3", "CCTV-5 体育", "央视频道"),
        LiveChannel("4", "CCTV-6 电影", "央视频道"),
        LiveChannel("5", "CCTV-8 电视剧", "央视频道"),
        LiveChannel("6", "湖南卫视", "卫视频道"),
        LiveChannel("7", "浙江卫视", "卫视频道"),
        LiveChannel("8", "江苏卫视", "卫视频道"),
        LiveChannel("9", "东方卫视", "卫视频道"),
        LiveChannel("10", "广东卫视", "卫视频道")
    )

    // 使用主题色
    val backgroundColor = MaterialTheme.colorScheme.background
    val textColor = MaterialTheme.colorScheme.onBackground

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundColor)
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = backgroundColor,
            tonalElevation = 4.dp
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.LiveTv, contentDescription = null, tint = PrimaryGreen)
                Spacer(Modifier.width(12.dp))
                Text(
                    "电视直播",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    color = textColor
                )
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            val groupedChannels = channels.groupBy { it.group }
            groupedChannels.forEach { (group, channelList) ->
                item {
                    Text(
                        group,
                        fontSize = 14.sp,
                        color = PrimaryGreen,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(vertical = 4.dp)
                    )
                }
                items(channelList) { channel ->
                    LiveChannelItem(channel)
                }
            }
        }
    }
}

@Composable
fun LiveChannelItem(channel: LiveChannel) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { /* TODO: Play Live */ },
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(PrimaryGreen.copy(alpha = 0.1f), RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.PlayArrow, contentDescription = null, tint = PrimaryGreen)
            }
            Spacer(Modifier.width(16.dp))
            Text(
                channel.name,
                fontSize = 16.sp,
                color = MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.Medium
            )
            Spacer(Modifier.weight(1f))
            Text(
                "HD",
                fontSize = 10.sp,
                color = PrimaryGreen,
                modifier = Modifier
                    .background(PrimaryGreen.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 4.dp, vertical = 2.dp)
            )
        }
    }
}
