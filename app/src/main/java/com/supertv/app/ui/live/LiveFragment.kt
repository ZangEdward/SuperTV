package com.supertv.app.ui.live

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.*
import androidx.compose.ui.platform.ComposeView
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.supertv.app.R
import com.supertv.app.ui.components.GlobalHeader
import com.supertv.app.ui.components.LoginDialog
import com.supertv.app.ui.components.UserMenu
import com.supertv.app.ui.theme.SuperTVTheme
import com.supertv.app.viewmodel.MainViewModel
import com.supertv.app.data.AuthRepository

import androidx.fragment.app.activityViewModels

class LiveFragment : Fragment() {
    private val mainViewModel: MainViewModel by activityViewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return ComposeView(requireContext()).apply {
            setContent {
                val isDarkTheme by mainViewModel.isDarkTheme.collectAsState()
                val authRepo = remember { AuthRepository.getInstance(context) }
                var showUserMenu by remember { mutableStateOf(false) }
                var isLoggedIn by remember { mutableStateOf(authRepo.isLoggedIn()) }
                var showLoginDialog by remember { mutableStateOf(false) }

                SuperTVTheme(darkTheme = isDarkTheme) {
                    Column {
                        GlobalHeader(
                            onUserClick = { 
                                if (isLoggedIn) showUserMenu = true else showLoginDialog = true 
                            },
                            onSearchClick = { 
                                val navOptions = androidx.navigation.navOptions {
                                    anim {
                                        enter = com.supertv.app.R.anim.slide_in_right
                                        exit = com.supertv.app.R.anim.slide_out_left
                                        popEnter = com.supertv.app.R.anim.slide_in_left
                                        popExit = com.supertv.app.R.anim.slide_out_right
                                    }
                                }
                                findNavController().navigate(R.id.action_nav_live_to_search, null, navOptions) 
                            },
                            onDownloadClick = { 
                                val navOptions = androidx.navigation.navOptions {
                                    anim {
                                        enter = com.supertv.app.R.anim.slide_in_right
                                        exit = com.supertv.app.R.anim.slide_out_left
                                        popEnter = com.supertv.app.R.anim.slide_in_left
                                        popExit = com.supertv.app.R.anim.slide_out_right
                                    }
                                }
                                findNavController().navigate(R.id.nav_slideshow, null, navOptions) 
                            },
                            onThemeToggle = { mainViewModel.toggleTheme() },
                            isDarkTheme = isDarkTheme
                        )
                        
                        LiveScreen()
                        
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
                                    findNavController().navigate(R.id.action_nav_live_to_detail, bundle)
                                },
                                onNavigateToDownloads = {
                                    findNavController().navigate(R.id.nav_slideshow)
                                }
                            )
                        }

                        if (showLoginDialog) {
                            LoginDialog(
                                onLoginSuccess = {
                                    isLoggedIn = true
                                    showLoginDialog = false
                                },
                                onDismiss = { showLoginDialog = false }
                            )
                        }
                    }
                }
            }
        }
    }
}
