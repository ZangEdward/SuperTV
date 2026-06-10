package com.supertv.app.ui.transform.tabs

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.supertv.app.model.SearchResult
import com.supertv.app.ui.theme.PrimaryGreen
import com.supertv.app.ui.transform.PosterCard
import com.supertv.app.ui.transform.TransformViewModel

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import com.supertv.app.ui.transform.VideoCardRow

@Composable
fun AnimeTab(
    viewModel: TransformViewModel,
    onItemClick: (SearchResult) -> Unit
) {
    val animeUpdates by viewModel.animeUpdates.collectAsState()
    val weekdays = listOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")
    var currentDay by remember {
        mutableIntStateOf(
            java.util.Calendar.getInstance()
                .get(java.util.Calendar.DAY_OF_WEEK).let {
                    if (it == 1) 7 else it - 1
                }
        )
    }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        ScrollableTabRow(
            selectedTabIndex = currentDay - 1,
            containerColor = Color.Transparent,
            contentColor = PrimaryGreen,
            edgePadding = 16.dp,
            divider = {}
        ) {
            weekdays.forEachIndexed { index, name ->
                Tab(
                    selected = currentDay == index + 1,
                    onClick = {
                        currentDay = index + 1
                        viewModel.selectWeekday(currentDay)
                    },
                    text = { Text(name, fontSize = 14.sp) }
                )
            }
        }

        VideoCardRow(itemsList = animeUpdates, onClick = onItemClick, isGrid = true)
        Spacer(modifier = Modifier.height(80.dp))
    }
}
