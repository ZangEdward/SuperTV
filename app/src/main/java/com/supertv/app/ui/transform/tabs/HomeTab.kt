package com.supertv.app.ui.transform.tabs

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.supertv.app.model.SearchResult
import com.supertv.app.ui.transform.PosterCard
import com.supertv.app.ui.transform.SectionHeader
import com.supertv.app.ui.transform.TransformViewModel
import com.supertv.app.ui.transform.VideoCardRow

@Composable
fun HomeTab(
    viewModel: TransformViewModel,
    onItemClick: (SearchResult) -> Unit
) {
    val hotMovies by viewModel.hotMovies.collectAsState()
    val recommended by viewModel.recommended.collectAsState()
    val animeUpdates by viewModel.animeUpdates.collectAsState()
    val shortDramas by viewModel.shortDramas.collectAsState()
    val playRecords by viewModel.playRecords.collectAsState()

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        if (playRecords.isNotEmpty()) {
            item {
                SectionHeader("最近播放")
                VideoCardRow(
                    items = playRecords.map { record ->
                        SearchResult(
                            title = record.title,
                            cover = record.cover,
                            source = record.sourceName, 
                            sourceName = record.sourceName,
                            id = record.title,
                            year = record.year
                        )
                    },
                    onClick = { /* Handle play record */ }
                )
            }
        }
        item {
            SectionHeader("豆瓣热播")
            VideoCardRow(items = hotMovies, onClick = onItemClick)
        }
        item {
            SectionHeader("精品推荐")
            VideoCardRow(items = recommended, onClick = onItemClick)
        }
        item {
            SectionHeader("动漫更新")
            VideoCardRow(items = animeUpdates, onClick = onItemClick)
        }
        item {
            SectionHeader("热门短剧")
            VideoCardRow(items = shortDramas, onClick = onItemClick)
        }
        item { Spacer(modifier = Modifier.height(80.dp)) }
    }
}
