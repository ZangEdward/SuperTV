package com.supertv.app.ui.reflow

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import com.supertv.app.model.Favorite
import com.supertv.app.ui.theme.*

class ReflowFragment : Fragment() {

    private val viewModel: ReflowViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return ComposeView(requireContext()).apply {
            setContent {
                MaterialTheme {
                    FavoritesScreen(viewModel = viewModel)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen(viewModel: ReflowViewModel) {
    val favorites by viewModel.favorites.collectAsState()

    Column(modifier = Modifier.fillMaxSize().background(BackgroundDark)) {
        TopAppBar(
            title = { Text("收藏", fontWeight = FontWeight.Bold, color = TextPrimary) },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = BackgroundDark)
        )

        if (favorites.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("暂无收藏", color = TextTertiary, fontSize = 18.sp)
                    Spacer(Modifier.height(8.dp))
                    Text("浏览影片时点击❤️即可收�?, color = TextTertiary, fontSize = 14.sp)
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(favorites, key = { it.searchTitle + it.sourceName }) { fav ->
                    FavoriteCard(favorite = fav)
                }
            }
        }
    }
}

@Composable
fun FavoriteCard(favorite: Favorite) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable { /* TODO */ },
        shape = RoundedCornerShape(12.dp),
        color = BackgroundCard
    ) {
        Column {
            Box(
                modifier = Modifier.fillMaxWidth().height(160.dp).background(Color(0xFF2A2A3E)),
                contentAlignment = Alignment.Center
            ) {
                Text(favorite.title.first().toString(), fontSize = 28.sp, color = TextTertiary)
            }
            Text(
                text = favorite.title, fontSize = 13.sp, color = TextPrimary,
                maxLines = 2, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(8.dp)
            )
        }
    }
}
