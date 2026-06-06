package com.supertv.resupertv.ui.settings

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.navigation.fragment.findNavController
import com.supertv.resupertv.databinding.FragmentSettingsBinding
import kotlinx.coroutines.launch

/**
 * 设置 Fragment - 对应原项目的 settings 页面
 *
 * 作为 Navigation 组件中的目标 Fragment
 */
class SettingsFragment : Fragment() {

    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!
    private val viewModel: SettingsViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 这里可以使用 ComposeView 或传统的 XML 视图
        // 如果使用 Compose，可以在布局中添加 ComposeView
        setupComposeView()
    }

    private fun setupComposeView() {
        binding.composeView.setContent {
            androidx.compose.material3.MaterialTheme {
                SettingsScreen(
                    viewModel = viewModel,
                    onBack = { findNavController().navigateUp() }
                )
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
