package com.supertv.app.ui.search

import android.app.UiModeManager
import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.runtime.*
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalContext
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.supertv.app.ui.player.PlayerActivity
import com.supertv.app.ui.theme.SuperTVTheme
import com.supertv.app.viewmodel.MainViewModel
import com.supertv.app.viewmodel.SearchViewModel

/**
 * 搜索 Fragment
 */
class SearchFragment : Fragment() {

    private val viewModel: SearchViewModel by viewModels()
    private val mainViewModel: MainViewModel by activityViewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return ComposeView(requireContext()).apply {
            setContent {
                val isDarkTheme by mainViewModel.isDarkTheme.collectAsState()
                
                // 监听自动跳转详情页事件
                LaunchedEffect(Unit) {
                    viewModel.navigateToDetail.collect { result ->
                        val bundle = Bundle().apply {
                            putString("id", result.id)
                            putString("source", result.source)
                            putString("title", result.title)
                            putString("cover", result.cover.ifBlank { result.poster })
                        }
                        val navOptions = androidx.navigation.navOptions {
                            anim {
                                enter = com.supertv.app.R.anim.slide_in_right
                                exit = com.supertv.app.R.anim.slide_out_left
                                popEnter = com.supertv.app.R.anim.slide_in_left
                                popExit = com.supertv.app.R.anim.slide_out_right
                            }
                        }
                        findNavController().navigate(com.supertv.app.R.id.action_nav_search_to_detail, bundle, navOptions)
                    }
                }

                SuperTVTheme(darkTheme = isDarkTheme) {
                    val context = LocalContext.current
                    val isTv = remember {
                        val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
                        uiModeManager?.currentModeType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION
                    }

                    if (isTv) {
                        TVSearchScreen(
                            viewModel = viewModel,
                            onResultClick = { result ->
                                val bundle = Bundle().apply {
                                    putString("id", result.id)
                                    putString("source", result.source)
                                    putString("title", result.title)
                                    putString("cover", result.cover.ifBlank { result.poster })
                                }
                                val navOptions = androidx.navigation.navOptions {
                                    anim {
                                        enter = com.supertv.app.R.anim.slide_in_right
                                        exit = com.supertv.app.R.anim.slide_out_left
                                        popEnter = com.supertv.app.R.anim.slide_in_left
                                        popExit = com.supertv.app.R.anim.slide_out_right
                                    }
                                }
                                findNavController().navigate(com.supertv.app.R.id.action_nav_search_to_detail, bundle, navOptions)
                            },
                            onBack = { findNavController().navigateUp() }
                        )
                    } else {
                        SearchScreen(
                            viewModel = viewModel,
                            onResultClick = { result ->
                                val sourcesJson = com.google.gson.Gson().toJson(listOf(result)) // 简单包装
                                val intent = PlayerActivity.createIntent(
                                    context = requireContext(),
                                    url = result.episodes.firstOrNull()?.url ?: "",
                                    title = result.title,
                                    episodeIndex = 0,
                                    totalEpisodes = result.episodes.size,
                                    sourcesJson = sourcesJson,
                                    source = result.source,
                                    id = result.id
                                )
                                if (result.episodes.isNotEmpty()) {
                                    startActivity(intent)
                                } else {
                                    android.widget.Toast.makeText(context, "正在检索播放源...", android.widget.Toast.LENGTH_SHORT).show()
                                }
                            },
                            onNavigateToDetail = { result ->
                                val bundle = Bundle().apply {
                                    putString("id", result.id)
                                    putString("source", result.source)
                                    putString("title", result.title)
                                    putString("cover", result.cover.ifBlank { result.poster })
                                }
                                val navOptions = androidx.navigation.navOptions {
                                    anim {
                                        enter = com.supertv.app.R.anim.slide_up
                                        exit = com.supertv.app.R.anim.slide_out_left
                                        popEnter = com.supertv.app.R.anim.slide_in_left
                                        popExit = com.supertv.app.R.anim.slide_down
                                    }
                                }
                                findNavController().navigate(com.supertv.app.R.id.action_nav_search_to_detail, bundle, navOptions)
                            },
                            onBack = { findNavController().navigateUp() }
                        )
                    }
                }
            }
        }
    }
}
