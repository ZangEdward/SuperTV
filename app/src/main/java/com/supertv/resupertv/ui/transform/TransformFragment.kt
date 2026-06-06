package com.supertv.resupertv.ui.transform

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import coil.compose.AsyncImage
import com.supertv.resupertv.R
import com.supertv.resupertv.model.PlayRecord
import com.supertv.resupertv.ui.theme.*

class TransformFragment : Fragment() {

    private val viewModel: TransformViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return ComposeView(requireContext()).apply {
            setContent {
                MaterialTheme {
                    HomeScreen(
                        viewModel = viewModel,
                        onPlayRecordClick = {
                            // TODO: navigate to player
                        },
                        onSearchClick = {
                            findNavController().navigate(
                                R.id.action_nav_transform_to_search
                            )
                        }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: TransformViewModel,
    onPlayRecordClick: (PlayRecord) -> Unit,
    onSearchClick: () -> Unit
) {
    val playRecords by viewModel.playRecords.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark),
        contentPadding = PaddingValues(bottom = 16.dp)
    ) {
        item {
            TopAppBar(
                title = {
                    Text(
                        "SuperTV",
                        fontWeight = FontWeight.Bold,
                        color = PrimaryGreen
                    )
                },
                actions = {
                    TextButton(onClick = onSearchClick) {
                        Text("搜索", color = TextSecondary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = BackgroundDark
                )
            )
        }

        item {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .clickable(onClick = onSearchClick),
                shape = RoundedCornerShape(12.dp),
                color = BackgroundCard
            ) {
                Text(
                    text = "搜索影片、电视剧、动漫...",
                    modifier = Modifier.padding(16.dp),
                    color = TextTertiary,
                    fontSize = 15.sp
                )
            }
        }

        if (playRecords.isNotEmpty()) {
            item { SectionTitle("继续观看") }
            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(playRecords.take(10)) { record ->
                        PlayRecordCard(record = record, onClick = onPlayRecordClick)
                    }
                }
            }
        }

        item { SectionTitle("热门推荐") }
        item { Spacer(Modifier.height(32.dp)) }
    }
}

@Composable
fun SectionTitle(title: String) {
    Text(
        text = title,
        fontSize = 18.sp,
        fontWeight = FontWeight.Bold,
        color = TextPrimary,
        modifier = Modifier.padding(start = 16.dp, top = 20.dp, bottom = 8.dp)
    )
}

@Composable
fun PlayRecordCard(
    record: PlayRecord,
    onClick: (PlayRecord) -> Unit
) {
    Surface(
        modifier = Modifier
            .width(140.dp)
            .clickable { onClick(record) },
        shape = RoundedCornerShape(12.dp),
        color = BackgroundCard
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .background(Color(0xFF2A2A3E)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    record.title.first().toString(),
                    fontSize = 32.sp,
                    color = TextTertiary
                )
            }
            Text(
                text = record.title,
                fontSize = 13.sp,
                color = TextPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(8.dp)
            )
        }
    }
}
