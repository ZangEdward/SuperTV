package com.supertv.app

import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.navOptions
import com.supertv.app.data.AuthRepository
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.SyncService
import com.supertv.app.databinding.ActivityMainBinding
import com.supertv.app.ui.components.GlobalHeader
import com.supertv.app.ui.components.HeaderNavItem
import com.supertv.app.ui.components.LoginDialog
import com.supertv.app.ui.components.UserMenu
import com.supertv.app.ui.theme.SuperTVTheme
import com.supertv.app.viewmodel.MainViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private var _binding: ActivityMainBinding? = null
    private val binding get() = _binding!!
    private var lastBackPressTime: Long = 0

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        enableEdgeToEdge()

        try {
            RetrofitClient.init(this)
            setTheme(R.style.Theme_App_NoActionBar)
            
            _binding = ActivityMainBinding.inflate(layoutInflater)
            setContentView(binding.root)

            val navHostFragment = supportFragmentManager
                .findFragmentById(R.id.nav_host_fragment_content_main) as? NavHostFragment
            
            navHostFragment?.let { navHost ->
                val navController = navHost.navController
                
                onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
                    override fun handleOnBackPressed() {
                        if (navController.navigateUp()) return
                        
                        val currentTime = System.currentTimeMillis()
                        if (currentTime - lastBackPressTime < 2000) {
                            finishAffinity()
                        } else {
                            lastBackPressTime = currentTime
                            Toast.makeText(this@MainActivity, "再按一次返回键退出", Toast.LENGTH_SHORT).show()
                        }
                    }
                })

                // 绑定 全局 Header
                binding.appBarMain.contentMain.globalHeaderCompose?.setContent {
                    val viewModel: MainViewModel = viewModel()
                    val actualIsDark by viewModel.isDarkTheme.collectAsState()
                    var uiIsDark by remember { mutableStateOf(actualIsDark) }
                    
                    LaunchedEffect(actualIsDark) {
                        if (uiIsDark != actualIsDark) {
                            kotlinx.coroutines.delay(450)
                            uiIsDark = actualIsDark
                        }
                    }

                    val windowSizeClass = calculateWindowSizeClass(this@MainActivity)
                    val isTablet = windowSizeClass.widthSizeClass != WindowWidthSizeClass.Compact

                    val authRepo = remember { AuthRepository.getInstance(this@MainActivity) }
                    var isLoggedIn by remember { mutableStateOf(authRepo.isLoggedIn()) }
                    var showUserMenu by remember { mutableStateOf(false) }
                    var showLoginDialog by remember { mutableStateOf(false) }

                    val mainDestinations = remember {
                        setOf(
                            R.id.nav_transform, R.id.nav_movie, R.id.nav_tv,
                            R.id.nav_anime, R.id.nav_show, R.id.nav_short_drama, R.id.nav_live
                        )
                    }

                    var currentDestId by remember { mutableStateOf<Int?>(null) }
                    var showHeader by remember { mutableStateOf(true) }
                    
                    DisposableEffect(navController) {
                        val listener = NavController.OnDestinationChangedListener { _, destination, _ ->
                            showHeader = destination.id in mainDestinations || destination.id == R.id.nav_search
                            currentDestId = destination.id
                        }
                        navController.addOnDestinationChangedListener(listener)
                        onDispose { navController.removeOnDestinationChangedListener(listener) }
                    }

                    SuperTVTheme(darkTheme = uiIsDark) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(MaterialTheme.colorScheme.background)
                                .statusBarsPadding()
                        ) {
                            if (showHeader) {
                                val navItems = if (isTablet) {
                                    listOf(
                                        HeaderNavItem(R.id.nav_transform, R.string.menu_home, Icons.Outlined.Home),
                                        HeaderNavItem(R.id.nav_movie, R.string.menu_movie, Icons.Outlined.Movie),
                                        HeaderNavItem(R.id.nav_tv, R.string.menu_tv, Icons.Outlined.Tv),
                                        HeaderNavItem(R.id.nav_anime, R.string.menu_anime, Icons.Outlined.Animation),
                                        HeaderNavItem(R.id.nav_show, R.string.menu_show, Icons.Outlined.TheaterComedy),
                                        HeaderNavItem(R.id.nav_short_drama, R.string.menu_short_drama, Icons.Outlined.VideoLibrary),
                                        HeaderNavItem(R.id.nav_live, R.string.menu_live, Icons.Outlined.LiveTv)
                                    )
                                } else emptyList()

                                GlobalHeader(
                                    onUserClick = { if (isLoggedIn) showUserMenu = true else showLoginDialog = true },
                                    onSearchClick = { 
                                        if (currentDestId != R.id.nav_search) {
                                            navController.navigate(R.id.nav_search, null, navOptions {
                                                anim {
                                                    enter = R.anim.slide_in_top
                                                    exit = android.R.anim.fade_out
                                                    popEnter = android.R.anim.fade_in
                                                    popExit = R.anim.slide_out_top
                                                }
                                            })
                                        }
                                    },
                                    onDownloadClick = { 
                                        navController.navigate(R.id.nav_slideshow, null, navOptions {
                                            anim {
                                                enter = R.anim.slide_in_top
                                                exit = android.R.anim.fade_out
                                                popEnter = android.R.anim.fade_in
                                                popExit = R.anim.slide_out_top
                                            }
                                        })
                                    },
                                    onThemeToggle = { viewModel.toggleTheme() },
                                    isDarkTheme = uiIsDark,
                                    navItems = navItems,
                                    currentDestId = currentDestId,
                                    onNavItemClick = { id ->
                                        if (id != currentDestId) {
                                            navController.navigate(id) {
                                                popUpTo(navController.graph.startDestinationId) { saveState = false }
                                                launchSingleTop = true
                                                restoreState = false
                                            }
                                        }
                                    }
                                )
                            }
                        }

                        if (showUserMenu) {
                            UserMenu(
                                onClose = { showUserMenu = false },
                                onLogout = { isLoggedIn = false; showLoginDialog = true },
                                onNavigateToDetail = { id, source, title ->
                                    val bundle = Bundle().apply {
                                        putString("id", id); putString("source", source); putString("title", title)
                                    }
                                    navController.navigate(R.id.nav_detail, bundle, navOptions {
                                        anim {
                                            enter = R.anim.slide_up
                                            exit = android.R.anim.fade_out
                                            popEnter = android.R.anim.fade_in
                                            popExit = R.anim.slide_down
                                        }
                                    })
                                },
                                onNavigateToDownloads = {
                                    navController.navigate(R.id.nav_slideshow, null, navOptions {
                                        anim {
                                            enter = R.anim.slide_in_top
                                            exit = android.R.anim.fade_out
                                            popEnter = android.R.anim.fade_in
                                            popExit = R.anim.slide_out_top
                                        }
                                    })
                                }
                            )
                        }

                        if (showLoginDialog) {
                            LoginDialog(
                                onLoginSuccess = {
                                    isLoggedIn = true; showLoginDialog = false
                                    val syncService = SyncService.getInstance(this@MainActivity)
                                    CoroutineScope(Dispatchers.IO).launch { syncService.syncAll() }
                                },
                                onDismiss = { showLoginDialog = false }
                            )
                        }
                    }
                }

                // 绑定 Compose 导航栏 (仅手机模式)
                binding.appBarMain.contentMain.bottomNavCompose?.setContent {
                    val viewModel: MainViewModel = viewModel()
                    val actualIsDark by viewModel.isDarkTheme.collectAsState()
                    var uiIsDark by remember { mutableStateOf(actualIsDark) }
                    
                    LaunchedEffect(actualIsDark) {
                        if (uiIsDark != actualIsDark) {
                            kotlinx.coroutines.delay(450)
                            uiIsDark = actualIsDark
                        }
                    }

                    val windowSizeClass = calculateWindowSizeClass(this@MainActivity)
                    val isTablet = windowSizeClass.widthSizeClass != WindowWidthSizeClass.Compact
                    
                    if (!isTablet) {
                        SuperTVTheme(darkTheme = uiIsDark) {
                            ComposeBottomNavBar(navController)
                        }
                        binding.appBarMain.contentMain.bottomNavCompose?.visibility = View.VISIBLE
                        
                        // 恢复约束
                        val constraintSet = androidx.constraintlayout.widget.ConstraintSet()
                        constraintSet.clone(binding.appBarMain.contentMain.root)
                        constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.BOTTOM, R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.TOP)
                        constraintSet.applyTo(binding.appBarMain.contentMain.root)
                    } else {
                        binding.appBarMain.contentMain.bottomNavCompose?.visibility = View.GONE
                        
                        // 平板模式下，让内容区铺满底部
                        val constraintSet = androidx.constraintlayout.widget.ConstraintSet()
                        constraintSet.clone(binding.appBarMain.contentMain.root)
                        constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.BOTTOM, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.BOTTOM)
                        constraintSet.applyTo(binding.appBarMain.contentMain.root)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("SuperTV", "MainActivity: Fatal error in onCreate", e)
            Toast.makeText(this, "启动异常: " + e.message, Toast.LENGTH_LONG).show()
        }
    }

    @Composable
    fun ComposeBottomNavBar(navController: NavController) {
        val navItems = getNavItems()
        var currentRoute by remember { mutableStateOf<Int?>(null) }
        
        DisposableEffect(navController) {
            val listener = NavController.OnDestinationChangedListener { _, destination, _ ->
                currentRoute = destination.id
            }
            navController.addOnDestinationChangedListener(listener)
            onDispose { navController.removeOnDestinationChangedListener(listener) }
        }

        NavigationBar(
            containerColor = MaterialTheme.colorScheme.surface,
            tonalElevation = 8.dp,
            modifier = Modifier.navigationBarsPadding()
        ) {
            navItems.forEach { item ->
                val isSelected = currentRoute == item.id
                NavigationBarItem(
                    icon = { Icon(item.icon, contentDescription = getString(item.labelRes)) },
                    label = { Text(getString(item.labelRes)) },
                    selected = isSelected,
                    onClick = {
                        if (currentRoute != item.id) {
                            navController.navigate(item.id) {
                                popUpTo(navController.graph.startDestinationId) { saveState = false }
                                launchSingleTop = true
                                restoreState = false
                            }
                        }
                    },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Color.White,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        indicatorColor = MaterialTheme.colorScheme.primary
                    )
                )
            }
        }
    }

    private fun getNavItems(): List<NavigationItem> {
        return listOf(
            NavigationItem(R.id.nav_transform, R.string.menu_home, Icons.Outlined.Home),
            NavigationItem(R.id.nav_movie, R.string.menu_movie, Icons.Outlined.Movie),
            NavigationItem(R.id.nav_tv, R.string.menu_tv, Icons.Outlined.Tv),
            NavigationItem(R.id.nav_anime, R.string.menu_anime, Icons.Outlined.Animation),
            NavigationItem(R.id.nav_show, R.string.menu_show, Icons.Outlined.TheaterComedy),
            NavigationItem(R.id.nav_short_drama, R.string.menu_short_drama, Icons.Outlined.VideoLibrary),
            NavigationItem(R.id.nav_live, R.string.menu_live, Icons.Outlined.LiveTv)
        )
    }

    data class NavigationItem(val id: Int, val labelRes: Int, val icon: ImageVector)

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
