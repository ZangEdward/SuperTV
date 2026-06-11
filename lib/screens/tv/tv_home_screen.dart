import 'package:flutter/material.dart';
import '../../widgets/tv/tv_main_layout.dart';
import 'tv_search_screen.dart';
import '../player_screen.dart';
import '../home_screen.dart';
import '../../models/video_info.dart';
import '../../widgets/hot_movies_section.dart';
import '../../widgets/hot_tv_section.dart';
import '../login_screen.dart';
import '../../services/user_data_service.dart';

class TvHomeScreen extends StatefulWidget {
  const TvHomeScreen({super.key});

  @override
  State<TvHomeScreen> createState() => _TvHomeScreenState();
}

class _TvHomeScreenState extends State<TvHomeScreen> {
  int _currentIndex = 0;

  void _navigateToPlayer(VideoInfo videoInfo) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => PlayerScreen(
          title: videoInfo.title,
          year: videoInfo.year,
          source: videoInfo.source,
          id: videoInfo.id,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return TvMainLayout(
      currentIndex: _currentIndex,
      onIndexChanged: (index) {
        setState(() {
          _currentIndex = index;
        });
      },
      onSearchTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (context) => const TvSearchScreen()),
        );
      },
      onSettingsTap: () {
        // Simple dialog to toggle TV mode for now, or logout
        _showSettingsDialog();
      },
      content: _buildContent(),
    );
  }

  void _showSettingsDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('设置'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('退出电视模式'),
              onTap: () async {
                await UserDataService.saveIsTVMode(false);
                if (mounted) {
                  Navigator.of(context).pushAndRemoveUntil(
                    MaterialPageRoute(builder: (context) => const HomeScreen()),
                    (route) => false,
                  );
                }
              },
            ),
            ListTile(
              title: const Text('退出登录'),
              onTap: () async {
                await UserDataService.clearUserData();
                if (mounted) {
                  Navigator.of(context).pushAndRemoveUntil(
                    MaterialPageRoute(builder: (context) => const LoginScreen()),
                    (route) => false,
                  );
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    switch (_currentIndex) {
      case 0:
        return _buildHomeTab();
      // Add other tabs here
      default:
        return const Center(child: Text('Coming Soon', style: TextStyle(color: Colors.white)));
    }
  }

  Widget _buildHomeTab() {
    return SingleChildScrollView(
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
             HotMoviesSection(
               onMovieTap: _navigateToPlayer,
               onMoreTap: () => setState(() => _currentIndex = 1),
             ),
             const SizedBox(height: 30),
             HotTvSection(
               onTvTap: _navigateToPlayer,
               onMoreTap: () => setState(() => _currentIndex = 2),
             ),
          ],
        ),
      ),
    );
  }
}
