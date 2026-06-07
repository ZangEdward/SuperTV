package com.supertv.app.ui.player

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Bundle
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.net.toUri
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.supertv.app.model.SearchResult
import com.supertv.app.ui.theme.PrimaryGreen
import kotlinx.coroutines.delay
import kotlin.math.abs

class PlayerActivity : ComponentActivity() {

    companion object {
        private const val EXTRA_URL = "video_url"
        private const val EXTRA_TITLE = "video_title"
        private const val EXTRA_EPISODE_INDEX = "episode_index"
        private const val EXTRA_TOTAL_EPISODES = "total_episodes"
        private const val EXTRA_SOURCE = "source"
        private const val EXTRA_ID = "content_id"
        // 传递备用源列表的 JSON
        private const val EXTRA_SOURCES_JSON = "sources_json"

        fun createIntent(
            context: Context,
            url: String,
            title: String,
            episodeIndex: Int = 0,
            totalEpisodes: Int = 0,
            sourcesJson: String = "[]",
            source: String = "",
            id: String = ""
        ): Intent {
            return Intent(context, PlayerActivity::class.java).apply {
                putExtra(EXTRA_URL, url)
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_EPISODE_INDEX, episodeIndex)
                putExtra(EXTRA_TOTAL_EPISODES, totalEpisodes)
                putExtra(EXTRA_SOURCES_JSON, sourcesJson)
                putExtra(EXTRA_SOURCE, source)
                putExtra(EXTRA_ID, id)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        val initialUrl = intent?.getStringExtra(EXTRA_URL) ?: ""
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: ""
        val episodeIndex = intent?.getIntExtra(EXTRA_EPISODE_INDEX, 0) ?: 0
        val totalEpisodes = intent?.getIntExtra(EXTRA_TOTAL_EPISODES, 0) ?: 0
        val sourcesJson = intent?.getStringExtra(EXTRA_SOURCES_JSON) ?: "[]"

        setContent {
            MaterialTheme {
                val context = LocalContext.current
                var currentUrl by remember { mutableStateOf(initialUrl) }
                var isAutoSwitching by remember { mutableStateOf(false) }
                
                // 解析备用源
                val sources = remember(sourcesJson) {
                    try {
                        val type = object : com.google.gson.reflect.TypeToken<List<SearchResult>>() {}.type
                        com.google.gson.Gson().fromJson<List<SearchResult>>(sourcesJson, type) ?: emptyList()
                    } catch (e: Exception) { emptyList<SearchResult>() }
                }

                val player = remember {
                    ExoPlayer.Builder(context).build().also {
                        it.prepare()
                        it.playWhenReady = true
                    }
                }

                // 核心播放逻辑：当 URL 变化时更新 MediaItem
                LaunchedEffect(currentUrl) {
                    if (currentUrl.isNotBlank()) {
                        player.setMediaItem(MediaItem.fromUri(currentUrl.toUri()))
                        player.prepare()
                    }
                }

                // 自动换源监听
                DisposableEffect(player) {
                    val listener = object : Player.Listener {
                        override fun onPlayerError(error: PlaybackException) {
                            if (!isAutoSwitching && sources.isNotEmpty()) {
                                val nextSource = sources.firstOrNull { it.cover != currentUrl } // 简单模拟逻辑
                                if (nextSource != null) {
                                    isAutoSwitching = true
                                    Toast.makeText(context, "当前线路故障，正在尝试备用源...", Toast.LENGTH_SHORT).show()
                                    currentUrl = nextSource.cover // 假设 cover 存的是 URL，实际应由 repository 获取
                                    isAutoSwitching = false
                                }
                            }
                        }
                    }
                    player.addListener(listener)
                    onDispose { player.removeListener(listener); player.release() }
                }

                val isTv = remember {
                    val uiModeManager = getSystemService(Context.UI_MODE_SERVICE) as? android.app.UiModeManager
                    uiModeManager?.currentModeType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION
                }

                if (isTv) {
                    TVPlayerScreen(player, title)
                } else {
                    MobilePlayerScreen(
                        player = player,
                        title = title,
                        episodeIndex = episodeIndex,
                        totalEpisodes = totalEpisodes,
                        sources = sources,
                        onUrlChange = { currentUrl = it }
                    )
                }
            }
        }
    }

    fun setBrightness(value: Float) {
        val params = window.attributes
        params.screenBrightness = value.coerceIn(0.01f, 1.0f)
        window.attributes = params
    }
}

@Composable
fun TVPlayerScreen(player: ExoPlayer, title: String) {
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = { context ->
                PlayerView(context).apply {
                    this.player = player
                    useController = true
                }
            },
            modifier = Modifier.fillMaxSize()
        )
        Text(title, color = Color.White.copy(alpha = 0.6f), modifier = Modifier.padding(16.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MobilePlayerScreen(
    player: ExoPlayer,
    title: String,
    episodeIndex: Int,
    totalEpisodes: Int,
    sources: List<SearchResult>,
    onUrlChange: (String) -> Unit
) {
    val context = LocalContext.current
    val audioManager = remember { context.getSystemService(Context.AUDIO_SERVICE) as AudioManager }
    val activity = context as? PlayerActivity
    
    var gestureText by remember { mutableStateOf<String?>(null) }
    var showEpisodeSheet by remember { mutableStateOf(false) }
    var showSourceSheet by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    this.player = player
                    useController = true
                }
            },
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDrag = { change, dragAmount ->
                            change.consume()
                            val x = change.position.x
                            val width = size.width
                            
                            if (abs(dragAmount.x) > abs(dragAmount.y)) {
                                val seekDelta = (dragAmount.x * 100).toLong()
                                player.seekTo(player.currentPosition + seekDelta)
                                gestureText = "进度: ${formatTime(player.currentPosition)}"
                            } else {
                                if (x < width / 2) {
                                    activity?.let {
                                        val currentBrightness = it.window.attributes.screenBrightness
                                        val newBrightness = (if (currentBrightness < 0) 0.5f else currentBrightness) - (dragAmount.y / 1000f)
                                        it.setBrightness(newBrightness)
                                        gestureText = "亮度: ${(newBrightness * 100).toInt()}%"
                                    }
                                } else {
                                    val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                                    val currentVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
                                    val delta = if (dragAmount.y > 0) -1 else 1
                                    audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, (currentVolume + delta).coerceIn(0, maxVolume), 0)
                                    val volPct = ((currentVolume + delta).toFloat() / maxVolume * 100).toInt()
                                    gestureText = "音量: ${volPct}%"
                                }
                            }
                        },
                        onDragEnd = { gestureText = null }
                    )
                }
        )

        // Overlay UI
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(8.dp).background(Color.Black.copy(alpha = 0.3f)),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = { activity?.finish() }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Text(title, color = Color.White, modifier = Modifier.weight(1f))
                
                IconButton(onClick = { showEpisodeSheet = true }) {
                    Icon(Icons.AutoMirrored.Filled.List, contentDescription = "Episodes", tint = Color.White)
                }
            }
            
            Spacer(modifier = Modifier.weight(1f))

            if (gestureText != null) {
                Surface(
                    color = Color.Black.copy(alpha = 0.6f),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.align(Alignment.CenterHorizontally).padding(bottom = 120.dp)
                ) {
                    Text(gestureText!!, color = PrimaryGreen, modifier = Modifier.padding(16.dp), fontWeight = FontWeight.Bold)
                }
            }

            // Bottom Buttons
            Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.End) {
                Button(onClick = { showSourceSheet = true }, colors = ButtonDefaults.buttonColors(containerColor = Color.Black.copy(alpha = 0.5f))) {
                    Icon(Icons.Default.SwapHoriz, contentDescription = null)
                    Spacer(Modifier.width(4.dp))
                    Text("换源")
                }
            }
        }

        // 选集弹窗
        if (showEpisodeSheet) {
            ModalBottomSheet(onDismissRequest = { showEpisodeSheet = false }, containerColor = Color(0xFF1A1A1A)) {
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    Text("选集", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(16.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(totalEpisodes) { index ->
                            Button(
                                onClick = { showEpisodeSheet = false },
                                colors = ButtonDefaults.buttonColors(containerColor = if (index == episodeIndex) PrimaryGreen else Color.DarkGray),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.size(60.dp, 40.dp)
                            ) { Text("${index + 1}", color = Color.White) }
                        }
                    }
                    Spacer(Modifier.height(32.dp))
                }
            }
        }

        // 换源弹窗
        if (showSourceSheet) {
            ModalBottomSheet(onDismissRequest = { showSourceSheet = false }, containerColor = Color(0xFF1A1A1A)) {
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    Text("切换播放源", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(16.dp))
                    LazyColumn(modifier = Modifier.heightIn(max = 300.dp)) {
                        items(sources) { source ->
                            ListItem(
                                headlineContent = { Text(source.sourceName, color = Color.White) },
                                supportingContent = { Text(source.year, color = Color.Gray) },
                                modifier = Modifier.clickable {
                                    onUrlChange(source.cover) // 切换 URL
                                    showSourceSheet = false
                                },
                                colors = ListItemDefaults.colors(containerColor = Color.Transparent)
                            )
                        }
                    }
                    Spacer(Modifier.height(32.dp))
                }
            }
        }
    }
}

private fun formatTime(ms: Long): String {
    val totalSeconds = ms / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format(java.util.Locale.US, "%02d:%02d", minutes, seconds)
}
