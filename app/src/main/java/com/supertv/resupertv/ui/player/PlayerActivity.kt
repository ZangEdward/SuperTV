package com.supertv.resupertv.ui.player

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.supertv.resupertv.data.Store
import com.supertv.resupertv.model.PlayRecord

/**
 * 播放器 Activity - 对应原项目的 app/play.tsx
 *
 * 使用 Media3 ExoPlayer 实现视频播放
 */
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
            PlayerScreen(
                url = url,
                title = title,
                episodeIndex = episodeIndex,
                onClose = { finish() },
                onPositionChange = { pos ->
                    savePlayRecord(title, source, id, episodeIndex, totalEpisodes, pos)
                }
            )
        }
    }

    override fun onStart() {
        super.onStart()
        player?.play()
    }

    override fun onStop() {
        super.onStop()
        player?.pause()
    }

    override fun onDestroy() {
        super.onDestroy()
        player?.release()
        player = null
    }

    private fun savePlayRecord(
        title: String,
        source: String,
        id: String,
        episodeIndex: Int,
        totalEpisodes: Int,
        position: Long
    ) {
        if (title.isBlank()) return
        store?.addPlayRecord(
            PlayRecord(
                title = title,
                sourceName = source,
                index = episodeIndex,
                totalEpisodes = totalEpisodes,
                playTime = position,
                totalTime = 0L,
                saveTime = System.currentTimeMillis()
            )
        )
    }
}

@Composable
fun PlayerScreen(
    url: String,
    title: String,
    episodeIndex: Int,
    onClose: () -> Unit,
    onPositionChange: (Long) -> Unit
) {
    val context = LocalContext.current
    var isPlaying by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .systemBarsPadding()
    ) {
        // 顶部控制器
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = Color(0xCC000000)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = onClose) {
                    Text("← 返回", color = Color.White, fontSize = 14.sp)
                }

                Spacer(Modifier.width(8.dp))

                Text(
                    text = title,
                    color = Color.White,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )

                if (episodeIndex > 0) {
                    Text(
                        "第${episodeIndex + 1}集",
                        color = Color.Gray,
                        fontSize = 13.sp
                    )
                }
            }
        }

        // 播放器
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        player = ExoPlayer.Builder(ctx).build().also { exoPlayer ->
                            val mediaItem = MediaItem.Builder()
                                .setUri(Uri.parse(url))
                                .build()
                            exoPlayer.setMediaItem(mediaItem)
                            exoPlayer.prepare()
                            exoPlayer.playWhenReady = true
                            exoPlayer.addListener(object : Player.Listener {
                                override fun onIsPlayingChanged(isPlaying: Boolean) {
                                    isPlaying = isPlaying
                                }

                                override fun onPlayerError(error: PlaybackException) {
                                    errorMessage = "播放出错: ${error.localizedMessage}"
                                }
                            })
                        }
                        this@PlayerActivity.player = player
                        useController = true
                        setShowNextButton(false)
                        setShowPreviousButton(false)
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                        keepScreenOn = true
                    }
                },
                modifier = Modifier.fillMaxSize()
            )

            // 错误提示
            if (errorMessage != null) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(32.dp),
                    color = Color(0xCC000000),
                    shape = MaterialTheme.shapes.medium
                ) {
                    Column(
                        modifier = Modifier.padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            errorMessage ?: "",
                            color = Color.White,
                            fontSize = 14.sp
                        )
                        Spacer(Modifier.height(16.dp))
                        Button(onClick = onClose) {
                            Text("返回")
                        }
                    }
                }
            }
        }
    }
}
