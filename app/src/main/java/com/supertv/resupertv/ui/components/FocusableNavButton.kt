package com.supertv.resupertv.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged

@Composable
fun FocusableNavButton(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    // 使用原生缩放动画，当遥控器焦点进入时放大到 1.1 倍
    val scale by animateFloatAsState(if (isFocused) 1.1f else 1.0f)

    Box(
        modifier = modifier
            .scale(scale)
            .focusable()
            .onFocusChanged { isFocused = it.isFocused }
    ) {
        content()
    }
}
