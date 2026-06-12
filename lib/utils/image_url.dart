// 通用图片地址处理工具
import 'package:flutter/foundation.dart';
import '../services/user_data_service.dart';

/// 根据来源处理图片 URL（例如豆瓣域名替换）。
/// - [originalUrl]: 原始图片地址
/// - [source]: 数据来源（如 'douban'、'bangumi' 等）
/// 返回可直接用于加载的图片地址。
Future<String> getImageUrl(String originalUrl, String? source) async {
  debugPrint('[SuperTV] Processing image URL: "$originalUrl" (source: $source)');
  
  if (originalUrl.isEmpty) {
    debugPrint('[SuperTV] URL is empty, returning empty string');
    return '';
  }

  // 处理协议相对路径
  String url = originalUrl;
  if (url.startsWith('//')) {
    url = 'https:$url';
  }

  String processedUrl = url;

  if (source == 'douban') {
    final imageSourceKey = await UserDataService.getDoubanImageSourceKey();
    debugPrint('[SuperTV] Douban image source key: $imageSourceKey');
    
    switch (imageSourceKey) {
      case 'official_cdn':
        processedUrl = url.replaceAll(
          RegExp(r'img\d+\.doubanio\.com'),
          'img3.doubanio.com',
        );
        break;
      case 'cdn_tencent':
        processedUrl = url.replaceAll(
          RegExp(r'img\d+\.doubanio\.com'),
          'img.doubanio.cmliussss.net',
        );
        break;
      case 'cdn_aliyun':
        processedUrl = url.replaceAll(
          RegExp(r'img\d+\.doubanio\.com'),
          'img.doubanio.cmliussss.com',
        );
        break;
      case 'direct':
      default:
        processedUrl = url;
        break;
    }
  } else if (source == 'bangumi') {
    final imageSourceKey = await UserDataService.getBangumiImageSourceKey();
    debugPrint('[SuperTV] Bangumi image source key: $imageSourceKey');

    if (imageSourceKey == 'proxy') {
      final serverUrl = await UserDataService.getServerUrl();
      if (serverUrl != null && serverUrl.isNotEmpty) {
        String cleanBaseUrl = serverUrl.endsWith('/')
            ? serverUrl.substring(0, serverUrl.length - 1)
            : serverUrl;
        // 使用服务器的通用图片代理接口，并对原始 URL 进行编码
        processedUrl = '$cleanBaseUrl/api/image-proxy?url=${Uri.encodeComponent(url)}';
      }
    }
  }

  if (processedUrl != url) {
    debugPrint('[SuperTV] Final processed URL: $processedUrl');
  }

  return processedUrl;
}

/// 返回加载网络图片所需的 HTTP 头（主要用于绕过特定站点的反盗链）。
/// 注意：只有当 [source] 为 'douban'/'bangumi' 或 URL 指向对应域名时才添加 Referer/UA。其他来源返回空头。
Future<Map<String, String>?> getImageRequestHeaders(String imageUrl, String? source) async {
  debugPrint('[SuperTV] Getting headers for: $imageUrl (source: $source)');

  final bool isDoubanSource = (source == 'douban') ||
      RegExp(r'https?://([^/]+\.)?douban(io|)\.com', caseSensitive: false)
          .hasMatch(imageUrl);
          
  final bool isBangumiSource = (source == 'bangumi') ||
      RegExp(r'https?://([^/]+\.)?(bgm\.tv|bangumi\.tv)', caseSensitive: false)
          .hasMatch(imageUrl);

  Map<String, String>? headers;

  if (isDoubanSource) {
    // 豆瓣对 Referer 校验极其严格，且不同子域名（img3, img9 等）策略不同
    // 经测试，在 App 中直连请求时，不发送 Referer 且使用通用的桌面端 User-Agent 稳定性最高
    // 避免使用 movie.douban.com 的 Referer，那会导致 418 (I'm a teapot) 拦截
    headers = <String, String>{
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
    };
  } else if (isBangumiSource) {
    headers = <String, String>{
      'Referer': 'https://bgm.tv/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Connection': 'keep-alive',
    };
    
    // 只有在直接访问官方域名时才添加 Host 头，避免干扰 CDN 或代理节点
    try {
      final uri = Uri.parse(imageUrl);
      if (uri.host == 'lain.bgm.tv') {
        headers['Host'] = 'lain.bgm.tv';
      } else if (uri.host == 'lain.bangumi.tv') {
        headers['Host'] = 'lain.bangumi.tv';
      }
    } catch (_) {}
  }

  // 如果 URL 指向的是用户自己的服务器地址，需要添加身份认证 Cookie
  final serverUrl = await UserDataService.getServerUrl();
  if (serverUrl != null && serverUrl.isNotEmpty) {
    try {
      final uri = Uri.parse(imageUrl);
      final serverUri = Uri.parse(serverUrl);
      if (uri.host == serverUri.host) {
        final cookies = await UserDataService.getCookies();
        if (cookies != null && cookies.isNotEmpty) {
          headers ??= <String, String>{};
          headers['Cookie'] = cookies;
          debugPrint('[SuperTV] Added auth cookies for server proxy request');
        }
      }
    } catch (e) {
      debugPrint('[SuperTV] Error parsing URLs for header check: $e');
    }
  }

  if (headers != null) {
    debugPrint('[SuperTV] Final Headers: $headers');
  }
  
  return headers;
}


