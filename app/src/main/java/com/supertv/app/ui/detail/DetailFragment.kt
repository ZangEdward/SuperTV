package com.supertv.app.ui.detail

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.runtime.*
import androidx.compose.ui.platform.ComposeView
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.supertv.app.ui.theme.SuperTVTheme
import com.supertv.app.ui.player.PlayerActivity
import com.supertv.app.viewmodel.SearchViewModel

/**
 * 视频详情 Fragment
 */
class DetailFragment : Fragment() {

    private val viewModel: SearchViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        // 获取参数
        val id = arguments?.getString("id") ?: ""
        val source = arguments?.getString("source") ?: ""
        val title = arguments?.getString("title") ?: ""
        val cover = arguments?.getString("cover") ?: ""

        // 加载详情
        if (id.isNotBlank() && source.isNotBlank()) {
            viewModel.loadDetail(id, source)
        }

        return ComposeView(requireContext()).apply {
            setContent {
                SuperTVTheme {
                    val detail by viewModel.detail.collectAsState()
                    val isLoading by viewModel.isLoadingDetail.collectAsState()
                    
                    DetailScreen(
                        detail = detail,
                        isLoading = isLoading,
                        isFavorite = false,
                        cachedEpisodes = emptySet(),
                        onEpisodeClick = { episode ->
                            val intent = PlayerActivity.createIntent(
                                context = requireContext(),
                                url = episode.url,
                                title = detail?.title ?: title,
                                source = detail?.source ?: source,
                                id = detail?.id ?: id
                            )
                            startActivity(intent)
                        },
                        onToggleFavorite = { /* TODO */ },
                        onBack = { findNavController().navigateUp() },
                        onPlayAll = {
                            detail?.episodes?.firstOrNull()?.let { episode ->
                                val intent = PlayerActivity.createIntent(
                                    context = requireContext(),
                                    url = episode.url,
                                    title = detail.title,
                                    source = detail.source,
                                    id = detail.id
                                )
                                startActivity(intent)
                            }
                        }
                    )
                }
            }
        }
    }
}
