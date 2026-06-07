package com.supertv.app

import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.setupWithNavController
import com.supertv.app.databinding.ActivityMainBinding
import com.supertv.app.ui.theme.PrimaryGreen
import com.supertv.app.ui.theme.TextSecondary

class MainActivity : AppCompatActivity() {

    private var _binding: ActivityMainBinding? = null
    private val binding get() = _binding!!
    private var lastBackPressTime = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            // 设置主题
            setTheme(R.style.Theme_App_NoActionBar)
            
            _binding = ActivityMainBinding.inflate(layoutInflater)
            setContentView(binding.root)

            setSupportActionBar(binding.appBarMain.toolbar)
            supportActionBar?.hide() // 隐藏默认 Action Bar，使用 Compose 自定义 Header

            // 获取 NavHost
            val navHostFragment = supportFragmentManager
                .findFragmentById(R.id.nav_host_fragment_content_main) as? NavHostFragment
            
            navHostFragment?.let { navHost ->
                val navController = navHost.navController
                
                // 绑定 Compose 底部导航
                binding.appBarMain.contentMain?.bottomNavCompose?.apply {
                    setContent {
                        MaterialTheme {
                            ComposeBottomNavBar(navController)
                        }
                    }
                }

                binding.navView?.setupWithNavController(navController)
            }

            // 处理双击返回退出
            onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    val currentTime = System.currentTimeMillis()
                    if (currentTime - lastBackPressTime < 2000) {
                        finishAffinity()
                    } else {
                        lastBackPressTime = currentTime
                        Toast.makeText(this@MainActivity, "再按一次返回键退出", Toast.LENGTH_SHORT).show()
                    }
                }
            })

        } catch (e: Exception) {
            Log.e("SuperTV", "MainActivity: Fatal error in onCreate", e)
            Toast.makeText(this, "启动异常: " + e.message, Toast.LENGTH_LONG).show()
        }
    }

    @Composable
    private fun ComposeBottomNavBar(navController: NavController) {
        val navBackStackEntry by navController.currentBackStackEntryAsState()
        val currentDestination = navBackStackEntry?.destination

        NavigationBar(
            containerColor = Color(0xFF121212),
            tonalElevation = 8.dp,
            modifier = Modifier.height(72.dp)
        ) {
            val items = listOf(
                NavigationItem(R.id.nav_transform, R.string.menu_home, Icons.Outlined.Home),
                NavigationItem(R.id.nav_movie, R.string.menu_movie, Icons.Outlined.Movie),
                NavigationItem(R.id.nav_tv, R.string.menu_tv, Icons.Outlined.Tv),
                NavigationItem(R.id.nav_anime, R.string.menu_anime, Icons.Outlined.CrueltyFree),
                NavigationItem(R.id.nav_show, R.string.menu_show, Icons.Outlined.TheaterComedy),
                NavigationItem(R.id.nav_live, R.string.menu_live, Icons.Outlined.LiveTv)
            )

            items.forEach { item ->
                val isSelected = currentDestination?.id == item.id
                NavigationBarItem(
                    icon = {
                        Icon(
                            imageVector = item.icon,
                            contentDescription = stringResource(item.labelRes),
                            tint = if (isSelected) PrimaryGreen else TextSecondary
                        )
                    },
                    label = {
                        Text(
                            text = stringResource(item.labelRes),
                            fontSize = 12.sp,
                            color = if (isSelected) PrimaryGreen else TextSecondary
                        )
                    },
                    selected = isSelected,
                    onClick = {
                        if (currentDestination?.id != item.id) {
                            navController.navigate(item.id)
                        }
                    },
                    colors = NavigationBarItemDefaults.colors(
                        indicatorColor = Color.Transparent
                    )
                )
            }
        }
    }

    private data class NavigationItem(
        val id: Int,
        val labelRes: Int,
        val icon: ImageVector
    )

    override fun onSupportNavigateUp(): Boolean {
        val navHostFragment = supportFragmentManager
            .findFragmentById(R.id.nav_host_fragment_content_main) as? NavHostFragment
        return navHostFragment?.navController?.navigateUp() ?: super.onSupportNavigateUp()
    }

    override fun onDestroy() {
        super.onDestroy()
        _binding = null
    }
}
