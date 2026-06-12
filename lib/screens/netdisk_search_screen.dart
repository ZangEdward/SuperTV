import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/api_service.dart';
import '../services/theme_service.dart';
import '../utils/font_utils.dart';
import '../utils/device_utils.dart';

class NetdiskSearchScreen extends StatefulWidget {
  final String? initialKeyword;

  const NetdiskSearchScreen({super.key, this.initialKeyword});

  @override
  State<NetdiskSearchScreen> createState() => _NetdiskSearchScreenState();
}

class _NetdiskSearchScreenState extends State<NetdiskSearchScreen> with TickerProviderStateMixin {
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  bool _isLoading = false;
  String? _error;
  Map<String, dynamic> _results = {};
  List<String> _tabs = [];
  String _activeTab = '';

  @override
  void initState() {
    super.initState();
    if (widget.initialKeyword != null && widget.initialKeyword!.isNotEmpty) {
      _searchController.text = widget.initialKeyword!;
      _performSearch();
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  Future<void> _performSearch() async {
    final keyword = _searchController.text.trim();
    if (keyword.isEmpty) return;

    setState(() {
      _isLoading = true;
      _error = null;
      _results = {};
      _tabs = [];
      _activeTab = '';
    });

    _searchFocusNode.unfocus();

    try {
      final response = await ApiService.searchNetDisk(keyword, context);
      if (response.success && response.data != null) {
        final merged = response.data!['merged_by_type'] as Map<String, dynamic>? ?? {};
        
        final filteredResults = <String, List<dynamic>>{};
        merged.forEach((key, value) {
          if (value is List && value.isNotEmpty) {
            filteredResults[key] = value;
          }
        });

        if (filteredResults.isEmpty) {
          setState(() {
            _error = '未找到结果';
            _isLoading = false;
          });
          return;
        }

        setState(() {
          _results = filteredResults;
          _tabs = filteredResults.keys.toList();
          _activeTab = _tabs.first;
          _isLoading = false;
        });
      } else {
        setState(() {
          _error = response.message ?? '搜索失败';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = '搜索异常: $e';
        _isLoading = false;
      });
    }
  }

  String _getTypeName(String type) {
    const map = {
      'quark': '夸克',
      'magnet': '磁力',
      'baidu': '百度',
      'aliyun': '阿里',
      'xunlei': '迅雷',
      'pikpak': 'PikPak',
      'uc': 'UC',
      'tianyi': '天翼',
      'pan115': '115',
    };
    return map[type] ?? type.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<ThemeService>(
      builder: (context, themeService, child) {
        final bool isDarkMode = themeService.isDarkMode;
        return Scaffold(
          backgroundColor: isDarkMode ? const Color(0xFF121212) : const Color(0xFFf5f5f5),
          appBar: AppBar(
            backgroundColor: isDarkMode ? const Color(0xFF121212) : const Color(0xFFf5f5f5),
            elevation: 0,
            scrolledUnderElevation: 0,
            leading: IconButton(
              icon: Icon(
                LucideIcons.arrowLeft,
                color: isDarkMode ? Colors.white : const Color(0xFF2c3e50),
              ),
              onPressed: () => Navigator.pop(context),
            ),
            title: Text(
              '网盘搜',
              style: FontUtils.poppins(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: isDarkMode ? Colors.white : const Color(0xFF2c3e50),
              ),
            ),
            centerTitle: true,
          ),
          body: Column(
            children: [
              _buildSearchBar(themeService),
              if (_tabs.isNotEmpty) _buildTabs(themeService),
              Expanded(
                child: _buildContent(themeService),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSearchBar(ThemeService themeService) {
    final bool isDarkMode = themeService.isDarkMode;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Row(
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: isDarkMode ? const Color(0xFF1e1e1e) : Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  if (!isDarkMode)
                    BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                ],
              ),
              child: TextField(
                controller: _searchController,
                focusNode: _searchFocusNode,
                style: FontUtils.poppins(
                  color: isDarkMode ? Colors.white : const Color(0xFF2c3e50),
                ),
                decoration: InputDecoration(
                  hintText: '搜索网盘资源...',
                  hintStyle: FontUtils.poppins(
                    color: isDarkMode ? const Color(0xFF666666) : const Color(0xFF95a5a6),
                  ),
                  border: InputBorder.none,
                  prefixIcon: Icon(
                    LucideIcons.search,
                    size: 18,
                    color: isDarkMode ? const Color(0xFFb0b0b0) : const Color(0xFF7f8c8d),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                onSubmitted: (_) => _performSearch(),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF27ae60).withOpacity(0.3),
                  blurRadius: 8,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: ElevatedButton(
              onPressed: _performSearch,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF27ae60),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.all(12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                minimumSize: const Size(48, 48),
                elevation: 0,
              ),
              child: const Icon(LucideIcons.search, size: 22),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabs(ThemeService themeService) {
    return Container(
      height: 44,
      margin: const EdgeInsets.only(bottom: 8),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _tabs.length,
        itemBuilder: (context, index) {
          final tab = _tabs[index];
          final isActive = _activeTab == tab;
          final count = (_results[tab] as List).length;

          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () {
                setState(() {
                  _activeTab = tab;
                });
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: isActive 
                      ? const Color(0xFF27ae60) 
                      : (themeService.isDarkMode ? const Color(0xFF1e1e1e) : Colors.white),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    if (!isActive && !themeService.isDarkMode)
                      BoxShadow(
                        color: Colors.black.withOpacity(0.05),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                  ],
                ),
                child: Center(
                  child: Text(
                    '${_getTypeName(tab)} ($count)',
                    style: FontUtils.poppins(
                      fontSize: 13,
                      fontWeight: isActive ? FontWeight.w600 : FontWeight.w400,
                      color: isActive ? Colors.white : (themeService.isDarkMode ? const Color(0xFFb0b0b0) : const Color(0xFF7f8c8d)),
                    ),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildContent(ThemeService themeService) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFF27ae60)));
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.searchX, size: 64, color: themeService.isDarkMode ? const Color(0xFF333333) : const Color(0xFFe0e0e0)),
            const SizedBox(height: 16),
            Text(
              _error!,
              style: FontUtils.poppins(color: const Color(0xFF888888)),
            ),
          ],
        ),
      );
    }

    if (_activeTab.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.hardDrive, size: 80, color: themeService.isDarkMode ? const Color(0xFF1e1e1e) : const Color(0xFFe0e0e0)),
            const SizedBox(height: 16),
            Text(
              '输入关键字开始搜索',
              style: FontUtils.poppins(
                fontSize: 16,
                color: themeService.isDarkMode ? const Color(0xFF666666) : const Color(0xFF95a5a6),
              ),
            ),
          ],
        ),
      );
    }

    final currentData = _results[_activeTab] as List<dynamic>;

    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: DeviceUtils.isPC() ? 2 : 1,
        crossAxisSpacing: 16,
        mainAxisSpacing: 16,
        mainAxisExtent: 160,
      ),
      itemCount: currentData.length,
      itemBuilder: (context, index) {
        final item = currentData[index];
        return _buildResultCard(item, themeService);
      },
    );
  }

  Widget _buildResultCard(Map<String, dynamic> item, ThemeService themeService) {
    final title = item['note'] ?? '无标题';
    final source = item['source'] ?? '未知来源';
    final datetime = item['datetime'] ?? '';
    final url = item['url'] ?? '';
    final isDarkMode = themeService.isDarkMode;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDarkMode ? const Color(0xFF1e1e1e) : Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          if (!isDarkMode)
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFF27ae60).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  source,
                  style: FontUtils.poppins(
                    fontSize: 11,
                    color: const Color(0xFF27ae60),
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              Text(
                datetime.split('T')[0],
                style: FontUtils.poppins(
                  fontSize: 12, 
                  color: isDarkMode ? const Color(0xFF666666) : const Color(0xFF95a5a6)
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Expanded(
            child: Text(
              title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: FontUtils.poppins(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: isDarkMode ? Colors.white : const Color(0xFF2c3e50),
                height: 1.4,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: url));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('已复制链接')),
                      );
                    },
                    borderRadius: BorderRadius.circular(8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        border: Border.all(color: const Color(0xFF27ae60).withOpacity(0.5)),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(LucideIcons.copy, size: 14, color: Color(0xFF27ae60)),
                          const SizedBox(width: 6),
                          Text(
                            '复制链接',
                            style: FontUtils.poppins(
                              fontSize: 13,
                              color: const Color(0xFF27ae60),
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: () async {
                    final uri = Uri.parse(url);
                    if (await canLaunchUrl(uri)) {
                      await launchUrl(uri, mode: LaunchMode.externalApplication);
                    } else {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('无法打开链接')),
                        );
                      }
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF27ae60),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(LucideIcons.externalLink, size: 14),
                      const SizedBox(width: 6),
                      Text(
                        '直接打开',
                        style: FontUtils.poppins(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
