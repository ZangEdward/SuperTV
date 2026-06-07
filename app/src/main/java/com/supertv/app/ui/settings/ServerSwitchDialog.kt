package com.supertv.app.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.ServerConfig
import com.supertv.app.data.Store
import com.supertv.app.model.ApiNode
import com.supertv.app.services.SpeedTestService
import com.supertv.app.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun ServerSwitchDialog(
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val store = remember { Store.getInstance(context) }
    val speedTestService = remember { SpeedTestService() }
    val scope = rememberCoroutineScope()

    val nodes = remember { ServerConfig.getNodes(context) }
    val currentKey = remember { ServerConfig.getSelectedKey(store) }

    var latencies by remember { mutableStateOf<Map<String, Long>>(emptyMap()) }
    var testing by remember { mutableStateOf(true) }
    var selectedKey by remember { mutableStateOf(currentKey) }

    LaunchedEffect(Unit) {
        if (nodes.isEmpty()) {
            testing = false
            return@LaunchedEffect
        }
        val urlMap = nodes.associate { it.key to "${it.url}/api/v1/douban/hot" }
        val results = speedTestService.testAll(urlMap)
        latencies = results
        testing = false
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .wrapContentHeight(),
            shape = RoundedCornerShape(16.dp),
            color = BackgroundCard
        ) {
            Column(modifier = Modifier.padding(24.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "切换服务器",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = "关闭",
                            tint = TextTertiary
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))

                if (nodes.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "暂无可用服务器节点",
                            color = TextTertiary,
                            fontSize = 14.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                } else {
                    LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.heightIn(max = 400.dp)
                    ) {
                        items(nodes, key = { it.key }) { node ->
                            NodeItem(
                                node = node,
                                isSelected = node.key == selectedKey,
                                latency = latencies[node.key],
                                isTesting = testing,
                                onClick = {
                                    selectedKey = node.key
                                    val url = node.url.trimEnd('/') + "/"
                                    RetrofitClient.switchBaseUrl(url)
                                    ServerConfig.setSelectedKey(store, node.key)
                                    onDismiss()
                                }
                            )
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center
                ) {
                    if (testing) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = PrimaryGreen
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = "正在测速...",
                                fontSize = 13.sp,
                                color = TextSecondary
                            )
                        }
                    } else {
                        TextButton(onClick = {
                            scope.launch {
                                testing = true
                                val urlMap = nodes.associate { it.key to "${it.url}/api/v1/douban/hot" }
                                val results = speedTestService.testAll(urlMap)
                                latencies = results
                                testing = false
                            }
                        }) {
                            Icon(
                                Icons.Default.Wifi,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = PrimaryGreen
                            )
                            Spacer(Modifier.width(4.dp))
                            Text("重新测速", color = PrimaryGreen, fontSize = 13.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NodeItem(
    node: ApiNode,
    isSelected: Boolean,
    latency: Long?,
    isTesting: Boolean,
    onClick: () -> Unit
) {
    val bgColor = if (isSelected) PrimaryGreen.copy(alpha = 0.15f) else Color.Transparent

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = bgColor,
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isSelected) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    tint = PrimaryGreen,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(Modifier.width(8.dp))
            }

            Text(
                text = node.label,
                fontSize = 16.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                color = if (isSelected) PrimaryGreen else TextPrimary,
                modifier = Modifier.weight(1f)
            )

            if (isTesting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(14.dp),
                    strokeWidth = 2.dp,
                    color = TextTertiary
                )
            } else if (latency != null) {
                val latencyText = if (latency >= 9999) "超时" else "${latency}ms"
                val latencyColor = if (latency < 200) PrimaryGreen else if (latency < 500) StarYellow else ErrorRed
                Text(
                    text = latencyText,
                    fontSize = 13.sp,
                    color = latencyColor,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}
