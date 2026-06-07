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
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.supertv.app.ui.theme.SuperTVTheme
import com.supertv.app.ui.player.PlayerActivity
import com.supertv.app.viewmodel.SearchViewModel

/**
 * 搜索 Fragment
 */
class SearchFragment : Fragment() {

    private val viewModel: SearchViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return ComposeView(requireContext()).apply {
            setContent {
                SuperTVTheme {
                    val context = LocalContext.current
                    val isTv = remember {
                        val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
                        uiModeManager?.currentModeType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION
                    }

                    if (isTv) {
                        TVSearchScreen(
                            viewModel = viewModel,
                            onResultClick = { result ->
                                val intent = PlayerActivity.createIntent(
                                    context = requireContext(),
                                    url = "",
                                    title = result.title,
                                    source = result.source,
                                    id = result.id
                                )
                                startActivity(intent)
                            },
                            onBack = { findNavController().navigateUp() }
                        )
                    } else {
                        SearchScreen(
                            viewModel = viewModel,
                            onResultClick = { result ->
                                val intent = PlayerActivity.createIntent(
                                    context = requireContext(),
                                    url = "",
                                    title = result.title,
                                    source = result.source,
                                    id = result.id
                                )
                                startActivity(intent)
                            },
                            onBack = { findNavController().navigateUp() }
                        )
                    }
                }
            }
        }
    }
}
