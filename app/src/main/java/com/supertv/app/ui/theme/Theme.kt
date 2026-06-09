package com.supertv.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// 主色调 - 原始项目的绿色
val PrimaryGreen = Color(0xFF00BB5E)
val PrimaryGreenDark = Color(0xFF00994D)
val PrimaryGreenLight = Color(0xFF33CC7E)

// 背景色 - 纯黑/深灰风格
val BackgroundDark = Color(0xFF000000)
val BackgroundCard = Color(0xFF121212)
val BackgroundSurface = Color(0xFF1E1E1E)
val BackgroundNav = Color(0xFF121212)

// 功能色
val AccentGreen = Color(0xFF00BB5E)
val ErrorRed = Color(0xFFF44336)
val FavoriteRed = Color(0xFFE53935)
val CacheGreen = Color(0xFF1B5E20)
val StarYellow = Color(0xFFFFC107)

private val DarkColorScheme = darkColorScheme(
    primary = PrimaryGreen,
    onPrimary = Color.Black,
    primaryContainer = PrimaryGreenDark,
    onPrimaryContainer = Color.White,
    secondary = PrimaryGreenLight,
    onSecondary = Color.Black,
    background = BackgroundDark,
    onBackground = Color.White,
    surface = BackgroundSurface,
    onSurface = Color.White,
    surfaceVariant = BackgroundCard,
    onSurfaceVariant = Color(0xFFAAAAAA),
    error = ErrorRed,
    onError = Color.White
)

private val LightColorScheme = lightColorScheme(
    primary = PrimaryGreen,
    onPrimary = Color.White,
    primaryContainer = PrimaryGreenLight,
    onPrimaryContainer = Color.Black,
    secondary = PrimaryGreenDark,
    onSecondary = Color.White,
    background = Color.White,
    onBackground = Color.Black,
    surface = Color(0xFFF5F5F5),
    onSurface = Color.Black,
    surfaceVariant = Color(0xFFEEEEEE),
    onSurfaceVariant = Color.DarkGray,
    error = ErrorRed,
    onError = Color.White
)

@Composable
fun SuperTVTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
