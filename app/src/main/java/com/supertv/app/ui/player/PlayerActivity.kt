package com.supertv.app.ui.player

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.media.AudioManager
import android.os.Bundle
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.net.toUri
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.supertv.app.model.SearchResult
import com.supertv.app.services.DlnaService
import com.supertv.app.ui.theme.*
import com.supertv.app.viewmodel.MainViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
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
            val mainViewModel: MainViewModel = viewModel()
            val isDarkTheme by mainViewModel.isDarkTheme.collectAsState()

            SuperTVTheme(darkTheme = isDarkTheme) {
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
                                    currentUrl = nextSource.cover // 假设 cover 存的是 URL
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

                val configuration = LocalConfiguration.current
                val isPortrait = configuration.orientation == Configuration.ORIENTATION_PORTRAIT

                if (isTv) {
                    TVPlayerScreen(player, title)
                } else if (isPortrait) {
                    MobilePortraitPlayerScreen(
                        player = player,
                        title = title,
                        episodeIndex = episodeIndex,
                        totalEpisodes = totalEpisodes,
                        sources = sources,
                        onUrlChange = { currentUrl = it }
                    )
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

    fun setFullscreen(fullscreen: Boolean) {
        if (fullscreen) {
            window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
            window.addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
            window.clearFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)
        }
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
fun DlnaBottomSheet(onDismiss: () -> Unit, onCast: (String) -> Unit) {
    val context = LocalContext.current
    val dlnaService = remember { DlnaService(context) }
    val devices by dlnaService.devices.collectAsState()
    val isSearching by dlnaService.isSearching.collectAsState()

    LaunchedEffect(Unit) {
        dlnaService.discoverDevices()
    }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Color(0xFF1A1A1A)) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("选择投屏设备", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                if (isSearching) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = PrimaryGreen)
                } else {
                    IconButton(onClick = { dlnaService.discoverDevices() }) {
                        Icon(Icons.Default.Refresh, null, tint = Color.White)
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            if (devices.isEmpty()) {
                Box(Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                    Text("未发现设备，请确保手机与电视在同一WiFi", color = Color.Gray, textAlign = TextAlign.Center)
                }
            } else {
                LazyColumn(Modifier.heightIn(max = 300.dp)) {
                    items(devices) { device ->
                        ListItem(
                            headlineContent = { Text(device.name, color = Color.White) },
                            supportingContent = { Text(device.host, color = Color.Gray) },
                            modifier = Modifier.clickable {
                                onCast(device.host)
                                onDismiss()
                            },
                            colors = ListItemDefaults.colors(containerColor = Color.Transparent)
                        )
                    }
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MobilePortraitPlayerScreen(
    player: ExoPlayer,
    title: String,
    episodeIndex: Int,
    totalEpisodes: Int,
    sources: List<SearchResult>,
    onUrlChange: (String) -> Unit
) {
    val activity = LocalContext.current as? PlayerActivity
    var selectedTab by remember { mutableIntStateOf(0) }
    var showCastSheet by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        // Player Section (Fixed aspect ratio 16:9)
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black)) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        this.player = player
                        useController = true
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
            
            // Cast button overlay
            IconButton(
                onClick = { showCastSheet = true },
                modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).background(Color.Black.copy(alpha = 0.3f), CircleShape)
            ) {
                Icon(Icons.Default.Cast, "Cast", tint = Color.White)
            }
        }

        // Info & Tabs Section
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Text(title, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
            Spacer(Modifier.height(8.dp))
            
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Color.Transparent,
                contentColor = PrimaryGreen,
                divider = { HorizontalDivider(thickness = 0.5.dp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f)) }
            ) {
                Tab(selected = selectedTab == 0, onClick = { selectedTab = 0 }) {
                    Box(Modifier.padding(vertical = 12.dp)) { Text("选集", fontWeight = if(selectedTab == 0) FontWeight.Bold else FontWeight.Normal) }
                }
                Tab(selected = selectedTab == 1, onClick = { selectedTab = 1 }) {
                    Box(Modifier.padding(vertical = 12.dp)) { Text("换源", fontWeight = if(selectedTab == 1) FontWeight.Bold else FontWeight.Normal) }
                }
                Tab(selected = selectedTab == 2, onClick = { selectedTab = 2 }) {
                    Box(Modifier.padding(vertical = 12.dp)) { Text("简介", fontWeight = if(selectedTab == 2) FontWeight.Bold else FontWeight.Normal) }
                }
            }

            Spacer(Modifier.height(16.dp))

            when (selectedTab) {
                0 -> {
                    // 选集网格
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(4),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth().heightIn(max = 400.dp)
                    ) {
                        items(totalEpisodes) { index ->
                            Button(
                                onClick = { /* TODO: Switch episode */ },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (index == episodeIndex) PrimaryGreen else MaterialTheme.colorScheme.surfaceVariant
                                ),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.height(40.dp)
                            ) {
                                Text("${index + 1}", color = if (index == episodeIndex) Color.White else MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                1 -> {
                    // 换源列表
                    LazyColumn(Modifier.fillMaxWidth().heightIn(max = 400.dp)) {
                        items(sources) { source ->
                            ListItem(
                                headlineContent = { Text(source.sourceName, fontWeight = FontWeight.Bold) },
                                supportingContent = { Text("${source.episodes.size}集 · ${source.year}") },
                                modifier = Modifier.clickable { onUrlChange(source.cover) },
                                colors = ListItemDefaults.colors(containerColor = Color.Transparent)
                            )
                        }
                    }
                }
                2 -> {
                    // 简介
                    Text(
                        "暂无简介信息",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        lineHeight = 22.sp
                    )
                }
            }
        }
    }

    if (showCastSheet) {
        DlnaBottomSheet(onDismiss = { showCastSheet = false }, onCast = { ip ->
            Toast.makeText(activity, "正在向 $ip 投屏...", Toast.LENGTH_SHORT).show()
        })
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
    var showCastSheet by remember { mutableStateOf(false) }
    var showControls by remember { mutableStateOf(true) }

    // 控制器自动隐藏
    LaunchedEffect(showControls) {
        activity?.setFullscreen(!showControls)
        if (showControls) {
            delay(5000)
            showControls = false
        }
    }

    DisposableEffect(Unit) {
        onDispose { activity?.setFullscreen(false) }
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black).clickable { showControls = !showControls }) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    this.player = player
                    useController = false // 使用自定义 Compose 控制器
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
        AnimatedVisibility(
            visible = showControls,
            enter = fadeIn() + slideInVertically { -it },
            exit = fadeOut() + slideOutVertically { -it },
            modifier = Modifier.fillMaxSize()
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Top Bar
                Row(
                    modifier = Modifier.fillMaxWidth().padding(8.dp).background(Color.Black.copy(alpha = 0.3f)),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { activity?.finish() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                    Text(title, color = Color.White, modifier = Modifier.weight(1f))
                    
                    IconButton(onClick = { showCastSheet = true }) {
                        Icon(Icons.Default.Cast, "Cast", tint = Color.White)
                    }
                    IconButton(onClick = { showEpisodeSheet = true }) {
                        Icon(Icons.AutoMirrored.Filled.List, contentDescription = "Episodes", tint = Color.White)
                    }
                }
                
                Spacer(modifier = Modifier.weight(1f))

                // Bottom Bar
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp).background(Color.Black.copy(alpha = 0.3f)),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        var isPlaying by remember { mutableStateOf(player.isPlaying) }
                        DisposableEffect(player) {
                            val listener = object : Player.Listener {
                                override fun onIsPlayingChanged(playing: Boolean) { isPlaying = playing }
                            }
                            player.addListener(listener)
                            onDispose { player.removeListener(listener) }
                        }
                        IconButton(onClick = { if (player.isPlaying) player.pause() else player.play() }) {
                            Icon(if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow, null, tint = Color.White)
                        }
                        
                        // 进度条 (简化)
                        var position by remember { mutableStateOf(player.currentPosition) }
                        var duration by remember { mutableStateOf(player.duration) }
                        LaunchedEffect(showControls) {
                            while (showControls) {
                                position = player.currentPosition
                                duration = player.duration
                                delay(1000)
                            }
                        }
                        Text("${formatTime(position)} / ${formatTime(duration)}", color = Color.White, fontSize = 12.sp)
                    }

                    Button(onClick = { showSourceSheet = true }, colors = ButtonDefaults.buttonColors(containerColor = Color.Black.copy(alpha = 0.5f))) {
                        Icon(Icons.Default.SwapHoriz, contentDescription = null)
                        Spacer(Modifier.width(4.dp))
                        Text("换源")
                    }
                }
            }
        }

        if (gestureText != null) {
            Surface(
                color = Color.Black.copy(alpha = 0.6f),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.align(Alignment.Center).padding(bottom = 0.dp)
            ) {
                Text(gestureText!!, color = PrimaryGreen, modifier = Modifier.padding(16.dp), fontWeight = FontWeight.Bold)
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
                                onClick = { /* TODO */ },
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
                                    onUrlChange(source.cover)
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

        if (showCastSheet) {
            DlnaBottomSheet(onDismiss = { showCastSheet = false }, onCast = { ip ->
                Toast.makeText(activity, "正在向 $ip 投屏...", Toast.LENGTH_SHORT).show()
            })
        }
    }
}

private fun formatTime(ms: Long): String {
    val totalSeconds = ms / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format(java.util.Locale.US, "%02d:%02d", minutes, seconds)
}
