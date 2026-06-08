package com.supertv.app

import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.setupWithNavController
import com.supertv.app.databinding.ActivityMainBinding
import com.supertv.app.ui.theme.SuperTVTheme

class MainActivity : AppCompatActivity() {

    private var _binding: ActivityMainBinding? = null
    private val binding get() = _binding!!
    private var lastBackPressTime = 0L

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

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
                
                // 处理双击返回退出
                onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
                    override fun handleOnBackPressed() {
                        // 如果 NavController 可以返回，则由 NavController 处理
                        if (navController.navigateUp()) {
                            return
                        }
                        
                        // 否则执行双击退出逻辑
                        val currentTime = System.currentTimeMillis()
                        if (currentTime - lastBackPressTime < 2000) {
                            finishAffinity()
                        } else {
                            lastBackPressTime = currentTime
                            Toast.makeText(this@MainActivity, "再按一次返回键退出", Toast.LENGTH_SHORT).show()
                        }
                    }
                })

                // 绑定 Compose 导航栏 (自适应手机/平板)
                binding.appBarMain.contentMain?.let { contentMain ->
                    val composeView = contentMain.bottomNavCompose
                    if (composeView != null) {
                        composeView.setContent {
                            val windowSizeClass = calculateWindowSizeClass(this@MainActivity)
                            val useSidebar = windowSizeClass.widthSizeClass != WindowWidthSizeClass.Compact

                            // 动态调整布局约束
                            SideEffect {
                                val layout = contentMain.root as androidx.constraintlayout.widget.ConstraintLayout
                                val constraintSet = androidx.constraintlayout.widget.ConstraintSet()
                                constraintSet.clone(layout)
                                
                                if (useSidebar) {
                                    // 侧边栏模式 (Tablet)
                                    constraintSet.connect(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.START, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.START)
                                    constraintSet.connect(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.TOP, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.TOP)
                                    constraintSet.connect(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.BOTTOM, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.BOTTOM)
                                    constraintSet.clear(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.END)
                                    
                                    constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.START, R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.END)
                                    constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.BOTTOM, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.BOTTOM)
                                } else {
                                    // 底部栏模式 (Mobile)
                                    constraintSet.connect(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.START, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.START)
                                    constraintSet.connect(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.END, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.END)
                                    constraintSet.connect(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.BOTTOM, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.BOTTOM)
                                    constraintSet.clear(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.TOP)
                                    
                                    constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.START, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.START)
                                    constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.BOTTOM, R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.TOP)
                                }
                                constraintSet.applyTo(layout)
                            }

                            SuperTVTheme {
                                if (useSidebar) {
                                    ComposeSideNavBar(navController)
                                } else {
                                    ComposeBottomNavBar(navController)
                                }
                            }
                        }
                    }
                }

                binding.navView?.setupWithNavController(navController)
            }

        } catch (e: Exception) {
            Log.e("SuperTV", "MainActivity: Fatal error in onCreate", e)
            Toast.makeText(this, "启动异常: " + e.message, Toast.LENGTH_LONG).show()
        }
    }

    @Composable
    private fun ComposeBottomNavBar(navController: NavController) {
        val navBackStackEntry by navController.currentBackStackEntryAsState()
        val currentDestination = navBackStackEntry?.destination

        Surface(
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 8.dp,
            modifier = Modifier.fillMaxWidth().height(80.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.navigationBars)
                    .horizontalScroll(rememberScrollState()),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val items = getNavItems()

                items.forEach { item ->
                    val isSelected = currentDestination?.id == item.id
                    
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .width(72.dp)
                            .clickable {
                                if (currentDestination?.id != item.id) {
                                    navController.navigate(item.id)
                                }
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Icon(
                                imageVector = item.icon,
                                contentDescription = stringResource(item.labelRes),
                                tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = stringResource(item.labelRes),
                                fontSize = 11.sp,
                                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }

    @Composable
    private fun ComposeSideNavBar(navController: NavController) {
        val navBackStackEntry by navController.currentBackStackEntryAsState()
        val currentDestination = navBackStackEntry?.destination

        NavigationRail(
            containerColor = MaterialTheme.colorScheme.surface,
            header = {
                Text(
                    "SuperTV",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(vertical = 16.dp)
                )
            },
            modifier = Modifier.fillMaxHeight()
        ) {
            val items = getNavItems()

            items.forEach { item ->
                val isSelected = currentDestination?.id == item.id
                NavigationRailItem(
                    icon = {
                        Icon(item.icon, contentDescription = stringResource(item.labelRes))
                    },
                    label = {
                        Text(stringResource(item.labelRes))
                    },
                    selected = isSelected,
                    onClick = {
                        if (currentDestination?.id != item.id) {
                            navController.navigate(item.id)
                        }
                    },
                    colors = NavigationRailItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.primary,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        indicatorColor = Color.Transparent
                    )
                )
            }
        }
    }

    private fun getNavItems() = listOf(
        NavigationItem(R.id.nav_transform, R.string.menu_home, Icons.Outlined.Home),
        NavigationItem(R.id.nav_movie, R.string.menu_movie, Icons.Outlined.Movie),
        NavigationItem(R.id.nav_tv, R.string.menu_tv, Icons.Outlined.Tv),
        NavigationItem(R.id.nav_anime, R.string.menu_anime, Icons.Outlined.CrueltyFree),
        NavigationItem(R.id.nav_show, R.string.menu_show, Icons.Outlined.TheaterComedy),
        NavigationItem(R.id.nav_short_drama, R.string.menu_short_drama, Icons.Outlined.VideoLibrary),
        NavigationItem(R.id.nav_live, R.string.menu_live, Icons.Outlined.LiveTv)
    )

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
