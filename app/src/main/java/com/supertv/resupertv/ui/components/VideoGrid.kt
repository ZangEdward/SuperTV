package com.supertv.resupertv.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

@Composable
fun VideoGrid(
    items: List<VideoItem>,
    modifier: Modifier = Modifier
) {
    LazyVerticalGrid(
        // 固定为两列，防止电视端显示重叠
        columns = GridCells.Fixed(2),
        modifier = modifier.padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        content = {
            items(items) { item ->
                FocusableNavButton {
                    Card {
                        Column {
                            AsyncImage(
                                model = item.poster,
                                contentDescription = item.title,
                                modifier = Modifier.height(150.dp).fillMaxWidth(),
                                contentScale = ContentScale.Crop
                            )
                            Text(
                                text = item.title, 
                                modifier = Modifier.padding(6.dp),
                                style = androidx.compose.material3.MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                }
            }
        }
    )
}

data class VideoItem(val title: String, val poster: String)
