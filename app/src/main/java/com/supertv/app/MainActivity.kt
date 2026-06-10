package com.supertv.app

import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavOptions
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.navOptions
import androidx.navigation.ui.setupWithNavController
import com.supertv.app.databinding.ActivityMainBinding
import com.supertv.app.ui.theme.*
import androidx.compose.ui.draw.clip

import com.supertv.app.viewmodel.MainViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import com.supertv.app.ui.components.GlobalHeader
import com.supertv.app.ui.components.UserMenu
import com.supertv.app.ui.components.LoginDialog
import com.supertv.app.data.ApiNodeService
import com.supertv.app.data.Store
import com.supertv.app.data.AuthRepository
import com.supertv.app.data.RetrofitClient
import com.supertv.app.data.SyncService
import kotlinx.coroutines.launch
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers

class MainActivity : AppCompatActivity() {

    private var _binding: ActivityMainBinding? = null
    private val binding get() = _binding!!
    private var lastBackPressTime = 0L

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 启用沉浸式布局，但确保系统栏可见
        enableEdgeToEdge(
            statusBarStyle = androidx.activity.SystemBarStyle.auto(
                android.graphics.Color.TRANSPARENT, 
                android.graphics.Color.TRANSPARENT
            )
        )

        try {
            // 初始化全局 API 节点 (从 Store 读取并应用到 RetrofitClient)
            RetrofitClient.init(this)

            // 设置主题
            setTheme(R.style.Theme_App_NoActionBar)
            
            _binding = ActivityMainBinding.inflate(layoutInflater)
            setContentView(binding.root)

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

                // 绑定 全局 Header
                binding.appBarMain.contentMain?.globalHeaderCompose?.setContent {
                    val viewModel: MainViewModel = viewModel()
                    val actualIsDark by viewModel.isDarkTheme.collectAsState()
                    
                    // 维持一个用于 UI 渲染的主题状态，在蒙版覆盖后再更新
                    var uiIsDark by remember { mutableStateOf(actualIsDark) }
                    
                    LaunchedEffect(actualIsDark) {
                        if (uiIsDark != actualIsDark) {
                            kotlinx.coroutines.delay(450) // 等待蒙版覆盖到一半以上时切换
                            uiIsDark = actualIsDark
                        }
                    }

                    val authRepo = remember { AuthRepository.getInstance(this@MainActivity) }
                    var isLoggedIn by remember { mutableStateOf(authRepo.isLoggedIn()) }
                    var showUserMenu by remember { mutableStateOf(false) }
                    var showLoginDialog by remember { mutableStateOf(false) }

                    // 监听 401 错误
                    LaunchedEffect(Unit) {
                        RetrofitClient.setUnauthorizedListener {
                            authRepo.clearCredentials()
                            isLoggedIn = false
                            showLoginDialog = true
                        }
                    }

                    val mainDestinations = remember {
                        setOf(R.id.nav_transform) // 仅首页显示搜索顶栏，其他页面“空出来”留给子分类
                    }

                    // 使用更稳定的方式监听目的地变化，减少重组造成的闪烁
                    var showHeader by remember { mutableStateOf(true) }
                    
                    DisposableEffect(navController) {
                        val listener = NavController.OnDestinationChangedListener { _, destination, _ ->
                            showHeader = destination.id in mainDestinations
                        }
                        navController.addOnDestinationChangedListener(listener)
                        onDispose {
                            navController.removeOnDestinationChangedListener(listener)
                        }
                    }

                    SuperTVTheme(darkTheme = uiIsDark) {
                        // 强制显示系统状态栏并设置图标颜色
                        val view = androidx.compose.ui.platform.LocalView.current
                        if (!view.isInEditMode) {
                            SideEffect {
                                val window = (view.context as android.app.Activity).window
                                val insetsController = androidx.core.view.WindowCompat.getInsetsController(window, view)
                                // 确保状态栏显示 (避免被全屏主题残留影响)
                                insetsController.show(androidx.core.view.WindowInsetsCompat.Type.statusBars())
                                insetsController.isAppearanceLightStatusBars = !uiIsDark
                            }
                        }

                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .statusBarsPadding(), // 留下和背景相同颜色的空白占位
                            color = MaterialTheme.colorScheme.background
                        ) {
                            // 使用 Crossfade 或简单的 if 判断，配合 showHeader 逻辑
                            if (showHeader) {
                                GlobalHeader(
                                    onUserClick = { 
                                        if (isLoggedIn) showUserMenu = true else showLoginDialog = true 
                                    },
                                    onSearchClick = { 
                                        val searchNavOptions = navOptions {
                                            anim {
                                                enter = R.anim.slide_in_top
                                                exit = android.R.anim.fade_out
                                                popEnter = android.R.anim.fade_in
                                                popExit = R.anim.slide_out_top
                                            }
                                        }
                                        navController.navigate(R.id.nav_search, null, searchNavOptions)
                                    },
                                    onDownloadClick = { 
                                        val slideshowNavOptions = navOptions {
                                            anim {
                                                enter = R.anim.slide_in_top
                                                exit = android.R.anim.fade_out
                                                popEnter = android.R.anim.fade_in
                                                popExit = R.anim.slide_out_top
                                            }
                                        }
                                        navController.navigate(R.id.nav_slideshow, null, slideshowNavOptions)
                                    },
                                    onThemeToggle = { viewModel.toggleTheme() },
                                    isDarkTheme = uiIsDark
                                )
                            }
                        }
                        
                        // ... 后续 UserMenu/LoginDialog 也会自动使用 uiIsDark
                        if (showUserMenu) {
                            UserMenu(
                                onClose = { showUserMenu = false },
                                onLogout = {
                                    isLoggedIn = false
                                    showLoginDialog = true
                                },
                                onNavigateToDetail = { id, source, title ->
                                    val bundle = Bundle().apply {
                                        putString("id", id)
                                        putString("source", source)
                                        putString("title", title)
                                    }
                                    val detailNavOptions = navOptions {
                                        anim {
                                            enter = R.anim.slide_up
                                            exit = android.R.anim.fade_out
                                            popEnter = android.R.anim.fade_in
                                            popExit = R.anim.slide_down
                                        }
                                    }
                                    navController.navigate(R.id.nav_detail, bundle, detailNavOptions)
                                },
                                onNavigateToDownloads = {
                                    val downloadsNavOptions = navOptions {
                                        anim {
                                            enter = R.anim.slide_in_top
                                            exit = android.R.anim.fade_out
                                            popEnter = android.R.anim.fade_in
                                            popExit = R.anim.slide_out_top
                                        }
                                    }
                                    navController.navigate(R.id.nav_slideshow, null, downloadsNavOptions)
                                }
                            )
                        }

                        if (showLoginDialog) {
                            LoginDialog(
                                onLoginSuccess = {
                                    isLoggedIn = true
                                    showLoginDialog = false
                                    val syncService = SyncService.getInstance(this@MainActivity)
                                    CoroutineScope(Dispatchers.IO).launch {
                                        syncService.syncAll()
                                    }
                                },
                                onDismiss = { showLoginDialog = false }
                            )
                        }
                    }
                }

                // 绑定 Compose 导航栏 (自适应手机/平板)
                binding.appBarMain.contentMain?.bottomNavCompose?.setContent {
                    val viewModel: MainViewModel = viewModel()
                    val actualIsDark by viewModel.isDarkTheme.collectAsState()
                    var uiIsDark by remember { mutableStateOf(actualIsDark) }
                    
                    LaunchedEffect(actualIsDark) {
                        if (uiIsDark != actualIsDark) {
                            kotlinx.coroutines.delay(450) // 等待蒙版覆盖
                            uiIsDark = actualIsDark
                        }
                    }

                    val windowSizeClass = calculateWindowSizeClass(this@MainActivity)
                    val useSidebar = windowSizeClass.widthSizeClass != WindowWidthSizeClass.Compact
                    
                    // 动态调整布局约束 - 增加稳定判断，避免每次重组都重置布局导致闪烁
                    var lastUseSidebar by remember { mutableStateOf<Boolean?>(null) }
                    
                    if (lastUseSidebar != useSidebar) {
                        SideEffect {
                            val layout = binding.appBarMain.contentMain.root
                            val constraintSet = androidx.constraintlayout.widget.ConstraintSet()
                            constraintSet.clone(layout)
                            
                            if (useSidebar) {
                                // 侧边栏模式 (Tablet / Landscape)
                                constraintSet.connect(R.id.global_header_compose, androidx.constraintlayout.widget.ConstraintSet.TOP, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.TOP)
                                constraintSet.connect(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.START, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.START)
                                constraintSet.connect(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.TOP, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.TOP)
                                constraintSet.connect(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.BOTTOM, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.BOTTOM)
                                constraintSet.clear(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.END)
                                
                                // 确保 NavHost 铺满剩余空间
                                constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.START, R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.END)
                                constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.END, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.END)
                                constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.BOTTOM, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.BOTTOM)
                                constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.TOP, R.id.global_header_compose, androidx.constraintlayout.widget.ConstraintSet.BOTTOM)
                                
                                // 更新宽度
                                constraintSet.constrainWidth(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.WRAP_CONTENT)
                                constraintSet.constrainHeight(R.id.bottom_nav_compose, 0) // MATCH_CONSTRAINT
                            } else {
                                // 底部栏模式 (Mobile / Portrait)
                                constraintSet.connect(R.id.global_header_compose, androidx.constraintlayout.widget.ConstraintSet.TOP, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.TOP)
                                constraintSet.connect(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.START, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.START)
                                constraintSet.connect(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.END, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.END)
                                constraintSet.connect(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.BOTTOM, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.BOTTOM)
                                constraintSet.clear(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.TOP)
                                
                                constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.START, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.START)
                                constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.END, androidx.constraintlayout.widget.ConstraintSet.PARENT_ID, androidx.constraintlayout.widget.ConstraintSet.END)
                                constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.TOP, R.id.global_header_compose, androidx.constraintlayout.widget.ConstraintSet.BOTTOM)
                                constraintSet.connect(R.id.nav_host_fragment_content_main, androidx.constraintlayout.widget.ConstraintSet.BOTTOM, R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.TOP)
                                
                                // 更新尺寸
                                constraintSet.constrainWidth(R.id.bottom_nav_compose, 0) // MATCH_CONSTRAINT
                                constraintSet.constrainHeight(R.id.bottom_nav_compose, androidx.constraintlayout.widget.ConstraintSet.WRAP_CONTENT)
                            }
                            constraintSet.applyTo(layout)
                            lastUseSidebar = useSidebar
                        }
                    }

                    SuperTVTheme(darkTheme = uiIsDark) {
                        Surface(color = MaterialTheme.colorScheme.surface) {
                            if (useSidebar) {
                                ComposeSideNavBar(navController)
                            } else {
                                ComposeBottomNavBar(navController)
                            }
                        }
                    }
                }

                // 统一配置全局左右滑动动画 (类似 ViewPager2)
                navController.addOnDestinationChangedListener { _, destination, _ ->
                    // 可以根据 destination 进行一些逻辑处理
                }

                binding.navView?.setupWithNavController(navController)

                // 绑定明暗切换动画 (对齐 LunaTV-Enhanced 逻辑)
                binding.appBarMain.contentMain?.themeTransitionCompose?.setContent {
                    val viewModel: MainViewModel = viewModel()
                    val isDarkTheme by viewModel.isDarkTheme.collectAsState()
                    
                    var lastThemeState by remember { mutableStateOf(isDarkTheme) }
                    var showOverlay by remember { mutableStateOf(false) }
                    var directionFromTop by remember { mutableStateOf(true) }
                    var overlayColor by remember { mutableStateOf(Color.Black) }

                    LaunchedEffect(isDarkTheme) {
                        if (lastThemeState != isDarkTheme) {
                            // 捕捉切换方向和颜色
                            directionFromTop = isDarkTheme // 深色从上往下，浅色从下往上
                            overlayColor = if (isDarkTheme) Color.Black else Color.White
                            
                            showOverlay = true
                            kotlinx.coroutines.delay(700) // 等待滑入覆盖
                            lastThemeState = isDarkTheme
                            showOverlay = false
                        }
                    }

                    Box(modifier = Modifier.fillMaxSize()) {
                        androidx.compose.animation.AnimatedVisibility(
                            visible = showOverlay,
                            enter = androidx.compose.animation.slideInVertically(
                                initialOffsetY = { if (directionFromTop) -it else it },
                                animationSpec = androidx.compose.animation.core.tween(500, easing = androidx.compose.animation.core.LinearEasing)
                            ),
                            exit = androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(300))
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(overlayColor)
                            )
                        }
                    }
                }
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
        val items = remember { getNavItems() }
        
        // 记录上一次选中的索引，用于判断方向
        var lastSelectedIndex by remember { 
            mutableIntStateOf(items.indexOfFirst { it.id == currentDestination?.id }.coerceAtLeast(0)) 
        }

        // 监听目的地变化，更新当前索引
        LaunchedEffect(currentDestination?.id) {
            val idx = items.indexOfFirst { it.id == currentDestination?.id }
            if (idx != -1) {
                lastSelectedIndex = idx
            }
        }

        Surface(
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.98f),
            tonalElevation = 8.dp,
            shape = androidx.compose.ui.graphics.RectangleShape,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.navigationBars)
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Start
            ) {
                items.forEachIndexed { index, item ->
                    val isSelected = currentDestination?.id == item.id
                    
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .width(62.dp)
                            .padding(vertical = 2.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .clickable {
                                if (currentDestination?.id == item.id) {
                                    // 如果已经在当前标签页，且不在根页面（比如在详情页），则回到根页面
                                    navController.popBackStack(item.id, false)
                                    return@clickable
                                }

                                // 判断是否从详情页、搜索页、缓存页切出
                                val isFromIndependentPage = currentDestination?.id == R.id.nav_detail || 
                                                           currentDestination?.id == R.id.nav_search || 
                                                           currentDestination?.id == R.id.nav_slideshow

                                // 根据索引关系决定滑动方向
                                val isForward = index > lastSelectedIndex

                                val navOptions = navOptions {
                                    anim {
                                        if (isForward) {
                                            enter = R.anim.slide_in_right
                                            exit = R.anim.slide_out_left
                                            popEnter = R.anim.slide_in_left
                                            popExit = R.anim.slide_out_right
                                        } else {
                                            enter = R.anim.slide_in_left
                                            exit = R.anim.slide_out_right
                                            popEnter = R.anim.slide_in_right
                                            popExit = R.anim.slide_out_left
                                        }
                                    }
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    // 如果是从详情等独立页面切出，或者用户点击了标签，通常期望回到该标签的根部
                                    // 这里我们保持 restoreState 为 true 以保持各标签页的状态，
                                    // 但通过上面的 popBackStack 处理重选，通过合理的 popUpTo 处理切换。
                                    restoreState = !isFromIndependentPage 
                                }
                                navController.navigate(item.id, null, navOptions)
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
                                tint = if (isSelected) PrimaryGreen else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                                modifier = Modifier.size(22.dp)
                            )
                            Text(
                                text = stringResource(item.labelRes),
                                fontSize = 9.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) PrimaryGreen else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                                maxLines = 1
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
        val items = remember { getNavItems() }

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
            modifier = Modifier.fillMaxHeight().width(80.dp)
        ) {
            items.forEachIndexed { index, item ->
                val isSelected = currentDestination?.id == item.id
                NavigationRailItem(
                    icon = {
                        Icon(item.icon, contentDescription = stringResource(item.labelRes), modifier = Modifier.size(26.dp))
                    },
                    label = {
                        Text(stringResource(item.labelRes), fontSize = 11.sp)
                    },
                    selected = isSelected,
                    onClick = {
                        if (currentDestination?.id == item.id) {
                            navController.popBackStack(item.id, false)
                            return@NavigationRailItem
                        }

                        val isFromIndependentPage = currentDestination?.id == R.id.nav_detail || 
                                                   currentDestination?.id == R.id.nav_search || 
                                                   currentDestination?.id == R.id.nav_slideshow

                        val currentIndex = items.indexOfFirst { it.id == currentDestination?.id }.coerceAtLeast(0)
                        val isForward = index > currentIndex

                        val navOptions = navOptions {
                            anim {
                                if (isForward) {
                                    enter = R.anim.slide_in_right
                                    exit = R.anim.slide_out_left
                                    popEnter = R.anim.slide_in_left
                                    popExit = R.anim.slide_out_right
                                } else {
                                    enter = R.anim.slide_in_left
                                    exit = R.anim.slide_out_right
                                    popEnter = R.anim.slide_in_right
                                    popExit = R.anim.slide_out_left
                                }
                            }
                            popUpTo(navController.graph.findStartDestination().id) {
                                saveState = true
                            }
                            launchSingleTop = true
                            restoreState = !isFromIndependentPage
                        }
                        navController.navigate(item.id, null, navOptions)
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
