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
import com.supertv.app.viewmodel.MainViewModel
import androidx.fragment.app.activityViewModels

/**
 * 视频详情 Fragment
 */
class DetailFragment : Fragment() {

    private val viewModel: SearchViewModel by viewModels()
    private val mainViewModel: MainViewModel by activityViewModels()

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
            viewModel.loadDetail(id, source, title)
        }

        return ComposeView(requireContext()).apply {
            setContent {
                val isDarkTheme by mainViewModel.isDarkTheme.collectAsState()
                SuperTVTheme(darkTheme = isDarkTheme) {
                    val detail by viewModel.detail.collectAsState()
                    val isLoading by viewModel.isLoadingDetail.collectAsState()
                    val allSources by viewModel.allSources.collectAsState()
                    val latencies by viewModel.latencies.collectAsState()
                    val isAllSourcesLoading by viewModel.allSourcesLoading.collectAsState()
                    
                    DetailScreen(
                        detail = detail,
                        isLoading = isLoading,
                        isFavorite = false,
                        cachedEpisodes = emptySet(),
                        allSources = allSources,
                        currentSource = detail?.source ?: source,
                        latencies = latencies,
                        isAllSourcesLoading = isAllSourcesLoading,
                        onEpisodeClick = { episode ->
                            val currentDetail = detail
                            val intent = PlayerActivity.createIntent(
                                context = requireContext(),
                                url = episode.url,
                                title = currentDetail?.title ?: title,
                                source = currentDetail?.source ?: source,
                                id = currentDetail?.id ?: id
                            )
                            startActivity(intent)
                        },
                        onToggleFavorite = { /* TODO */ },
                        onBack = { findNavController().navigateUp() },
                        onPlayAll = {
                            val currentDetail = detail
                            currentDetail?.episodes?.firstOrNull()?.let { episode ->
                                val intent = PlayerActivity.createIntent(
                                    context = requireContext(),
                                    url = episode.url,
                                    title = currentDetail.title,
                                    source = currentDetail.source,
                                    id = currentDetail.id
                                )
                                startActivity(intent)
                            }
                        },
                        onSourceSelect = { result ->
                             viewModel.switchSource(result)
                        }
                    )
                }
            }
        }
    }
}
