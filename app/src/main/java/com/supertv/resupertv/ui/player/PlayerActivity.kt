package com.supertv.resupertv.ui.player

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView

@OptIn(UnstableApi::class)
class PlayerActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 保持屏幕常亮
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        val videoUrl = intent.getStringExtra("video_url") ?: ""
        val title = intent.getStringExtra("title") ?: "正在播放"
        
        setContent {
            VideoPlayer(videoUrl)
        }
    }
}

@OptIn(UnstableApi::class)
@Composable
fun VideoPlayer(url: String) {
    val context = LocalContext.current
    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(url))
            prepare()
            playWhenReady = true
            // 增强功能：循环播放
            repeatMode = Player.REPEAT_MODE_ONE
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            exoPlayer.release()
        }
    }

    AndroidView(
        factory = { ctx ->
            PlayerView(ctx).apply {
                player = exoPlayer
                // 增强功能：显示控制栏
                useController = true
                setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
            }
        }
    )
}
