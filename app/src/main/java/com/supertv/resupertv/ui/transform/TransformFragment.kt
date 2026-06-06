package com.supertv.resupertv.ui.transform

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController

/**
 * 首页/推荐 Fragment - 对应原项目的首页
 *
 * 展示热门推荐、豆瓣排行等内容
 */
class TransformFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return ComposeView(requireContext()).apply {
            setContent {
                TransformScreen(
                    onSearchClick = {
                        findNavController().navigate(
                            com.supertv.resupertv.R.id.action_nav_transform_to_search
                        )
                    }
                )
            }
        }
    }
}

@Composable
fun TransformScreen(
    onSearchClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            "SuperTV",
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "欢迎使用",
            fontSize = 16.sp,
            color = Color.Gray
        )
        Spacer(Modifier.height(24.dp))

        Button(
            onClick = onSearchClick,
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6200EE))
        ) {
            Text("开始搜索", color = Color.White)
        }
    }
}
