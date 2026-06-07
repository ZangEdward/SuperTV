package com.supertv.app

import android.content.Context
import android.os.Bundle
import android.view.KeyEvent
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.setupActionBarWithNavController
import androidx.navigation.ui.setupWithNavController
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.supertv.app.databinding.ActivityMainBinding

/**
 * �?Activity - 对应原项目的 _layout.tsx
 *
 * 管理 Navigation Drawer + Bottom Navigation 的容�?Activity
 * 支持 TV 遥控器的双击返回退出功�?
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var lastBackPressTime = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 每次启动清除测速缓�?
        getSharedPreferences("speedtest_cache", Context.MODE_PRIVATE).edit().clear().apply()

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // 设置 Toolbar
        setSupportActionBar(binding.appBarMain.toolbar)

        // 设置 Navigation
        val navHostFragment = supportFragmentManager
            .findFragmentById(com.supertv.app.R.id.nav_host_fragment_content_main) as NavHostFragment
        val navController = navHostFragment.navController

        // 配置 AppBar
        val appBarConfiguration = AppBarConfiguration(
            setOf(
                com.supertv.app.R.id.nav_transform,
                com.supertv.app.R.id.nav_reflow,
                com.supertv.app.R.id.nav_slideshow,
                com.supertv.app.R.id.nav_settings
            ),
            binding.drawerLayout
        )
        setupActionBarWithNavController(navController, appBarConfiguration)

        // 设置底部导航
        binding.appBarMain.contentMain?.bottomNavView?.setupWithNavController(navController)

        // 设置导航抽屉
        binding.navView?.setupWithNavController(navController)
    }

    /**
     * TV 遥控器的返回键处�?- 双击退�?
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            val currentTime = System.currentTimeMillis()
            if (currentTime - lastBackPressTime < 2000) {
                finishAffinity()
                return true
            }
            lastBackPressTime = currentTime
            // 显示 Toast 提示再次返回退�?
            android.widget.Toast.makeText(this, "再按一次返回键退�?, android.widget.Toast.LENGTH_SHORT).show()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    /**
     * 支持 ActionBar 的导航向�?
     */
    override fun onSupportNavigateUp(): Boolean {
        val navHostFragment = supportFragmentManager
            .findFragmentById(com.supertv.app.R.id.nav_host_fragment_content_main) as NavHostFragment
        return navHostFragment.navController.navigateUp() || super.onSupportNavigateUp()
    }
}
