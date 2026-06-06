package com.supertv.resupertv.ui.search

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.supertv.resupertv.ui.player.PlayerActivity
import com.supertv.resupertv.viewmodel.SearchViewModel

/**
 * 搜索 Fragment
 *
 * 使用 Compose 的搜索页面
 */
class SearchFragment : Fragment() {

    private val viewModel: SearchViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return androidx.compose.ui.platform.ComposeView(requireContext()).apply {
            setContent {
                androidx.compose.material3.MaterialTheme {
                    SearchScreen(
                        viewModel = viewModel,
                        onResultClick = { result ->
                            // 点击搜索结果 -> 跳转到播放页
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
