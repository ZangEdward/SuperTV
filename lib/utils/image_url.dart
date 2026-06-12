// 通用图片地址处理工具
import '../services/user_data_service.dart';

/// 根据来源处理图片 URL（例如豆瓣域名替换）。
/// - [originalUrl]: 原始图片地址
/// - [source]: 数据来源（如 'douban'、'bangumi' 等）
/// 返回可直接用于加载的图片地址。
Future<String> getImageUrl(String originalUrl, String? source) async {
  if (source == 'douban' && originalUrl.isNotEmpty) {
    final imageSourceKey = await UserDataService.getDoubanImageSourceKey();
    
    switch (imageSourceKey) {
      case 'official_cdn':
        return originalUrl.replaceAll(
          RegExp(r'img\d+\.doubanio\.com'),
          'img3.doubanio.com',
        );
      case 'cdn_tencent':
        return originalUrl.replaceAll(
          RegExp(r'img\d+\.doubanio\.com'),
          'img.doubanio.cmliussss.net',
        );
      case 'cdn_aliyun':
        return originalUrl.replaceAll(
          RegExp(r'img\d+\.doubanio\.com'),
          'img.doubanio.cmliussss.com',
        );
      case 'direct':
      default:
        return originalUrl;
    }
  }

  if (source == 'bangumi' && originalUrl.isNotEmpty) {
    final imageSourceKey = await UserDataService.getBangumiImageSourceKey();
    if (imageSourceKey == 'proxy') {
      final serverUrl = await UserDataService.getServerUrl();
      if (serverUrl != null && serverUrl.isNotEmpty) {
        String cleanBaseUrl = serverUrl.endsWith('/')
            ? serverUrl.substring(0, serverUrl.length - 1)
            : serverUrl;
        // 使用服务器的通用图片代理接口，并对原始 URL 进行编码
        return '$cleanBaseUrl/api/image-proxy?url=${Uri.encodeComponent(originalUrl)}';
      }
    } else if (imageSourceKey == 'cdn_tencent') {
      return originalUrl.replaceAll(
        RegExp(r'lain\.bgm\.tv'),
        'lain.bgm.tv.cmliussss.net',
      );
    } else if (imageSourceKey == 'cdn_aliyun') {
      return originalUrl.replaceAll(
        RegExp(r'lain\.bgm\.tv'),
        'lain.bgm.tv.cmliussss.com',
      );
    }
  }

  return originalUrl;
}

/// 返回加载网络图片所需的 HTTP 头（主要用于绕过特定站点的反盗链）。
/// 注意：只有当 [source] 为 'douban'/'bangumi' 或 URL 指向对应域名时才添加 Referer/UA。其他来源返回空头。
Map<String, String>? getImageRequestHeaders(String imageUrl, String? source) {
  final bool isDoubanSource = (source == 'douban') ||
      RegExp(r'https?://([^/]+\.)?douban(io|)\.com', caseSensitive: false)
          .hasMatch(imageUrl);
          
  final bool isBangumiSource = (source == 'bangumi') ||
      RegExp(r'https?://([^/]+\.)?bgm\.tv', caseSensitive: false)
          .hasMatch(imageUrl);

  if (isDoubanSource) {
    // 常见可用的 Referer 和 UA，避免 403 或 Android 解码失败
    // 移除 image/avif 以避免部分 Android 设备因无法解码 AVIF 格式而报错
    return <String, String>{
      'Referer': 'https://movie.douban.com/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
    };
  }
  
  if (isBangumiSource) {
    return <String, String>{
      'Referer': 'https://bgm.tv/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
    };
  }
  
  return null;
}


