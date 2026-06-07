package com.supertv.app

import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.setupActionBarWithNavController
import androidx.navigation.ui.setupWithNavController
import com.supertv.app.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private var _binding: ActivityMainBinding? = null
    private val binding get() = _binding!!
    private var lastBackPressTime = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            // 设置主题 ( dots -> underscores )
            setTheme(R.style.Theme_App_NoActionBar)
            
            _binding = ActivityMainBinding.inflate(layoutInflater)
            setContentView(binding.root)

            // 设置 Toolbar (使用安全的 binding 引用)
            setSupportActionBar(binding.appBarMain.toolbar)

            // 获取 NavHost
            val navHostFragment = supportFragmentManager
                .findFragmentById(R.id.nav_host_fragment_content_main) as? NavHostFragment
            
            navHostFragment?.let { navHost ->
                val navController = navHost.navController
                
                // 配置 AppBar
                val appBarConfiguration = AppBarConfiguration(
                    setOf(
                        R.id.nav_transform,
                        R.id.nav_reflow,
                        R.id.nav_slideshow,
                        R.id.nav_settings
                    ),
                    binding.drawerLayout
                )
                setupActionBarWithNavController(navController, appBarConfiguration)

                // 绑定导航组件
                binding.appBarMain.contentMain?.bottomNavView?.setupWithNavController(navController)
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
