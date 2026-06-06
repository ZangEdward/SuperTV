package com.supertv.resupertv.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import com.supertv.resupertv.data.SearchPreferenceStore
import androidx.compose.ui.platform.LocalContext

@Composable
fun SettingsScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var isExactMode by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        isExactMode = SearchPreferenceStore.isExactMode(context)
    }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        item {
            Text("全局设置", style = MaterialTheme.typography.headlineMedium)
            Spacer(modifier = Modifier.height(16.dp))
        }

        item {
            ListItem(
                headlineContent = { Text("搜索精准模式") },
                supportingContent = { Text("开启后仅展示库内匹配结果") },
                trailingContent = {
                    Switch(
                        checked = isExactMode,
                        onCheckedChange = {
                            isExactMode = it
                            scope.launch { SearchPreferenceStore.setExactMode(context, it) }
                        }
                    )
                }
            )
        }
        
        item {
            Divider()
            ListItem(
                headlineContent = { Text("版本信息"), },
                supportingContent = { Text("v5.5.36.523 (原生重构版)") }
            )
        }
    }
}
