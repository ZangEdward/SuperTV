package com.supertv.app.ui.player

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
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
import com.supertv.app.ui.theme.PrimaryGreen
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val url = intent?.getStringExtra(EXTRA_URL) ?: ""
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: ""
        val episodeIndex = intent?.getIntExtra(EXTRA_EPISODE_INDEX, 0) ?: 0
        val source = intent?.getStringExtra(EXTRA_SOURCE) ?: ""
        val id = intent?.getStringExtra(EXTRA_ID) ?: ""
        val totalEpisodes = intent?.getIntExtra(EXTRA_TOTAL_EPISODES, 0) ?: 0

        setContent {
            MaterialTheme {
                val isTv = remember {
                    val uiModeManager = getSystemService(Context.UI_MODE_SERVICE) as? android.app.UiModeManager
                    uiModeManager?.currentModeType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION
                }

                if (isTv) {
                    TVPlayerScreen(url, title, episodeIndex, { finish() }, {})
                } else {
                    MobilePlayerScreen(url, title, episodeIndex, totalEpisodes, emptyList(), { finish() }, {})
                }
            }
        }
    }
}

@Composable
fun TVPlayerScreen(
    url: String, title: String, episodeIndex: Int,
    onClose: () -> Unit, onPositionChange: (Long) -> Unit
) {
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        Text("TV Player: $title", color = Color.White, modifier = Modifier.align(Alignment.Center))
        IconButton(onClick = onClose, modifier = Modifier.padding(16.dp)) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Close", tint = Color.White)
        }
    }
}

@Composable
fun MobilePlayerScreen(
    url: String, title: String, episodeIndex: Int, totalEpisodes: Int,
    episodes: List<Episode>, onClose: () -> Unit, onPositionChange: (Long) -> Unit
) {
    Column(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(8.dp)) {
            IconButton(onClick = onClose) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
            }
            Text(title, color = Color.White, fontSize = 18.sp, modifier = Modifier.weight(1f))
        }
        
        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
            Text("Mobile Player Content", color = Color.White)
        }

        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MobBtn(text = "选集", icon = Icons.Default.List, onClick = {})
            MobBtn(text = "换源", icon = Icons.Default.SwapHoriz, onClick = {})
        }
    }
}

@Composable
fun MobBtn(text: String, icon: ImageVector, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Button(
        onClick = onClick,
        modifier = modifier,
        colors = ButtonDefaults.buttonColors(containerColor = Color.DarkGray),
        shape = RoundedCornerShape(8.dp)
    ) {
        Icon(icon, contentDescription = null)
        Spacer(Modifier.width(4.dp))
        Text(text, fontSize = 14.sp)
    }
}

@Composable
fun TVBtn(text: String, icon: ImageVector, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(containerColor = Color.Gray),
        shape = RoundedCornerShape(4.dp)
    ) {
        Icon(icon, contentDescription = null)
        Spacer(Modifier.width(4.dp))
        Text(text)
    }
}
