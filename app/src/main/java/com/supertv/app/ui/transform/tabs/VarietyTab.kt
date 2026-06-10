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

@Composable
fun VarietyTab(
    viewModel: TransformViewModel,
    onItemClick: (SearchResult) -> Unit
) {
    val varietyUpdates by viewModel.varietyUpdates.collectAsState()
    val selectedSubCategory by viewModel.selectedSubCategory.collectAsState()

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item { SectionHeader(if (selectedSubCategory == "热门") "热门综艺" else "$selectedSubCategory 综艺") }
        items(varietyUpdates.chunked(3)) { rowItems ->
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
                rowItems.forEach { item ->
                    Box(Modifier.weight(1f)) { PosterCard(result = item, onClick = { onItemClick(item) }) }
                }
                if (rowItems.size < 3) { repeat(3 - rowItems.size) { Spacer(Modifier.weight(1f)) } }
            }
        }
        item { Spacer(modifier = Modifier.height(80.dp)) }
    }
}
