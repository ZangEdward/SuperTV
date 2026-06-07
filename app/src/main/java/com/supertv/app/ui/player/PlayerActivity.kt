package com.supertv.app.ui.player

import android.app.UiModeManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.supertv.app.data.Store
import com.supertv.app.model.Episode
import com.supertv.app.model.PlayRecord
import com.supertv.app.ui.theme.*
import kotlinx.coroutines.delay

class PlayerActivity : ComponentActivity() {

    companion object {
        private const val EXTRA_URL = "video_url"
        private const val EXTRA_TITLE = "video_title"
        private const val EXTRA_EPISODE_INDEX = "episode_index"
        private const val EXTRA_SOURCE = "source"
        private const val EXTRA_ID = "content_id"
        private const val EXTRA_POSITION = "position"
        private const val EXTRA_TOTAL_EPISODES = "total_episodes"

        fun createIntent(
            context: Context,
            url: String,
            title: String,
            episodeIndex: Int = 0,
            source: String = "",
            id: String = "",
            position: Long = 0L,
            totalEpisodes: Int = 0
        ): Intent {
            return Intent(context, PlayerActivity::class.java).apply {
                putExtra(EXTRA_URL, url)
                putExtra(EXTRA_TITLE, title)
                putExtra(EXTRA_EPISODE_INDEX, episodeIndex)
                putExtra(EXTRA_SOURCE, source)
                putExtra(EXTRA_ID, id)
                putExtra(EXTRA_POSITION, position)
                putExtra(EXTRA_TOTAL_EPISODES, totalEpisodes)
            }
        }
    }

    private var player: ExoPlayer? = null
    private var store: Store? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = Store.getInstance(this)

        val url = intent?.getStringExtra(EXTRA_URL) ?: ""
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: ""
        val episodeIndex = intent?.getIntExtra(EXTRA_EPISODE_INDEX, 0) ?: 0
        val source = intent?.getStringExtra(EXTRA_SOURCE) ?: ""
        val id = intent?.getStringExtra(EXTRA_ID) ?: ""
        val position = intent?.getLongExtra(EXTRA_POSITION, 0L) ?: 0L
        val totalEpisodes = intent?.getIntExtra(EXTRA_TOTAL_EPISODES, 0) ?: 0

        setContent {
            val ctx = LocalContext.current
            val uiModeManager = ctx.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
            val isTvDevice = uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION

            if (isTvDevice) {
                TVPlayerScreen(
                    url = url, title = title, episodeIndex = episodeIndex,
                    onClose = { finish() },
                    onPositionChange = { pos ->
                        savePlayRecord(title, source, id, episodeIndex, totalEpisodes, pos)
                    }
                )
            } else {
                MobilePlayerScreen(
                    url = url, title = title, episodeIndex = episodeIndex,
                    totalEpisodes = totalEpisodes, episodes = emptyList(),
                    onClose = { finish() },
                    onPositionChange = { pos ->
                        savePlayRecord(title, source, id, episodeIndex, totalEpisodes, pos)
                    }
                )
            }
        }
    }

    override fun onStart() { super.onStart(); player?.play() }
    override fun onStop() { super.onStop(); player?.pause() }
    override fun onDestroy() { super.onDestroy(); player?.release(); player = null }

    private fun savePlayRecord(title: String, source: String, id: String, episodeIndex: Int, totalEpisodes: Int, position: Long) {
        if (title.isBlank()) return
        store?.addPlayRecord(PlayRecord(title = title, sourceName = source, index = episodeIndex, totalEpisodes = totalEpisodes, playTime = position, totalTime = 0L, saveTime = System.currentTimeMillis()))
    }
}

private val speedOptions = listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f)

// ══════════════════════════════════════════════════════════════�?
//  TV 播放�?�?全屏沉浸 + 遥控器控�?
// ══════════════════════════════════════════════════════════════�?

@Composable
fun TVPlayerScreen(
    url: String, title: String, episodeIndex: Int,
    onClose: () -> Unit, onPositionChange: (Long) -> Unit
) {
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showControls by remember { mutableStateOf(true) }
    var isPlaying by remember { mutableStateOf(true) }
    var playbackSpeed by remember { mutableFloatStateOf(1.0f) }
    var currentEpisodeIdx by remember { mutableIntStateOf(episodeIndex) }
    var curPos by remember { mutableLongStateOf(0L) }
    var dur by remember { mutableLongStateOf(0L) }

    val ctx = LocalContext.current
    val exoPlayer = remember {
        ExoPlayer.Builder(ctx).build().apply {
            setMediaItem(MediaItem.Builder().setUri(Uri.parse(url)).build())
            prepare(); playWhenReady = true
            addListener(object : Player.Listener {
                override fun onIsPlayingChanged(playing: Boolean) { isPlaying = playing }
                override fun onPlayerError(e: PlaybackException) { errorMessage = "播放失败: ${e.localizedMessage}" }
            })
        }
    }

    LaunchedEffect(isPlaying) {
        while (isPlaying) { curPos = exoPlayer.currentPosition; dur = exoPlayer.duration.coerceAtLeast(1); delay(1000) }
    }

    fun setSpeed(s: Float) { playbackSpeed = s; exoPlayer.setPlaybackSpeed(s) }
    fun seek(s: Long) { exoPlayer.seekTo((exoPlayer.currentPosition + s).coerceAtLeast(0)) }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(factory = { ctx ->
            PlayerView(ctx).apply {
                player = exoPlayer; useController = false
                setShowNextButton(false); setShowPreviousButton(false)
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT; keepScreenOn = true
                systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            }
        }, modifier = Modifier.fillMaxSize())

        // 控制覆盖�?
        Box(Modifier.fillMaxSize().clickable(
            interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
            indication = null
        ) { showControls = !showControls }) {
            if (showControls) {
                Box(Modifier.fillMaxSize().background(Color(0x80000000))) {
                    // 顶部：返�?+ 标题 + 倍�?
                    Box(Modifier.fillMaxWidth().padding(16.dp)) {
                        Row(Modifier.fillMaxWidth().align(Alignment.TopStart), verticalAlignment = Alignment.CenterVertically) {
                            IconButton(onClick = onClose) { Icon(Icons.Default.ArrowBack, contentDescription = "返回", tint = Color.White, modifier = Modifier.size(28.dp)) }
                            Spacer(Modifier.width(8.dp))
                            Text(title, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            TextButton(onClick = { val i = speedOptions.indexOf(playbackSpeed); setSpeed(speedOptions[(i + 1) % speedOptions.size]) }) {
                                Text("${playbackSpeed}x", color = PrimaryGreen, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    // 中间：快退 | 播放/暂停 | 快进
                    Row(Modifier.fillMaxWidth().align(Alignment.Center), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { seek(-15000) }, modifier = Modifier.size(56.dp)) { Icon(Icons.Default.Replay10, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp)) }
                        Spacer(Modifier.width(32.dp))
                        IconButton(onClick = { exoPlayer.playWhenReady = !exoPlayer.playWhenReady }, modifier = Modifier.size(80.dp)) {
                            Icon(if (isPlaying) Icons.Default.PauseCircle else Icons.Default.PlayCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(72.dp))
                        }
                        Spacer(Modifier.width(32.dp))
                        IconButton(onClick = { seek(15000) }, modifier = Modifier.size(56.dp)) { Icon(Icons.Default.Forward30, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp)) }
                    }

                    // 底部：进�?+ 集数 + 按钮
                    Column(Modifier.fillMaxWidth().padding(16.dp).align(Alignment.BottomCenter), horizontalAlignment = Alignment.CenterHorizontally) {
                        if (dur > 0) {
                            LinearProgressIndicator(progress = { (curPos.toFloat() / dur).coerceIn(0f, 1f) },
                                modifier = Modifier.fillMaxWidth().height(3.dp), color = PrimaryGreen, trackColor = Color(0x4DFFFFFF))
                            Spacer(Modifier.height(8.dp))
                        }
                        if (currentEpisodeIdx > 0) { Text("�?{currentEpisodeIdx + 1}�?, color = Color(0xFFAAAAAA), fontSize = 14.sp); Spacer(Modifier.height(8.dp)) }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally)) {
                            TVBtn("选源", Icons.Default.SwapHoriz) {}
                            TVBtn("选集", Icons.Default.List) {}
                            TVBtn("下一�?, Icons.Default.SkipNext) { currentEpisodeIdx++; exoPlayer.seekTo(0); exoPlayer.playWhenReady = true }
                        }
                    }
                }
            }
        }

        if (errorMessage != null) {
            Surface(Modifier.align(Alignment.Center).padding(32.dp), color = Color(0xCC000000), shape = RoundedCornerShape(12.dp)) {
                Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(errorMessage ?: "", color = Color.White, fontSize = 15.sp)
                    Spacer(Modifier.height(16.dp)); Button(onClick = onClose) { Text("返回") }
                }
            }
        }
    }
}

@Composable
private fun TVBtn(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Button(onClick = onClick, colors = ButtonDefaults.buttonColors(containerColor = Color(0xCC333333)), shape = RoundedCornerShape(8.dp)) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(text, fontSize = 14.sp)
    }
}

// ══════════════════════════════════════════════════════════════�?
//  移动端播放器 �?�?Selene
// ══════════════════════════════════════════════════════════════�?

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MobilePlayerScreen(
    url: String, title: String, episodeIndex: Int, totalEpisodes: Int, episodes: List<Episode>,
    onClose: () -> Unit, onPositionChange: (Long) -> Unit
) {
    var isLoading by remember { mutableStateOf(true) }
    var loadingMsg by remember { mutableStateOf("正在搜索播放�?..") }
    var showControls by remember { mutableStateOf(false) }
    var isPlaying by remember { mutableStateOf(true) }
    var errorMsg by remember { mutableStateOf<String?>(null) }
    var playSpeed by remember { mutableFloatStateOf(1.0f) }
    var isFav by remember { mutableStateOf(false) }
    var showEpDialog by remember { mutableStateOf(false) }
    var curPos by remember { mutableLongStateOf(0L) }
    var dur by remember { mutableLongStateOf(0L) }

    val mCtx = LocalContext.current
    val exo = remember {
        ExoPlayer.Builder(mCtx).build().apply {
            setMediaItem(MediaItem.Builder().setUri(Uri.parse(url)).build())
            prepare(); playWhenReady = true
            addListener(object : Player.Listener {
                override fun onIsPlayingChanged(p: Boolean) { isPlaying = p }
                override fun onPlayerError(e: PlaybackException) { errorMsg = "播放失败: ${e.localizedMessage}" }
            })
        }
    }

    LaunchedEffect(isPlaying) { while (isPlaying) { curPos = exo.currentPosition; dur = exo.duration.coerceAtLeast(1); delay(1000) } }
    fun seek(s: Long) { exo.seekTo((exo.currentPosition + s).coerceAtLeast(0)) }

    // 加载状�?
    if (isLoading) {
        Box(Modifier.fillMaxSize().background(BackgroundDark), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(color = PrimaryGreen, modifier = Modifier.size(48.dp))
                Spacer(Modifier.height(24.dp)); Text("🔍", fontSize = 36.sp)
                Spacer(Modifier.height(12.dp)); Text(loadingMsg, fontSize = 16.sp, color = TextSecondary)
                Spacer(Modifier.height(16.dp))
                LinearProgressIndicator(Modifier.width(200.dp).height(4.dp).clip(RoundedCornerShape(2.dp)), color = PrimaryGreen, trackColor = BackgroundCard)
            }
        }
        LaunchedEffect(Unit) {
            loadingMsg = "正在获取播放源详�?.."; delay(500)
            loadingMsg = "准备就绪，即将开始播�?.."; delay(500)
            isLoading = false
        }
        return
    }

    // 选集弹窗
    if (showEpDialog && episodes.isNotEmpty()) {
        AlertDialog(
            onDismissRequest = { showEpDialog = false }, title = { Text("选集", color = TextPrimary) },
            containerColor = BackgroundCard, text = {
                Column {
                    episodes.forEachIndexed { idx, ep ->
                        val cur = idx == episodeIndex
                        Surface(Modifier.fillMaxWidth().padding(vertical = 2.dp).clickable { showEpDialog = false },
                            shape = RoundedCornerShape(8.dp), color = if (cur) PrimaryGreen else BackgroundSurface) {
                            Text("�?{idx + 1}�?{if (ep.title.isNotBlank()) " - ${ep.title}" else ""}",
                                Modifier.padding(12.dp), fontSize = 14.sp, color = if (cur) Color.White else TextPrimary,
                                fontWeight = if (cur) FontWeight.Bold else FontWeight.Normal)
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showEpDialog = false }) { Text("关闭", color = PrimaryGreen) } }
        )
    }

    Column(Modifier.fillMaxSize().background(BackgroundDark)) {
        // 播放器区�?
        Box(Modifier.fillMaxWidth().height(250.dp)) {
            AndroidView(factory = { ctx ->
                PlayerView(ctx).apply { player = exo; useController = false; setShowNextButton(false); setShowPreviousButton(false); resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT; keepScreenOn = true }
            }, modifier = Modifier.fillMaxSize())

            Box(Modifier.fillMaxSize().clickable(interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, indication = null) { showControls = !showControls })

            if (showControls) {
                Box(Modifier.fillMaxSize().background(Color(0x80000000))) {
                    Box(Modifier.fillMaxWidth().padding(8.dp)) {
                    Row(Modifier.fillMaxWidth().align(Alignment.TopStart), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = onClose) { Icon(Icons.Default.ArrowBack, contentDescription = "返回", tint = Color.White) }
                        Text(title, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        TextButton(onClick = { val i = speedOptions.indexOf(playSpeed); playSpeed = speedOptions[(i + 1) % speedOptions.size]; exo.setPlaybackSpeed(playSpeed) }) {
                            Text("${playSpeed}x", color = PrimaryGreen, fontWeight = FontWeight.Bold)
                        }
                    }
                    Row(Modifier.fillMaxWidth().align(Alignment.Center), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { seek(-10000) }, modifier = Modifier.size(48.dp)) { Icon(Icons.Default.Replay10, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp)) }
                        Spacer(Modifier.width(24.dp))
                        IconButton(onClick = { exo.playWhenReady = !exo.playWhenReady }, modifier = Modifier.size(64.dp)) {
                            Icon(if (isPlaying) Icons.Default.PauseCircle else Icons.Default.PlayCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(56.dp))
                        }
                        Spacer(Modifier.width(24.dp))
                        IconButton(onClick = { seek(10000) }, modifier = Modifier.size(48.dp)) { Icon(Icons.Default.Forward30, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp)) }
                    }
                    if (dur > 0) {
                        LinearProgressIndicator(progress = { (curPos.toFloat() / dur).coerceIn(0f, 1f) },
                            modifier = Modifier.fillMaxWidth().align(Alignment.BottomCenter), color = PrimaryGreen, trackColor = Color(0x4DFFFFFF))
                    }
                }
            }

            if (errorMsg != null) {
                Surface(Modifier.align(Alignment.Center).padding(16.dp), color = Color(0xCC000000), shape = RoundedCornerShape(12.dp)) {
                    Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(errorMsg ?: "", color = Color.White, fontSize = 14.sp); Spacer(Modifier.height(12.dp)); Button(onClick = onClose) { Text("返回") }
                    }
                }
            }
        }

        // 视频信息
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(title, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                    if (totalEpisodes > 0) Text("�?{totalEpisodes}�?· �?{episodeIndex + 1}�?, fontSize = 14.sp, color = TextSecondary)
                }
                IconButton(onClick = { isFav = !isFav }) { Icon(if (isFav) Icons.Default.Favorite else Icons.Default.FavoriteBorder, contentDescription = "收藏", tint = if (isFav) FavoriteRed else TextSecondary) }
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MobBtn("选集", Icons.Default.List, { showEpDialog = true }, Modifier.weight(1f))
                MobBtn("换源", Icons.Default.SwapHoriz, {}, Modifier.weight(1f))
                MobBtn("收藏", if (isFav) Icons.Default.Favorite else Icons.Default.FavoriteBorder, { isFav = !isFav }, Modifier.weight(1f))
            }
            if (episodes.isNotEmpty()) {
                Spacer(Modifier.height(16.dp)); Text("剧集列表", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                Spacer(Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    itemsIndexed(episodes) { idx, ep ->
                        Surface(Modifier.width(52.dp).clickable { }, shape = RoundedCornerShape(8.dp), color = if (idx == episodeIndex) PrimaryGreen else BackgroundCard) {
                            Box(Modifier.padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
                                Text("${idx + 1}", fontSize = 15.sp, fontWeight = if (idx == episodeIndex) FontWeight.Bold else FontWeight.Normal, color = if (idx == episodeIndex) Color.White else TextPrimary)
                            }
                        }
                    }
                }
            }
        }
    }
}

}
@Composable
private fun MobBtn(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Button(onClick = onClick, modifier = modifier, colors = ButtonDefaults.buttonColors(containerColor = BackgroundCard), shape = RoundedCornerShape(10.dp)) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text(text, fontSize = 14.sp)
    }
}
