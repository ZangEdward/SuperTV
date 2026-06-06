package com.supertv.resupertv.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 可聚焦导航按钮 - 对应原项目的导航按钮
 *
 * 支持 TV 遥控器焦点导航和触摸点击
 */
@Composable
fun FocusableNavButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isSelected: Boolean = false,
    icon: @Composable (() -> Unit)? = null
) {
    var isFocused by remember { mutableStateOf(false) }
    val focusRequester = remember { FocusRequester() }

    val backgroundColor by animateColorAsState(
        targetValue = when {
            isSelected -> Color(0xFF6200EE)
            isFocused -> Color(0xFF3700B3)
            else -> Color(0xFF2A2A3E)
        },
        animationSpec = spring(),
        label = "navBtnBg"
    )

    val borderColor by animateColorAsState(
        targetValue = if (isFocused) Color(0xFFBB86FC) else Color.Transparent,
        animationSpec = spring(),
        label = "navBtnBorder"
    )

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(backgroundColor)
            .border(2.dp, borderColor, RoundedCornerShape(8.dp))
            .focusRequester(focusRequester)
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        if (icon != null) {
            icon()
            Spacer(Modifier.width(8.dp))
        }
        Text(
            text = label,
            color = if (isSelected || isFocused) Color.White else Color(0xFFBBBBBB),
            fontSize = 14.sp,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
        )
    }
}
