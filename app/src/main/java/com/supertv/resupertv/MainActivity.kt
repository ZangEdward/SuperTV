package com.supertv.resupertv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.ui.Modifier
import com.supertv.resupertv.data.AppInitializer
import com.supertv.resupertv.ui.AppNavigation

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 确保 Storage 配置启动即生效
        AppInitializer.initialize(applicationContext)

        setContent {
            MaterialTheme {
                // 计算窗口大小类 (Compact, Medium, Expanded)
                val windowSize = calculateWindowSizeClass(this)
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AppNavigation(windowSize.widthSizeClass)
                }
            }
        }
    }
}
