import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../../services/theme_service.dart';
import '../../utils/font_utils.dart';

class TvMainLayout extends StatefulWidget {
  final Widget content;
  final int currentIndex;
  final Function(int) onIndexChanged;
  final VoidCallback onSearchTap;
  final VoidCallback onSettingsTap;

  const TvMainLayout({
    super.key,
    required this.content,
    required this.currentIndex,
    required this.onIndexChanged,
    required this.onSearchTap,
    required this.onSettingsTap,
  });

  @override
  State<TvMainLayout> createState() => _TvMainLayoutState();
}

class _TvMainLayoutState extends State<TvMainLayout> {
  final List<Map<String, dynamic>> _navItems = [
    {'icon': LucideIcons.house, 'label': '首页'},
    {'icon': LucideIcons.video, 'label': '电影'},
    {'icon': LucideIcons.tv, 'label': '剧集'},
    {'icon': LucideIcons.cat, 'label': '动漫'},
    {'icon': LucideIcons.clover, 'label': '综艺'},
    {'icon': LucideIcons.radio, 'label': '直播'},
  ];

  @override
  Widget build(BuildContext context) {
    final themeService = Provider.of<ThemeService>(context);
    
    return Scaffold(
      backgroundColor: themeService.isDarkMode ? Colors.black : const Color(0xFFF5F5F5),
      body: Row(
        children: [
          // 侧边导航
          Container(
            width: 100,
            color: themeService.isDarkMode ? const Color(0xFF121212) : Colors.white,
            child: Column(
              children: [
                const SizedBox(height: 40),
                // 搜索按钮
                _buildIconButton(
                  icon: LucideIcons.search,
                  onTap: widget.onSearchTap,
                  themeService: themeService,
                ),
                const SizedBox(height: 20),
                // 导航项
                Expanded(
                  child: ListView.builder(
                    itemCount: _navItems.length,
                    itemBuilder: (context, index) {
                      final item = _navItems[index];
                      return _buildNavItem(
                        index: index,
                        icon: item['icon'],
                        label: item['label'],
                        isSelected: widget.currentIndex == index,
                        onTap: () => widget.onIndexChanged(index),
                        themeService: themeService,
                      );
                    },
                  ),
                ),
                // 设置按钮
                _buildIconButton(
                  icon: LucideIcons.settings,
                  onTap: widget.onSettingsTap,
                  themeService: themeService,
                ),
                const SizedBox(height: 40),
              ],
            ),
          ),
          // 内容区
          Expanded(
            child: widget.content,
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem({
    required int index,
    required IconData icon,
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
    required ThemeService themeService,
  }) {
    return Focus(
      onFocusChange: (hasFocus) {
        if (hasFocus) {
          onTap();
        }
      },
      child: Builder(
        builder: (context) {
          final hasFocus = Focus.of(context).hasFocus;
          return GestureDetector(
            onTap: onTap,
            child: Container(
              height: 80,
              width: 100,
              color: hasFocus ? (themeService.isDarkMode ? Colors.white.withValues(alpha: 0.1) : Colors.black.withOpacity(0.05)) : Colors.transparent,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    icon,
                    color: isSelected ? const Color(0xFF27AE60) : (themeService.isDarkMode ? Colors.white70 : Colors.black54),
                    size: hasFocus ? 32 : 28,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    label,
                    style: FontUtils.poppins(
                      fontSize: 12,
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                      color: isSelected ? const Color(0xFF27AE60) : (themeService.isDarkMode ? Colors.white70 : Colors.black54),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildIconButton({
    required IconData icon,
    required VoidCallback onTap,
    required ThemeService themeService,
  }) {
    return Focus(
      child: Builder(
        builder: (context) {
          final hasFocus = Focus.of(context).hasFocus;
          return GestureDetector(
            onTap: onTap,
            child: Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: hasFocus ? (themeService.isDarkMode ? Colors.white.withValues(alpha: 0.1) : Colors.black.withOpacity(0.05)) : Colors.transparent,
                borderRadius: BorderRadius.circular(30),
              ),
              child: Icon(
                icon,
                color: themeService.isDarkMode ? Colors.white : Colors.black,
                size: 28,
              ),
            ),
          );
        },
      ),
    );
  }
}
