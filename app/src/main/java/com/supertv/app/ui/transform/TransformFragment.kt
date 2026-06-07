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

@Composable
fun HomeScreen(
    viewModel: TransformViewModel,
    onItemClick: (SearchResult) -> Unit,
    onSearchClick: () -> Unit
) {
    val hotMovies by viewModel.hotMovies.collectAsState(initial = emptyList())
    
    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            item {
                SectionHeader("豆瓣热播")
                VideoCardRow(items = hotMovies, onClick = onItemClick)
            }
        }
    }
}

@Composable
fun SectionHeader(title: String) {
    Text(
        text = title,
        fontSize = 20.sp,
        fontWeight = FontWeight.Bold,
        color = Color.White,
        modifier = Modifier.padding(16.dp)
    )
}

@Composable
fun VideoCardRow(items: List<SearchResult>, onClick: (SearchResult) -> Unit) {
    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        items(items) { item ->
            PosterCard(result = item, onClick = { onClick(item) })
        }
    }
}

@Composable
fun PosterCard(result: SearchResult, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .width(130.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(result.cover)
                    .crossfade(true)
                    .build(),
                contentDescription = result.title,
                modifier = Modifier.fillMaxWidth().aspectRatio(0.67f).clip(RoundedCornerShape(8.dp)),
                contentScale = ContentScale.Crop
            )
            Text(
                text = result.title,
                fontSize = 13.sp,
                maxLines = 1,
                modifier = Modifier.padding(8.dp)
            )
        }
    }
}
