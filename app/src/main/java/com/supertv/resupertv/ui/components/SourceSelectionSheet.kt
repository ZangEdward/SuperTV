package com.supertv.resupertv.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.CachePolicy
import coil.request.ImageRequest
import coil.size.Size
import com.supertv.resupertv.data.RetrofitClient
import com.supertv.resupertv.model.SearchResult
import com.supertv.resupertv.services.SpeedTestService
import com.supertv.resupertv.ui.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SourceSelectionSheet(
    sources: List<SearchResult>,
    currentSource: String,
    currentId: String,
    cover: String = "",
    title: String = "",
    onSourceSelected: (SearchResult) -> Unit,
    onRefresh: () -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val speedTestService = remember { SpeedTestService() }
    var latencies by remember { mutableStateOf<Map<String, Long>>(emptyMap()) }
    var isTesting by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    LaunchedEffect(sources, currentSource, currentId) {
        val idx = sources.indexOfFirst { it.source == currentSource && it.id == currentId }
        if (idx >= 0) listState.animateScrollToItem(idx.coerceAtLeast(0))
    }

    fun runSpeedTest() {
        scope.launch {
            isTesting = true
            val base = RetrofitClient.getCurrentBaseUrl().trimEnd('/')
            val urlMap = sources.associate { "${it.source}+${it.id}" to "$base/api/v1/douban/hot" }
            latencies = speedTestService.testAll(urlMap)
            isTesting = false
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = BackgroundCard,
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
    ) {
        Column {
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.SwapHoriz, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(8.dp))
                Text("换源 (${sources.size})", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary, modifier = Modifier.weight(1f))
                IconButton(onClick = { runSpeedTest() }, enabled = !isTesting) {
                    if (isTesting) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = PrimaryGreen)
                    else Icon(Icons.Default.Refresh, contentDescription = "测速", tint = TextSecondary)
                }
                IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, contentDescription = "关闭", tint = TextTertiary) }
            }
            if (cover.isNotBlank() || title.isNotBlank()) {
                Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (cover.isNotBlank()) {
                        AsyncImage(ImageRequest.Builder(context).data(cover).crossfade(true).size(Size(80, 120)).memoryCachePolicy(CachePolicy.ENABLED).build(),
                            null, Modifier.width(50.dp).height(70.dp).clip(RoundedCornerShape(6.dp)), contentScale = ContentScale.Crop)
                        Spacer(Modifier.width(12.dp))
                    }
                    Column {
                        Text(title, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = TextPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("共 ${sources.size} 个播放源", fontSize = 12.sp, color = TextSecondary)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            LazyColumn(state = listState, modifier = Modifier.heightIn(max = 400.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                itemsIndexed(sources) { _, source ->
                    SourceItem(context = context, source = source,
                        isSelected = source.source == currentSource && source.id == currentId,
                        latency = latencies["${source.source}+${source.id}"], isTesting = isTesting,
                        onClick = { onSourceSelected(source) })
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun SourceItem(context: android.content.Context, source: SearchResult, isSelected: Boolean, latency: Long?, isTesting: Boolean, onClick: () -> Unit) {
    val st = remember { SpeedTestService() }
    Surface(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp), color = if (isSelected) PrimaryGreen.copy(alpha = 0.15f) else BackgroundSurface) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (source.cover.isNotBlank()) {
                AsyncImage(ImageRequest.Builder(context).data(source.cover).crossfade(true).size(Size(80, 120)).memoryCachePolicy(CachePolicy.ENABLED).build(),
                    null, Modifier.width(36.dp).height(50.dp).clip(RoundedCornerShape(4.dp)), contentScale = ContentScale.Crop)
                Spacer(Modifier.width(10.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(source.sourceName.ifBlank { source.source }, fontSize = 14.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    color = if (isSelected) PrimaryGreen else TextPrimary)
                Text("${source.episodes.size}集 · ${source.year.ifBlank { "未知" }}", fontSize = 12.sp, color = TextTertiary)
            }
            if (isTesting) {
                CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp, color = TextTertiary)
            } else if (latency != null) {
                val grade = st.getLatencyGrade(latency)
                val gc = when { latency >= Long.MAX_VALUE -> ErrorRed; latency < 100 -> PrimaryGreen; latency < 300 -> StarYellow; else -> ErrorRed }
                Column(horizontalAlignment = Alignment.End) {
                    Text(grade, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = gc)
                    Text(st.formatLatency(latency), fontSize = 10.sp, color = gc.copy(alpha = 0.7f))
                }
            }
            if (isSelected) { Spacer(Modifier.width(6.dp)); Icon(Icons.Default.Check, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(18.dp)) }
        }
    }
}
