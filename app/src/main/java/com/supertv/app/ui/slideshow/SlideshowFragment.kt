package com.supertv.app.ui.slideshow

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.Fragment
import com.supertv.app.services.EpisodeCacheManager
import com.supertv.app.ui.theme.*

import androidx.fragment.app.activityViewModels
import com.supertv.app.viewmodel.MainViewModel

class SlideshowFragment : Fragment() {
    private val mainViewModel: MainViewModel by activityViewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return ComposeView(requireContext()).apply {
            setContent {
                val isDarkTheme by mainViewModel.isDarkTheme.collectAsState()
                SuperTVTheme(darkTheme = isDarkTheme) {
                    CacheManagementScreen()
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CacheManagementScreen() {
    val context = LocalContext.current
    val cacheManager = remember { EpisodeCacheManager(context) }
    val downloadStates by cacheManager.downloadStates.collectAsState()
    val downloadProgress by cacheManager.downloadProgress.collectAsState()
    
    var cacheSize by remember { mutableStateOf("0B") }

    LaunchedEffect(downloadStates) {
        val size = cacheManager.getCacheSize()
        cacheSize = if (size < 1024 * 1024) "${size / 1024}KB" else "${size / (1024 * 1024)}MB"
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("缓存与离线", fontWeight = FontWeight.Bold) },
                actions = {
                    IconButton(onClick = { cacheManager.clearAllCache() }) {
                        Icon(Icons.Default.Delete, contentDescription = "Clear All", tint = MaterialTheme.colorScheme.primary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.primary
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
        ) {
            Surface(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Download, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(12.dp))
                    Text("当前占用空间: $cacheSize", fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurface)
                }
            }

            if (downloadStates.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("暂无下载任务", color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
                    items(downloadStates.toList()) { (taskId, state) ->
                        val progress = downloadProgress[taskId] ?: 0f
                        CacheTaskItem(taskId, state, progress)
                    }
                }
            }
        }
    }
}

@Composable
fun CacheTaskItem(taskId: String, state: EpisodeCacheManager.DownloadState, progress: Float) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(taskId, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.weight(1f).height(4.dp),
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = MaterialTheme.colorScheme.surface
                )
                Spacer(Modifier.width(8.dp))
                Text("${(progress * 100).toInt()}%", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
            }
            Text(state.toString(), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
        }
    }
}
