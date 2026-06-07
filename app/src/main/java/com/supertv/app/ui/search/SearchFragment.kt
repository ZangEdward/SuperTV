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
import com.supertv.app.ui.player.PlayerActivity
import com.supertv.app.viewmodel.SearchViewModel

/**
 * 搜索 Fragment
 *
 * 自动检测设备类型：
 * - TV �?使用 TVSearchScreen（三栏键盘布局�?
 * - 手机/平板 �?使用 SearchScreen（标准搜索栏�?
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
                androidx.compose.material3.MaterialTheme {
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
                                    requireContext(),
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
                                    requireContext(),
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
