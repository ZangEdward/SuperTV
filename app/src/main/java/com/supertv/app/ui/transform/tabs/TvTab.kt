package com.supertv.app.ui.transform.tabs

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.supertv.app.model.SearchResult
import com.supertv.app.ui.transform.PosterCard
import com.supertv.app.ui.transform.SectionHeader
import com.supertv.app.ui.transform.TransformViewModel

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import com.supertv.app.ui.transform.VideoCardRow

@Composable
fun TvTab(
    viewModel: TransformViewModel,
    onItemClick: (SearchResult) -> Unit
) {
    val hotMovies by viewModel.hotMovies.collectAsState()
    val selectedSubCategory by viewModel.selectedSubCategory.collectAsState()

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        SectionHeader(if (selectedSubCategory == "热门") "最新剧集" else "$selectedSubCategory 剧集")
        VideoCardRow(itemsList = hotMovies, onClick = onItemClick, isGrid = true)
        Spacer(modifier = Modifier.height(80.dp))
    }
}
