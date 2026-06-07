package com.supertv.app.ui.transform

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
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.supertv.app.R
import com.supertv.app.model.SearchResult
import com.supertv.app.ui.transform.TransformViewModel

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Search
import com.supertv.app.ui.theme.*

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
                    Surface(color = BackgroundDark) {
                        HomeScreen(
                            viewModel = viewModel,
                            onItemClick = { /* 导航逻辑 */ },
                            onSearchClick = {
                                findNavController().navigate(R.id.action_nav_transform_to_search)
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun HomeScreen(
    viewModel: TransformViewModel,
    onItemClick: (SearchResult) -> Unit,
    onSearchClick: () -> Unit
) {
    val hotMovies by viewModel.hotMovies.collectAsState(initial = emptyList())
    val recommended by viewModel.recommended.collectAsState(initial = emptyList())
    val animeUpdates by viewModel.animeUpdates.collectAsState(initial = emptyList())
    
    Column(modifier = Modifier.fillMaxSize().background(BackgroundDark)) {
        // Selene Style Header
        SeleneHeader(onSearchClick = onSearchClick)
        
        LazyColumn(modifier = Modifier.fillMaxSize()) {
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
            item { Spacer(modifier = Modifier.height(20.dp)) }
        }
    }
}

@Composable
fun SeleneHeader(onSearchClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .padding(horizontal = 16.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        IconButton(onClick = onSearchClick) {
            Icon(Icons.Default.Search, contentDescription = "搜索", tint = TextPrimary)
        }
        
        Text(
            text = "SuperTV",
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
            color = PrimaryGreen,
            letterSpacing = 1.5.sp
        )
        
        IconButton(onClick = { /* TODO: User Profile */ }) {
            Icon(Icons.Default.AccountCircle, contentDescription = "用户", tint = TextPrimary)
        }
    }
}

@Composable
fun SectionHeader(title: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .width(4.dp)
                .height(18.dp)
                .background(PrimaryGreen, RoundedCornerShape(2.dp))
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = title,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = TextPrimary
        )
    }
}

@Composable
fun VideoCardRow(items: List<SearchResult>, onClick: (SearchResult) -> Unit) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(items) { item ->
            PosterCard(result = item, onClick = { onClick(item) })
        }
    }
}

@Composable
fun PosterCard(result: SearchResult, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .width(120.dp)
            .clickable(onClick = onClick)
    ) {
        Box {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(result.cover)
                    .crossfade(true)
                    .build(),
                contentDescription = result.title,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.7f)
                    .clip(RoundedCornerShape(8.dp)),
                contentScale = ContentScale.Crop
            )
            // Rating or Label overlay could go here
        }
        Text(
            text = result.title,
            fontSize = 13.sp,
            color = TextPrimary,
            maxLines = 1,
            modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
        )
        Text(
            text = result.sourceName,
            fontSize = 11.sp,
            color = TextSecondary,
            maxLines = 1
        )
    }
}
