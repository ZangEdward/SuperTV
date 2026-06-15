import 'dart:io';

import 'package:flutter/material.dart';
import '../widgets/continue_watching_section.dart';
import '../widgets/hot_movies_section.dart';
import '../widgets/hot_tv_section.dart';
import '../widgets/hot_show_section.dart';
import '../widgets/bangumi_section.dart';
import '../widgets/main_layout.dart';
import '../widgets/top_tab_switcher.dart';
import '../widgets/favorites_grid.dart';
import '../widgets/history_grid.dart';
import 'search_screen.dart';
import '../widgets/video_menu_bottom_sheet.dart';
import '../widgets/custom_refresh_indicator.dart';
import '../models/play_record.dart';
import '../models/video_info.dart';
import '../utils/font_utils.dart';
import '../services/page_cache_service.dart';
import '../services/version_service.dart';
import '../widgets/update_dialog.dart';
import 'movie_screen.dart';
import 'tv_screen.dart';
import 'anime_screen.dart';
import 'show_screen.dart';
import 'player_screen.dart';
import 'live_screen.dart';
import 'tv/tv_home_screen.dart';
import '../services/user_data_service.dart';
import '../utils/device_utils.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentBottomNavIndex = 0;
  int _previousBottomNavIndex = 0;
  String _selectedTopTab = '首页';
  int _currentTopTabIndex = 0;
  int _previousTopTabIndex = 0;
  DateTime? _lastPressedAt;

  @override
  void initState() {
    super.initState();
    // 进入首页时直接刷新播放记录和收藏夹缓存
    _refreshCacheOnHomeEnter();
    // 检查应用更新
    _checkForUpdates();
  }

  /// 检查应用更新
  void _checkForUpdates() async {
    // 延迟3秒后检查更新，避免影响页面加载
    await Future.delayed(const Duration(seconds: 3));
    if (!mounted) return;

    try {
      final versionInfo = await VersionService.checkForUpdate();

      if (versionInfo != null && mounted) {
        final shouldShow = await VersionService.shouldShowUpdatePrompt(
          versionInfo.latestVersion,
        );

        if (shouldShow && mounted) {
          UpdateDialog.show(context, versionInfo);
        }
      }
    } catch (e) {
      // 静默失败，不影响用户体验
      print('检查更新失败: $e');
    }
  }

  @override
  void dispose() {
    super.dispose();
  }

  /// 进入首页时刷新缓存
  Future<void> _refreshCacheOnHomeEnter() async {
    try {
      final cacheService = PageCacheService();

      // 异步刷新播放记录缓存
      cacheService.refreshPlayRecords(context).then((_) {
        // 刷新成功后通知继续观看组件和播放历史组件更新UI
        if (mounted) {
          ContinueWatchingSection.refreshPlayRecords();
          HistoryGrid.refreshHistory();
        }
      }).catchError((e) {
        // 静默处理错误
      });

      // 异步刷新收藏夹缓存
      cacheService.refreshFavorites(context).then((_) {
        // 刷新成功后通知收藏夹组件更新UI
        if (mounted) {
          FavoritesGrid.refreshFavorites();
        }
      }).catchError((e) {
        // 静默处理错误
      });

      // 异步刷新搜索历史缓存
      cacheService.refreshSearchHistory(context).catchError((e) {
        // 静默处理错误
      });
    } catch (e) {
      // 静默处理错误，不影响首页正常显示
    }
  }

  /// 刷新首页数据
  Future<void> _refreshHomeData() async {
    if (!mounted) return;

    try {
      // 调用各个组件的刷新方法
      // 刷新继续观看组件
      await ContinueWatchingSection.refreshPlayRecords();

      // 刷新播放历史组件
      await HistoryGrid.refreshHistory();

      // 刷新收藏夹组件
      await FavoritesGrid.refreshFavorites();

      // 刷新热门电影组件
      await HotMoviesSection.refreshHotMovies();

      // 刷新热门剧集组件
      await HotTvSection.refreshHotTvShows();

      // 刷新新番放送组件
      await BangumiSection.refreshBangumiCalendar();

      // 刷新热门综艺组件
      await HotShowSection.refreshHotShows();

      if (!mounted) return;
      // 强制重建页面
      setState(() {});
    } catch (e) {
      // 刷新失败，静默处理
    }
  }

  /// 构建首页内容（带动画支持切换）
  Widget _buildHomeContentWithAnimation() {
    return Column(
      children: [
        // 顶部导航栏
        TopTabSwitcher(
          selectedTab: _selectedTopTab,
          onTabChanged: _onTopTabChanged,
        ),
        // 使用 AnimatedSwitcher 支持动画
        Expanded(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            layoutBuilder: (Widget? currentChild, List<Widget> previousChildren) {
              return Stack(
                children: <Widget>[
                  ...previousChildren,
                  if (currentChild != null) currentChild,
                ],
              );
            },
            transitionBuilder: (Widget child, Animation<double> animation) {
              final bool isNewChild = child.key == _getTopTabContent(_currentTopTabIndex).key;
              final bool isMovingRight = _currentTopTabIndex > _previousTopTabIndex;

              if (isNewChild) {
                final begin = isMovingRight ? const Offset(1.0, 0.0) : const Offset(-1.0, 0.0);
                return SlideTransition(
                  position: Tween<Offset>(begin: begin, end: Offset.zero).animate(
                    CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
                  ),
                  child: child,
                );
              } else {
                final end = isMovingRight ? const Offset(-1.0, 0.0) : const Offset(1.0, 0.0);
                return SlideTransition(
                  position: Tween<Offset>(begin: end, end: Offset.zero).animate(
                    CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
                  ),
                  child: child,
                );
              }
            },
            child: _getTopTabContent(_currentTopTabIndex),
          ),
        ),
      ],
    );
  }

  Widget _getTopTabContent(int index) {
    switch (index) {
      case 0:
        return Container(key: const ValueKey('home_tab'), child: _buildHomeTabContent());
      case 1:
        return Container(key: const ValueKey('history_tab'), child: _buildHistoryTabContent());
      case 2:
        return Container(key: const ValueKey('favorites_tab'), child: _buildFavoritesTabContent());
      default:
        return Container(key: const ValueKey('home_tab'), child: _buildHomeTabContent());
    }
  }

  /// 构建首页标签内容
  Widget _buildHomeTabContent() {
    return StyledRefreshIndicator(
      onRefresh: _refreshHomeData,
      refreshText: '刷新中...',
      primaryColor: const Color(0xFF27AE60),
      child: SingleChildScrollView(
        child: Column(
          children: [
            const SizedBox(height: 8),
            // 继续观看组件
            ContinueWatchingSection(
              onVideoTap: _onVideoTap,
              onGlobalMenuAction: _onGlobalMenuAction,
              onViewAll: () {
                // 切换到播放历史标签
                _onTopTabChanged('播放历史');
              },
            ),
            // 热门电影组件
            HotMoviesSection(
              onMovieTap: (videoInfo) {
                _navigateToPlayer(
                  PlayerScreen(
                    title: videoInfo.title,
                    stype: 'movie',
                    year: videoInfo.year,
                  ),
                );
              },
              onMoreTap: () => _onBottomNavChanged(1),
              onGlobalMenuAction: (videoInfo, action) {
                if (action == VideoMenuAction.play) {
                  _navigateToPlayer(
                    PlayerScreen(
                      title: videoInfo.title,
                      stype: 'movie',
                      year: videoInfo.year,
                    ),
                  );
                } else {
                  _onGlobalMenuActionFromVideoInfo(videoInfo, action);
                }
              },
            ),
            // 热门剧集组件
            HotTvSection(
              onTvTap: (videoInfo) {
                _navigateToPlayer(
                  PlayerScreen(
                    title: videoInfo.title,
                    year: videoInfo.year,
                  ),
                );
              },
              onMoreTap: () => _onBottomNavChanged(2),
              onGlobalMenuAction: (videoInfo, action) {
                if (action == VideoMenuAction.play) {
                  _navigateToPlayer(
                    PlayerScreen(
                      title: videoInfo.title,
                      year: videoInfo.year,
                    ),
                  );
                } else {
                  _onGlobalMenuActionFromVideoInfo(videoInfo, action);
                }
              },
            ),
            // 新番放送组件
            BangumiSection(
              onBangumiTap: (videoInfo) {
                _navigateToPlayer(
                  PlayerScreen(
                    title: videoInfo.title,
                    year: videoInfo.year,
                  ),
                );
              },
              onMoreTap: () => _onBottomNavChanged(3),
              onGlobalMenuAction: (videoInfo, action) {
                if (action == VideoMenuAction.play) {
                  _navigateToPlayer(
                    PlayerScreen(
                      title: videoInfo.title,
                      year: videoInfo.year,
                    ),
                  );
                } else {
                  _onGlobalMenuActionFromVideoInfo(videoInfo, action);
                }
              },
            ),
            // 热门综艺组件
            HotShowSection(
              onShowTap: (videoInfo) {
                _navigateToPlayer(
                  PlayerScreen(
                    title: videoInfo.title,
                    year: videoInfo.year,
                  ),
                );
              },
              onMoreTap: () => _onBottomNavChanged(4),
              onGlobalMenuAction: (videoInfo, action) {
                if (action == VideoMenuAction.play) {
                  _navigateToPlayer(
                    PlayerScreen(
                      title: videoInfo.title,
                      year: videoInfo.year,
                    ),
                  );
                } else {
                  _onGlobalMenuActionFromVideoInfo(videoInfo, action);
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  /// 构建播放历史标签内容
  Widget _buildHistoryTabContent() {
    return StyledRefreshIndicator(
      onRefresh: _refreshHomeData,
      refreshText: '刷新中...',
      primaryColor: const Color(0xFF27AE60),
      child: SingleChildScrollView(
        child: Column(
          children: [
            const SizedBox(height: 4),
            HistoryGrid(
              onVideoTap: _onVideoTap,
              onGlobalMenuAction: _onGlobalMenuAction,
            ),
          ],
        ),
      ),
    );
  }

  /// 构建收藏夹标签内容
  Widget _buildFavoritesTabContent() {
    return StyledRefreshIndicator(
      onRefresh: _refreshHomeData,
      refreshText: '刷新中...',
      primaryColor: const Color(0xFF27AE60),
      child: SingleChildScrollView(
        child: Column(
          children: [
            const SizedBox(height: 4),
            FavoritesGrid(
              onVideoTap: _onVideoTap,
              onGlobalMenuAction:
                  (VideoInfo videoInfo, VideoMenuAction action) {
                // 将VideoInfo转换为PlayRecord用于统一处理
                final playRecord = PlayRecord(
                  id: videoInfo.id,
                  source: videoInfo.source,
                  title: videoInfo.title,
                  sourceName: videoInfo.sourceName,
                  year: videoInfo.year,
                  cover: videoInfo.cover,
                  index: videoInfo.index,
                  totalEpisodes: videoInfo.totalEpisodes,
                  playTime: videoInfo.playTime,
                  totalTime: videoInfo.totalTime,
                  saveTime: videoInfo.saveTime,
                  searchTitle: videoInfo.searchTitle,
                );
                _onGlobalMenuAction(playRecord, action);
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // 自动识别电视模式
    if (DeviceUtils.isTV(context)) {
      return const TvHomeScreen();
    }

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;

        final now = DateTime.now();
        if (_lastPressedAt == null ||
            now.difference(_lastPressedAt!) > const Duration(seconds: 2)) {
          _lastPressedAt = now;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                '再按一次退出应用',
                style: FontUtils.poppins(color: Colors.white),
              ),
              backgroundColor: const Color(0xFF2c3e50),
              duration: const Duration(seconds: 2),
              behavior: SnackBarBehavior.floating,
              width: 200,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          );
          return;
        }
        // 退出应用
        exit(0);
      },
      child: MainLayout(
        content: _buildBottomNavWithAnimation(),
        currentBottomNavIndex: _currentBottomNavIndex,
        onBottomNavChanged: _onBottomNavChanged,
        selectedTopTab: _selectedTopTab,
        onTopTabChanged: _onTopTabChanged,
        onHomeTap: _onHomeTap,
        onSearchTap: _onSearchTap,
      ),
    );
  }

  /// 构建底栏切换动画
  Widget _buildBottomNavWithAnimation() {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 300),
      layoutBuilder: (Widget? currentChild, List<Widget> previousChildren) {
        return Stack(
          children: <Widget>[
            ...previousChildren,
            if (currentChild != null) currentChild,
          ],
        );
      },
      transitionBuilder: (Widget child, Animation<double> animation) {
        // 判断是否是当前选中的页面（即新进入的页面）
        final bool isNewChild = child.key == _getBottomNavPage(_currentBottomNavIndex).key;
        final bool isMovingRight = _currentBottomNavIndex > _previousBottomNavIndex;
        
        if (isNewChild) {
          // 新页面进入
          final begin = isMovingRight ? const Offset(1.0, 0.0) : const Offset(-1.0, 0.0);
          return SlideTransition(
            position: Tween<Offset>(begin: begin, end: Offset.zero).animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            ),
            child: child,
          );
        } else {
          // 旧页面退出
          final end = isMovingRight ? const Offset(-1.0, 0.0) : const Offset(1.0, 0.0);
          return SlideTransition(
            position: Tween<Offset>(begin: end, end: Offset.zero).animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            ),
            child: child,
          );
        }
      },
      child: _getBottomNavPage(_currentBottomNavIndex),
    );
  }

  Widget _getBottomNavPage(int index) {
    switch (index) {
      case 0:
        return Container(key: const ValueKey('home_tab_container'), child: _buildHomeContentWithAnimation());
      case 1:
        return const MovieScreen(key: ValueKey('movie'));
      case 2:
        return const TvScreen(key: ValueKey('tv'));
      case 3:
        return const AnimeScreen(key: ValueKey('anime'));
      case 4:
        return const ShowScreen(key: ValueKey('show'));
      case 5:
        return const LiveScreen(key: ValueKey('live'));
      default:
        return Container(key: const ValueKey('home_tab_container'), child: _buildHomeContentWithAnimation());
    }
  }

  /// 处理底部导航栏切换
  void _onBottomNavChanged(int index) {
    if (!mounted) return;

    // 防止重复点击同一个标签
    if (_currentBottomNavIndex == index) {
      return;
    }

    setState(() {
      _previousBottomNavIndex = _currentBottomNavIndex;
      _currentBottomNavIndex = index;
    });
  }

  /// 处理顶部标签切换
  void _onTopTabChanged(String tab) {
    if (!mounted) return;

    // 防止重复点击同一个标签
    if (_selectedTopTab == tab) {
      return;
    }

    int pageIndex;
    switch (tab) {
      case '首页':
        pageIndex = 0;
        break;
      case '播放历史':
        pageIndex = 1;
        break;
      case '收藏夹':
        pageIndex = 2;
        break;
      default:
        pageIndex = 0;
    }

    setState(() {
      _previousTopTabIndex = _currentTopTabIndex;
      _currentTopTabIndex = pageIndex;
      _selectedTopTab = tab;
    });
  }

  /// 处理点击搜索按钮
  void _onSearchTap() {
    Navigator.push(
      context,
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) =>
            const SearchScreen(),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          const begin = Offset(0.0, -1.0);
          const end = Offset.zero;
          const curve = Curves.easeOutCubic;
          var tween =
              Tween(begin: begin, end: end).chain(CurveTween(curve: curve));
          return SlideTransition(
            position: animation.drive(tween),
            child: child,
          );
        },
        transitionDuration: const Duration(milliseconds: 400),
      ),
    ).then((_) {
      // 从搜索页面返回时刷新数据
      if (mounted) {
        _refreshOnResume();
      }
    });
  }

  /// 处理点击 SuperTV 标题跳转到首页
  void _onHomeTap() {
    if (!mounted) return;

    setState(() {
      // 切换到首页
      _previousBottomNavIndex = _currentBottomNavIndex;
      _currentBottomNavIndex = 0;
      // 切换到首页标签
      _previousTopTabIndex = _currentTopTabIndex;
      _currentTopTabIndex = 0;
      _selectedTopTab = '首页';
    });
  }

  /// 处理视频卡片点击
  void _onVideoTap(PlayRecord playRecord) {
    _navigateToPlayer(
      PlayerScreen(
        source: playRecord.source,
        id: playRecord.id,
        title: playRecord.title,
        year: playRecord.year,
      ),
    );
  }

  /// 处理来自VideoInfo的全局菜单操作
  void _onGlobalMenuActionFromVideoInfo(
      VideoInfo videoInfo, VideoMenuAction action) {
    // 将VideoInfo转换为PlayRecord用于统一处理
    final playRecord = PlayRecord(
      id: videoInfo.id,
      source: videoInfo.source,
      title: videoInfo.title,
      sourceName: videoInfo.sourceName,
      year: videoInfo.year,
      cover: videoInfo.cover,
      index: videoInfo.index,
      totalEpisodes: videoInfo.totalEpisodes,
      playTime: videoInfo.playTime,
      totalTime: videoInfo.totalTime,
      saveTime: videoInfo.saveTime,
      searchTitle: videoInfo.searchTitle,
    );
    _onGlobalMenuAction(playRecord, action);
  }

  /// 处理视频菜单操作
  void _onGlobalMenuAction(PlayRecord playRecord, VideoMenuAction action) {
    switch (action) {
      case VideoMenuAction.play:
        _navigateToPlayer(
          PlayerScreen(
            source: playRecord.source,
            id: playRecord.id,
            title: playRecord.title,
            year: playRecord.year,
          ),
        );
        break;
      case VideoMenuAction.favorite:
        // 收藏
        _handleFavorite(playRecord);
        break;
      case VideoMenuAction.unfavorite:
        // 取消收藏
        _handleUnfavorite(playRecord);
        break;
      case VideoMenuAction.deleteRecord:
        // 删除记录
        _deletePlayRecord(playRecord);
        break;
      case VideoMenuAction.doubanDetail:
        // 豆瓣详情 - 已在组件内部处理URL跳转
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '正在打开豆瓣详情: ${playRecord.title}',
              style: FontUtils.poppins(color: Colors.white),
            ),
            backgroundColor: const Color(0xFF3498DB),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            margin: const EdgeInsets.all(16),
          ),
        );
        break;
      case VideoMenuAction.bangumiDetail:
        // Bangumi详情 - 已在组件内部处理URL跳转
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '正在打开 Bangumi 详情: ${playRecord.title}',
              style: FontUtils.poppins(color: Colors.white),
            ),
            backgroundColor: const Color(0xFF3498DB),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            margin: const EdgeInsets.all(16),
          ),
        );
        break;
    }
  }

  /// 从继续观看UI中移除播放记录
  void _removePlayRecordFromUI(PlayRecord playRecord) {
    // 调用继续观看组件和播放历史组件的静态移除方法
    ContinueWatchingSection.removePlayRecordFromUI(
        playRecord.source, playRecord.id);
    HistoryGrid.removeHistoryFromUI(playRecord.source, playRecord.id);
  }

  /// 删除播放记录
  Future<void> _deletePlayRecord(PlayRecord playRecord) async {
    try {
      // 先从UI中移除记录
      _removePlayRecordFromUI(playRecord);

      // 使用统一的删除方法（包含缓存操作和API调用）
      final cacheService = PageCacheService();
      final result = await cacheService.deletePlayRecord(
        playRecord.source,
        playRecord.id,
        context,
      );

      if (!result.success) {
        throw Exception(result.errorMessage ?? '删除失败');
      }
    } catch (e) {
      // 删除失败时显示错误提示
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '删除失败: ${e.toString()}',
              style: FontUtils.poppins(color: Colors.white),
            ),
            backgroundColor: const Color(0xFFe74c3c),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            margin: const EdgeInsets.all(16),
          ),
        );
      }
    } finally {
      // 异步刷新播放记录缓存
      if (mounted) {
        _refreshPlayRecordsCache();
      }
    }
  }

  /// 异步刷新播放记录缓存
  Future<void> _refreshPlayRecordsCache() async {
    try {
      final cacheService = PageCacheService();
      await cacheService.refreshPlayRecords(context);
    } catch (e) {
      // 刷新缓存失败，静默处理
    }
  }

  /// 跳转到播放页的通用方法
  Future<void> _navigateToPlayer(Widget playerScreen) async {
    await Navigator.push(
      context,
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) => playerScreen,
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          const begin = Offset(1.0, 0.0);
          const end = Offset.zero;
          const curve = Curves.easeOutCubic;
          var tween = Tween(begin: begin, end: end).chain(CurveTween(curve: curve));
          return SlideTransition(
            position: animation.drive(tween),
            child: child,
          );
        },
        transitionDuration: const Duration(milliseconds: 350),
      ),
    );

    if (!mounted) return;
    _refreshOnResume();
  }

  /// 从播放页返回时刷新播放记录
  Future<void> _refreshOnResume() async {
    try {
      // 通知继续观看组件和播放历史组件更新UI
      if (mounted) {
        ContinueWatchingSection.refreshPlayRecords();
        HistoryGrid.refreshHistory();
        FavoritesGrid.refreshFavorites();
      }
    } catch (e) {
      // 刷新失败，静默处理
    }
  }

  /// 处理收藏
  Future<void> _handleFavorite(PlayRecord playRecord) async {
    try {
      // 构建收藏数据
      final favoriteData = {
        'cover': playRecord.cover,
        'save_time': DateTime.now().millisecondsSinceEpoch,
        'source_name': playRecord.sourceName,
        'title': playRecord.title,
        'total_episodes': playRecord.totalEpisodes,
        'year': playRecord.year,
      };

      // 使用统一的收藏方法（包含缓存操作和API调用）
      final cacheService = PageCacheService();
      final result = await cacheService.addFavorite(
          playRecord.source, playRecord.id, favoriteData, context);

      if (result.success) {
        // 通知UI刷新收藏状态
        if (mounted) {
          setState(() {});
        }
      } else {
        // 显示错误提示
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                result.errorMessage ?? '收藏失败',
                style: FontUtils.poppins(color: Colors.white),
              ),
              backgroundColor: const Color(0xFFe74c3c),
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              margin: const EdgeInsets.all(16),
            ),
          );
        }
        _refreshFavorites();
      }
    } catch (e) {
      // 显示错误提示
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '收藏失败: ${e.toString()}',
              style: FontUtils.poppins(color: Colors.white),
            ),
            backgroundColor: const Color(0xFFe74c3c),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            margin: const EdgeInsets.all(16),
          ),
        );
      }
      _refreshFavorites();
    }
  }

  /// 处理取消收藏
  Future<void> _handleUnfavorite(PlayRecord playRecord) async {
    try {
      // 先立即从UI中移除该项目
      FavoritesGrid.removeFavoriteFromUI(playRecord.source, playRecord.id);

      // 通知继续观看组件刷新收藏状态
      if (mounted) {
        setState(() {});
      }

      // 使用统一的取消收藏方法（包含缓存操作和API调用）
      final cacheService = PageCacheService();
      final result = await cacheService.removeFavorite(
          playRecord.source, playRecord.id, context);

      if (!result.success) {
        // 显示错误提示
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                result.errorMessage ?? '取消收藏失败',
                style: FontUtils.poppins(color: Colors.white),
              ),
              backgroundColor: const Color(0xFFe74c3c),
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              margin: const EdgeInsets.all(16),
            ),
          );
        }
        // API失败时重新刷新缓存以恢复数据
        _refreshFavorites();
      }
    } catch (e) {
      // 显示错误提示
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '取消收藏失败: ${e.toString()}',
              style: FontUtils.poppins(color: Colors.white),
            ),
            backgroundColor: const Color(0xFFe74c3c),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            margin: const EdgeInsets.all(16),
          ),
        );
      }
      // 异常时重新刷新缓存以恢复数据
      _refreshFavorites();
    }
  }

  /// 异步刷新收藏夹数据
  Future<void> _refreshFavorites() async {
    try {
      // 刷新收藏夹缓存数据
      await PageCacheService().refreshFavorites(context);

      // 通知收藏夹组件刷新UI
      FavoritesGrid.refreshFavorites();
    } catch (e) {
      // 错误处理，静默处理
    }
  }
}
