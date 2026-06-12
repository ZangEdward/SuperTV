import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/video_info.dart';
import '../models/douban_movie.dart';
import '../models/bangumi.dart';
import '../services/theme_service.dart';
import '../services/douban_service.dart';
import '../services/bangumi_service.dart';
import '../utils/image_url.dart';
import 'fullscreen_image_viewer.dart';
import '../models/search_result.dart';
import '../utils/font_utils.dart';

/// 判断是否为iOS平台
bool get _isIOS {
  try {
    return !kIsWeb && Platform.isIOS;
  } catch (_) {
    return false;
  }
}

/// 自定义滚动物理，在展开状态下的顶部向下拖拽时触发收起
class CollapsibleScrollPhysics extends ScrollPhysics {
  final bool isAtMaxHeight;
  final VoidCallback? onCollapseTriggered;
  final bool isIOS;

  const CollapsibleScrollPhysics({
    super.parent,
    this.isAtMaxHeight = false,
    this.onCollapseTriggered,
    this.isIOS = false,
  });

  @override
  CollapsibleScrollPhysics applyTo(ScrollPhysics? ancestor) {
    return CollapsibleScrollPhysics(
      parent: buildParent(ancestor),
      isAtMaxHeight: isAtMaxHeight,
      onCollapseTriggered: onCollapseTriggered,
      isIOS: isIOS,
    );
  }

  @override
  double applyPhysicsToUserOffset(ScrollMetrics position, double offset) {
    // 如果已展开到最大高度且在顶部，向下拖拽时触发收起回调
    // iOS 需要更宽松的条件，因为 bouncing 效果会产生负值
    if (isAtMaxHeight &&
        ((isIOS && position.pixels <= 1.0) || (!isIOS && position.pixels <= 0)) &&
        offset > 0) {
      // 触发回调
      onCollapseTriggered?.call();
    }
    return super.applyPhysicsToUserOffset(position, offset);
  }

  @override
  Simulation? createBallisticSimulation(
      ScrollMetrics position, double velocity) {
    // 处理过度滚动时的弹性效果
    if (isIOS) {
      return super.createBallisticSimulation(position, velocity);
    }

    final isAtMaxHeight = this.isAtMaxHeight;
    final isScrollAtTop = position.pixels <= 0;

    // 如果在最大高度且在顶部且快速向下滚（过度滚动），触发收起
    if (isAtMaxHeight && isScrollAtTop && velocity < -800) {
      onCollapseTriggered?.call();
    }

    return super.createBallisticSimulation(position, velocity);
  }
}

/// 视频菜单操作
enum VideoMenuAction {
  play, // 立即播放
  favorite, // 收藏
  unfavorite, // 取消收藏
  deleteRecord, // 删除记录
  doubanDetail, // 豆瓣详情
  bangumiDetail, // Bangumi详情
}

class VideoMenuBottomSheet extends StatefulWidget {
  final VideoInfo videoInfo;
  final bool isFavorited;
  final Function(VideoMenuAction) onActionSelected;
  final VoidCallback onClose;
  final String from;
  final List<SearchResult>? originalResults;
  final Function(SearchResult)? onSourceSelected;

  const VideoMenuBottomSheet({
    super.key,
    required this.videoInfo,
    required this.isFavorited,
    required this.onActionSelected,
    required this.onClose,
    this.from = 'playrecord',
    this.originalResults,
    this.onSourceSelected,
  });

  /// 显示视频菜单底部弹窗
  static void show(
    BuildContext context, {
    required VideoInfo videoInfo,
    required bool isFavorited,
    required Function(VideoMenuAction) onActionSelected,
    String from = 'playrecord',
    List<SearchResult>? originalResults,
    Function(SearchResult)? onSourceSelected,
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      useSafeArea: true,
      builder: (context) => VideoMenuBottomSheet(
        videoInfo: videoInfo,
        isFavorited: isFavorited,
        onActionSelected: onActionSelected,
        onClose: () => Navigator.of(context).pop(),
        from: from,
        originalResults: originalResults,
        onSourceSelected: onSourceSelected,
      ),
    );
  }

  @override
  State<VideoMenuBottomSheet> createState() => _VideoMenuBottomSheetState();
}

class _VideoMenuBottomSheetState extends State<VideoMenuBottomSheet> {
  final GlobalKey _sheetKey = GlobalKey();
  final GlobalKey _fullContentKey = GlobalKey();
  final ScrollController _scrollController = ScrollController();

  double? _initialSheetHeight;
  double? _currentSheetHeight;
  double? _contentBasedMaxHeight;
  final double _maxSheetHeight =
      800; // 默认最大高度，实际会被 MediaQuery 的 0.8 倍覆盖

  // iOS 二段式滑动参数
  final double _dismissDragThreshold = 80.0; // 从初始高度向下拖拽多少关闭
  final double _dismissVelocityThreshold = 800.0; // 快速向下拖拽关闭的速度阈值

  bool _isLoadingDoubanDetails = false;
  bool _isLoadingBangumiDetails = false;
  DoubanMovieDetails? _doubanDetails;
  BangumiDetails? _bangumiDetails;

  bool _showScrollIndicator = true; // 是否显示顶部的滑动指示器
  bool _lockInnerScroll = false; // 是否锁定内部滚动（拖拽接管时）
  bool _isDraggingDown = false; // 是否正在向下拖拽
  bool _isInCollapsePhase = false; // 是否处于从展开态收起到初始态的阶段

  @override
  void initState() {
    super.initState();
    // 使用微任务在首帧后计算初始高度
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _captureInitialHeight();
    });

    // 检查是否需要加载豆瓣或 Bangumi 详情
    if (widget.videoInfo.doubanId != null) {
      _loadDoubanDetails();
    } else if (widget.videoInfo.bangumiId != null) {
      _loadBangumiDetails();
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  /// 捕获初始内容高度并设置初始状态
  void _captureInitialHeight() {
    if (!mounted) return;
    try {
      final RenderBox? renderBox =
          _sheetKey.currentContext?.findRenderObject() as RenderBox?;
      if (renderBox != null) {
        final height = renderBox.size.height;
        setState(() {
          _initialSheetHeight = height;
          _currentSheetHeight = height;
        });
      }
    } catch (e) {
      debugPrint('捕获初始高度失败: $e');
    }
  }

  /// 检查内容最大高度并决定是否需要扩展
  void _checkContentMaxHeight() {
    if (!mounted || _initialSheetHeight == null) return;
    try {
      final RenderBox? contentBox =
          _fullContentKey.currentContext?.findRenderObject() as RenderBox?;
      if (contentBox != null) {
        final double screenHeight = MediaQuery.of(context).size.height;
        final double contentHeight = contentBox.size.height;
        // 最大高度为屏幕的 0.8，但不能超过实际内容高度
        final double effectiveMax = contentHeight.clamp(
          _initialSheetHeight!,
          screenHeight * 0.8,
        );

        if (_contentBasedMaxHeight != effectiveMax) {
          setState(() {
            _contentBasedMaxHeight = effectiveMax;
          });
        }
      }
    } catch (e) {
      // 静默处理
    }
  }

  /// 处理从内部滚动触发的收起
  void _handleCollapseFromScroll() {
    if (_initialSheetHeight != null) {
      _animateToHeight(_initialSheetHeight!);
      setState(() {
        _showScrollIndicator = true;
      });
    }
  }

  /// 动画过渡到指定高度
  void _animateToHeight(double targetHeight) {
    if (_currentSheetHeight == targetHeight) return;

    // 使用 Tween 动画实现更平滑的高度过渡
    final double startHeight = _currentSheetHeight ?? _initialSheetHeight!;
    final controller = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: Navigator.of(context).overlay!,
    );

    final animation = Tween<double>(
      begin: startHeight,
      end: targetHeight,
    ).animate(CurvedAnimation(
      parent: controller,
      curve: Curves.easeOutCubic,
    ));

    animation.addListener(() {
      if (mounted) {
        setState(() {
          _currentSheetHeight = animation.value;
        });
      }
    });

    controller.forward().then((_) => controller.dispose());
  }

  /// 高性能更新高度（非动画）
  void _updateDragHeight(double newHeight, double maxHeight, bool isDraggingDown) {
    // 限制高度范围
    final double screenHeight = MediaQuery.of(context).size.height;
    final clampedHeight = newHeight.clamp(0.0, screenHeight * 0.8);

    if (_currentSheetHeight != clampedHeight) {
      setState(() {
        _currentSheetHeight = clampedHeight;
        // 如果高度显著增加，隐藏指示器；显著减少，显示指示器
        if (clampedHeight > (_initialSheetHeight ?? 0) + 20) {
          _showScrollIndicator = false;
        } else {
          _showScrollIndicator = true;
        }
      });
    }
  }

  /// 加载豆瓣详情
  Future<void> _loadDoubanDetails() async {
    final doubanId = widget.videoInfo.doubanId;
    if (doubanId == null) return;

    setState(() {
      _isLoadingDoubanDetails = true;
    });

    try {
      final response = await DoubanService.getDoubanDetails(context, doubanId: doubanId);
      if (mounted && response.success && response.data != null) {
        setState(() {
          _doubanDetails = response.data;
        });
        // 数据加载后，等待一帧获取新的内容高度
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _checkContentMaxHeight();
        });
      }
    } catch (e) {
      // 错误处理
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingDoubanDetails = false;
        });
      }
    }
  }

  /// 加载 Bangumi 详情
  Future<void> _loadBangumiDetails() async {
    final bangumiId = widget.videoInfo.bangumiId;
    if (bangumiId == null) return;

    setState(() {
      _isLoadingBangumiDetails = true;
    });

    try {
      final response =
          await BangumiService.getBangumiDetails(context, bangumiId: bangumiId.toString());
      if (mounted && response.success && response.data != null) {
        setState(() {
          _bangumiDetails = response.data;
        });
        // 数据加载后，等待一帧获取新的内容高度
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _checkContentMaxHeight();
        });
      }
    } catch (e) {
      // 错误处理
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingBangumiDetails = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<ThemeService>(
      builder: (context, themeService, child) {
        return FutureBuilder<List<dynamic>>(
          future: getImageUrl(widget.videoInfo.cover, widget.videoInfo.source).then((url) async {
            final headers = await getImageRequestHeaders(url, widget.videoInfo.source);
            return [url, headers];
          }),
          builder: (context, snapshot) {
            final String thumbUrl = snapshot.hasData ? snapshot.data![0] as String : widget.videoInfo.cover;
            final Map<String, String>? headers = snapshot.hasData ? snapshot.data![1] as Map<String, String>? : null;
            
            return GestureDetector(
              behavior: HitTestBehavior.translucent,
              onPanStart: (details) {
                // 拖动开始时，确保当前高度存在
                if ((_doubanDetails != null || _bangumiDetails != null) && _initialSheetHeight != null && _currentSheetHeight == null) {
                  _currentSheetHeight = _initialSheetHeight;
                }
              },
              onPanUpdate: (details) {
                if ((_doubanDetails != null || _bangumiDetails != null) && _initialSheetHeight != null) {
                  // 检查是否应该响应拖拽
                  final isAtMaxHeight = _currentSheetHeight != null && _currentSheetHeight! >= (_contentBasedMaxHeight ?? _maxSheetHeight) - 1;
                  final isScrollAtTop = !_scrollController.hasClients || _scrollController.offset <= 0;
                  final isDraggingUp = details.delta.dy < 0; // 向上拖拽
                  final isDraggingDown = details.delta.dy > 0; // 向下拖拽

                  // 更新拖拽方向状态，减少setState调用
                  if (_isDraggingDown != isDraggingDown) {
                    _isDraggingDown = isDraggingDown;
                  }

                  // 如果已经在最大高度且内容可滚动且不在顶部，并且是向上拖拽，则不响应
                  if (isAtMaxHeight && _scrollController.hasClients && !isScrollAtTop && isDraggingUp) {
                    return;
                  }

                  // 在已展开+到顶+向下拖拽时，锁定内部滚动，让外层接管
                  final shouldLockInnerScroll = isAtMaxHeight && isScrollAtTop && isDraggingDown;
                  if (shouldLockInnerScroll && !_lockInnerScroll) {
                    _lockInnerScroll = true;
                    _isInCollapsePhase = true; // 开始收起阶段
                  }

                  final delta = -details.delta.dy; // 负值表示向上拖拽
                  final newHeight = (_currentSheetHeight ?? _initialSheetHeight!) + delta;

                  // 使用内容基础的最大高度，如果没有则使用屏幕基础的最大高度
                  final effectiveMaxHeight = _contentBasedMaxHeight ?? _maxSheetHeight;

                  // iOS 二段式滑动逻辑
                  if (_isIOS && _isInCollapsePhase) {
                    // 第一阶段：从最大高度收起到初始高度
                    if (isDraggingDown && _currentSheetHeight! > _initialSheetHeight!) {
                      // 使用高效的拖拽高度更新
                      _updateDragHeight(newHeight, effectiveMaxHeight, isDraggingDown);
                      return;
                    }

                    // 如果已经到达初始高度，继续向下拖拽则进入第二阶段（关闭弹窗）
                    if (isDraggingDown && _currentSheetHeight! <= _initialSheetHeight! + 1) {
                      // 第二阶段：从初始高度继续向下拖拽，超过阈值则关闭
                      if (newHeight < _initialSheetHeight! - _dismissDragThreshold) {
                        widget.onClose();
                        return;
                      }
                      // 否则保持在初始高度
                      _updateDragHeight(_initialSheetHeight!, effectiveMaxHeight, isDraggingDown);
                      return;
                    }
                  } else {
                    // 使用高效的拖拽高度更新
                    _updateDragHeight(newHeight, effectiveMaxHeight, isDraggingDown);
                  }
                }
              },
              onPanEnd: (details) {
                // 拖动结束时的吸附逻辑
                if ((_doubanDetails != null || _bangumiDetails != null) && _initialSheetHeight != null && _currentSheetHeight != null) {
                  final velocity = details.velocity.pixelsPerSecond.dy; // 向下为正
                  final effectiveMaxHeight = _contentBasedMaxHeight ?? _maxSheetHeight;
                  
                  // iOS 二段式滑动结束处理
                  if (_isIOS && _isInCollapsePhase) {
                    // 如果在初始高度附近并快速向下，关闭弹窗
                    if (_currentSheetHeight! <= _initialSheetHeight! + 1 && velocity > _dismissVelocityThreshold) {
                      widget.onClose();
                      return;
                    }
                    
                    // 如果还在收起阶段（高度大于初始高度），吸附到初始高度
                    if (_currentSheetHeight! > _initialSheetHeight! + 1) {
                      _animateToHeight(_initialSheetHeight!);
                      setState(() {
                        _showScrollIndicator = true;
                      });
                    }
                  } else {
                    // 非iOS或非收起阶段的正常逻辑
                    // 如果在初始高度附近并快速向下，关闭弹窗
                    if (_currentSheetHeight! <= _initialSheetHeight! + 1 && velocity > _dismissVelocityThreshold) {
                      widget.onClose();
                      return;
                    }
                    
                    // iOS 需要更敏感的阈值，因为 bouncing 效果会消耗一些速度
                    final velocityThreshold = _isIOS ? 400.0 : 800.0;
                    final negativeVelocityThreshold = _isIOS ? -400.0 : -800.0;

                    if (velocity > velocityThreshold) {
                      // 向下快速拖动 - 无论什么状态都尝试收起菜单
                      _animateToHeight(_initialSheetHeight!);
                      setState(() {
                        _showScrollIndicator = true;
                      });
                    } else if (velocity < negativeVelocityThreshold) {
                      // 向上快速拖动，展开到最大高度
                      _animateToHeight(effectiveMaxHeight);
                      setState(() {
                        _showScrollIndicator = false;
                      });
                    }
                  }
                  
                  // 拖拽结束后，解除内部滚动锁并重置所有状态
                  setState(() {
                    if (_lockInnerScroll) {
                      _lockInnerScroll = false;
                    }
                    // 重置拖拽方向状态 and 收起阶段状态
                    _isDraggingDown = false;
                    _isInCollapsePhase = false;
                  });
                }
              },
              child: Container(
                key: _sheetKey,
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(context).size.height * 0.8,
                ),
                height: _currentSheetHeight,
                decoration: BoxDecoration(
                  color: themeService.isDarkMode 
                      ? const Color(0xFF2C2C2C)
                      : Colors.white,
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(16),
                    topRight: Radius.circular(16),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.1),
                      blurRadius: 10,
                      offset: const Offset(0, -2),
                    ),
                  ],
                ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // 可滚动内容 + 悬浮下滑箭头
                  Flexible(
                    child: Stack(
                      children: [
                          // 使用 ClipRect 确保内容不会溢出
                          ClipRect(
                            child: NotificationListener<ScrollNotification>(
                              onNotification: (notification) {
                                // 监听过度滚动通知，作为备用方案
                                if (notification is OverscrollNotification) {
                                  final isAtTop = notification.metrics.pixels <= (_isIOS ? 1.0 : 0.0);
                                  final isOverscrollingDown = notification.overscroll > 0;
                                  final velocity = notification.velocity;

                                  // iOS 需要更宽松的条件，因为 bouncing 效果
                                  final velocityThreshold = _isIOS ? 400.0 : 800.0;

                                  if (isAtTop && isOverscrollingDown && velocity > velocityThreshold) {
                                    final isAtMaxHeight = _currentSheetHeight != null &&
                                        _currentSheetHeight! >= (_contentBasedMaxHeight ?? _maxSheetHeight) - 1;

                                    if (isAtMaxHeight) {
                                      _animateToHeight(_initialSheetHeight!);
                                      setState(() {
                                        _showScrollIndicator = true;
                                      });
                                    }
                                  }
                                }

                                return false; // 继续传递通知
                              },
                              child: SingleChildScrollView(
                                controller: _scrollController,
                                // 滚动物理控制：使用自定义物理处理展开状态下的顶部向下拖拽
                                physics: (() {
                                  final isAtMaxHeight = _currentSheetHeight != null && 
                                      _currentSheetHeight! >= (_contentBasedMaxHeight ?? _maxSheetHeight) - 1;
                                  
                                  // 当菜单高度小于最大高度时，完全禁用滚动让拖拽控制高度
                                  final shouldCompletelyDisable = (_currentSheetHeight != null && 
                                      (_contentBasedMaxHeight == null || _currentSheetHeight! < _contentBasedMaxHeight!)) 
                                      || _lockInnerScroll;
                                  
                                  if (shouldCompletelyDisable) {
                                    return const NeverScrollableScrollPhysics();
                                  }
                                  
                                  // 使用自定义物理，在展开状态下处理顶部向下拖拽
                                  return CollapsibleScrollPhysics(
                                    isAtMaxHeight: isAtMaxHeight,
                                    onCollapseTriggered: _handleCollapseFromScroll,
                                    isIOS: _isIOS,
                                  );
                                })(),
                              child: Container(
                                key: _fullContentKey,
                                child: Column(
                                  children: [
                                  // 头部信息区域
                                  Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Row(
                                      children: [
                                        // 缩略图
                                        GestureDetector(
                                          onTap: () {
                                            FullscreenImageViewer.show(
                                              context,
                                              imageUrl: thumbUrl,
                                              source: widget.videoInfo.source,
                                              title: widget.videoInfo.title,
                                            );
                                          },
                                          child: Container(
                                            width: 60,
                                            height: 80,
                                            decoration: BoxDecoration(
                                              borderRadius: BorderRadius.circular(8),
                                              boxShadow: [
                                                BoxShadow(
                                                  color: Colors.black.withValues(alpha: 0.1),
                                                  blurRadius: 4,
                                                  offset: const Offset(0, 2),
                                                ),
                                              ],
                                            ),
                                            child: ClipRRect(
                                              borderRadius: BorderRadius.circular(8),
                                              child: CachedNetworkImage(
                                                imageUrl: thumbUrl,
                                                httpHeaders: headers,
                                                fit: BoxFit.cover,
                                                // 优化图片加载，避免动画卡顿
                                                memCacheWidth: 120, // 限制内存缓存大小
                                                memCacheHeight: 160,
                                                fadeInDuration: const Duration(milliseconds: 150), // 更快的淡入动画
                                                fadeOutDuration: const Duration(milliseconds: 100),
                                                placeholder: (context, url) => Container(
                                                  color: themeService.isDarkMode
                                                      ? const Color(0xFF333333)
                                                      : Colors.grey[300],
                                                  child: Icon(
                                                    Icons.movie,
                                                    color: themeService.isDarkMode
                                                        ? const Color(0xFF666666)
                                                        : Colors.grey,
                                                    size: 30,
                                                  ),
                                                ),
                                                errorWidget: (context, url, error) => Container(
                                                  color: themeService.isDarkMode
                                                      ? const Color(0xFF333333)
                                                      : Colors.grey[300],
                                                  child: Icon(
                                                    Icons.movie,
                                                    color: themeService.isDarkMode
                                                        ? const Color(0xFF666666)
                                                        : Colors.grey,
                                                    size: 30,
                                                  ),
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 16),
                                        // 标题和副标题
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                widget.videoInfo.title,
                                                style: FontUtils.poppins(
                                                  fontSize: 18,
                                                  fontWeight: FontWeight.w600,
                                                  color: themeService.isDarkMode
                                                      ? Colors.white
                                                      : const Color(0xFF2c3e50),
                                                ),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                              const SizedBox(height: 4),
                                              Text(
                                                '${widget.videoInfo.sourceName} · ${widget.videoInfo.year}',
                                                style: FontUtils.poppins(
                                                  fontSize: 14,
                                                  color: themeService.isDarkMode
                                                      ? Colors.white70
                                                      : const Color(0xFF7f8c8d),
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  // 分隔线
                                  Divider(
                                    height: 1,
                                    color: themeService.isDarkMode
                                        ? Colors.white12
                                        : Colors.black12,
                                  ),
                                  // 豆瓣/Bangumi 详情区域
                                  if (widget.videoInfo.doubanId != null ||
                                      widget.videoInfo.bangumiId != null)
                                    _buildExtraDetails(themeService),
                                  // 操作菜单区域
                                  _buildActionMenu(themeService),
                                  // 底部安全距离
                                  SizedBox(
                                      height: MediaQuery.of(context)
                                          .padding
                                          .bottom),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                        // 浮动悬挂的下拉提示箭头
                        if ((_doubanDetails != null || _bangumiDetails != null) && _showScrollIndicator)
                          Positioned(
                            top: 0,
                            left: 0,
                            right: 0,
                            child: IgnorePointer(
                              child: Container(
                                height: 30,
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [
                                      themeService.isDarkMode 
                                          ? const Color(0xFF2C2C2C).withValues(alpha: 0.9)
                                          : Colors.white.withValues(alpha: 0.9),
                                      Colors.transparent,
                                    ],
                                  ),
                                ),
                                child: Center(
                                  child: Container(
                                    width: 40,
                                    height: 4,
                                    decoration: BoxDecoration(
                                      color: themeService.isDarkMode
                                          ? Colors.white24
                                          : Colors.black12,
                                      borderRadius: BorderRadius.circular(2),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              ),
            );
          },
        );
      },
    );
  }

  /// 构建操作菜单
  Widget _buildActionMenu(ThemeService themeService) {
    final bool isDark = themeService.isDarkMode;
    final Color textColor = isDark ? Colors.white : const Color(0xFF2c3e50);

    return Column(
      children: [
        // 播放操作
        _buildMenuItem(
          icon: Icons.play_arrow_rounded,
          title: '立即播放',
          color: const Color(0xFF27ae60),
          onTap: () {
            widget.onClose();
            widget.onActionSelected(VideoMenuAction.play);
          },
          isDark: isDark,
        ),
        // 收藏/取消收藏
        _buildMenuItem(
          icon: widget.isFavorited ? Icons.favorite : Icons.favorite_border,
          title: widget.isFavorited ? '取消收藏' : '添加收藏',
          color: widget.isFavorited ? const Color(0xFFe74c3c) : textColor,
          onTap: () {
            widget.onClose();
            widget.onActionSelected(
              widget.isFavorited
                  ? VideoMenuAction.unfavorite
                  : VideoMenuAction.favorite,
            );
          },
          isDark: isDark,
        ),
        // 更多播放源（如果是聚合模式）
        if (widget.from == 'agg' &&
            widget.originalResults != null &&
            widget.originalResults!.isNotEmpty)
          _buildMenuItem(
            icon: Icons.list_alt_rounded,
            title: '切换播放源 (${widget.originalResults!.length})',
            color: const Color(0xFF9b59b6),
            onTap: () {
              widget.onClose();
              _showSourcesList();
            },
            isDark: isDark,
          ),
        // 豆瓣详情（如果有豆瓣ID）
        if (widget.videoInfo.doubanId != null)
          _buildMenuItem(
            icon: Icons.movie_filter_rounded,
            title: '查看豆瓣详情',
            color: const Color(0xFF2ecc71),
            onTap: () async {
              widget.onClose();
              final url =
                  'https://movie.douban.com/subject/${widget.videoInfo.doubanId}';
              final uri = Uri.parse(url);
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
            },
            isDark: isDark,
          ),
        // Bangumi 详情（如果有 Bangumi ID）
        if (widget.videoInfo.bangumiId != null)
          _buildMenuItem(
            icon: Icons.animation_rounded,
            title: '查看 Bangumi 详情',
            color: const Color(0xFFe91e63),
            onTap: () async {
              widget.onClose();
              final url = 'https://bgm.tv/subject/${widget.videoInfo.bangumiId}';
              final uri = Uri.parse(url);
              if (await canLaunchUrl(uri)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
            },
            isDark: isDark,
          ),
        // 删除记录
        _buildMenuItem(
          icon: Icons.delete_outline_rounded,
          title: '删除观看记录',
          color: const Color(0xFFe74c3c),
          onTap: () {
            widget.onClose();
            widget.onActionSelected(VideoMenuAction.deleteRecord);
          },
          isDark: isDark,
        ),
      ],
    );
  }

  /// 构建单个菜单项
  Widget _buildMenuItem({
    required IconData icon,
    required String title,
    required Color color,
    required VoidCallback onTap,
    required bool isDark,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          child: Row(
            children: [
              Icon(icon, color: color, size: 24),
              const SizedBox(width: 16),
              Text(
                title,
                style: FontUtils.poppins(
                  fontSize: 16,
                  color: isDark ? Colors.white : const Color(0xFF2c3e50),
                ),
              ),
              const Spacer(),
              Icon(
                Icons.chevron_right_rounded,
                color: isDark ? Colors.white24 : Colors.black12,
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// 构建额外的详情区域（豆瓣/Bangumi）
  Widget _buildExtraDetails(ThemeService themeService) {
    if (_isLoadingDoubanDetails || _isLoadingBangumiDetails) {
      return Container(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: CircularProgressIndicator(
            color: themeService.isDarkMode ? Colors.white70 : Colors.black45,
            strokeWidth: 2,
          ),
        ),
      );
    }

    if (_doubanDetails == null && _bangumiDetails == null) {
      return const SizedBox.shrink();
    }

    final isDark = themeService.isDarkMode;
    final textColor = isDark ? Colors.white : const Color(0xFF2c3e50);
    final secondaryTextColor = isDark ? Colors.white70 : const Color(0xFF7f8c8d);

    // 根据是豆瓣还是 Bangumi 渲染不同的详情
    if (_doubanDetails != null) {
      return _buildDoubanSection(textColor, secondaryTextColor, isDark);
    } else {
      return _buildBangumiSection(textColor, secondaryTextColor, isDark);
    }
  }

  /// 构建豆瓣详情区块
  Widget _buildDoubanSection(
      Color textColor, Color secondaryTextColor, bool isDark) {
    final detail = _doubanDetails!;
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 评分和标签
          Row(
            children: [
              if (detail.rate != null && detail.rate!.isNotEmpty) ...[
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFF9800),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '豆瓣 ${detail.rate}',
                    style: FontUtils.poppins(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              if (detail.genres.isNotEmpty)
                Expanded(
                  child: Text(
                    detail.genres.join(' / '),
                    style: FontUtils.poppins(
                      fontSize: 12,
                      color: secondaryTextColor,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          // 演职人员
          if (detail.directors.isNotEmpty || detail.actors.isNotEmpty)
            Text(
              '${detail.directors.join(', ')} / ${detail.actors.join(', ')}',
              style: FontUtils.poppins(
                fontSize: 13,
                color: secondaryTextColor,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          const SizedBox(height: 12),
          // 剧情简介
          if (detail.summary != null) ...[
            Text(
              '剧情简介',
              style: FontUtils.poppins(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: textColor,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              detail.summary!.trim(),
              style: FontUtils.poppins(
                fontSize: 14,
                color: secondaryTextColor,
                height: 1.5,
              ),
              maxLines: 6,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }

  /// 构建 Bangumi 详情区块
  Widget _buildBangumiSection(
      Color textColor, Color secondaryTextColor, bool isDark) {
    final detail = _bangumiDetails!;
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 评分和标签
          Row(
            children: [
              if (detail.rating.score > 0) ...[
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE91E63),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    'BGM ${detail.rating.score}',
                    style: FontUtils.poppins(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Text(
                '共 ${detail.eps} 话 · ${detail.date ?? '未知'}',
                style: FontUtils.poppins(
                  fontSize: 12,
                  color: secondaryTextColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // 简介
          if (detail.summary.isNotEmpty) ...[
            Text(
              '内容简介',
              style: FontUtils.poppins(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: textColor,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              detail.summary.trim(),
              style: FontUtils.poppins(
                fontSize: 14,
                color: secondaryTextColor,
                height: 1.5,
              ),
              maxLines: 6,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }

  /// 显示播放源列表
  void _showSourcesList() {
    final sources = widget.originalResults;
    if (sources == null || sources.isEmpty) return;

    final themeService = Provider.of<ThemeService>(context, listen: false);

    showDialog(
      context: context,
      builder: (BuildContext context) {
        return Dialog(
          backgroundColor: Colors.transparent,
          child: Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.6,
              maxWidth: 320,
            ),
            decoration: BoxDecoration(
              color: themeService.isDarkMode
                  ? const Color(0xFF2C2C2C)
                  : Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Text(
                    '可用播放源',
                    style: FontUtils.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: sources.length,
                    itemBuilder: (context, index) {
                      final source = sources[index];
                      return ListTile(
                        title: Text(
                          source.sourceName,
                          style: FontUtils.poppins(fontSize: 16),
                        ),
                        trailing: Text(
                          '${source.episodes.length} 集',
                          style: FontUtils.poppins(
                            fontSize: 14,
                            color: Colors.grey,
                          ),
                        ),
                        onTap: () {
                          Navigator.of(context).pop();
                          widget.onSourceSelected?.call(source);
                        },
                      );
                    },
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        );
      },
    );
  }
}
