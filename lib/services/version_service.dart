import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

class VersionService {
  static const String _syncRepo = String.fromEnvironment('SYNC_REPO', defaultValue: '');
  static const String _lastCheckKey = 'last_version_check';
  static const String _dismissedVersionKey = 'dismissed_version';
  
  /// 获取元数据 URL (包含版本和 APK 大小)
  static String _getMetadataUrl() {
    if (_syncRepo.isEmpty) return '';
    // 目标仓库：$_syncRepo
    return 'https://ghfast.top/https://raw.githubusercontent.com/$_syncRepo/main/log/vision/metadata.json?t=${DateTime.now().millisecondsSinceEpoch}';
  }

  /// 获取下载 URL
  static String getDownloadUrl(String version) {
    if (_syncRepo.isEmpty) return '';
    // 使用 ghfast.top 代理加速 GitHub Release 下载
    // 链接指向目标仓库：$_syncRepo
    return 'https://ghfast.top/https://github.com/$_syncRepo/releases/download/v$version/SuperTV-v$version-Android.apk';
  }

  /// 获取 Release 页面 URL
  static String getReleaseUrl(String version) {
    if (_syncRepo.isEmpty) {
      return 'https://github.com/SuperTV/SuperTV/releases/tag/v$version';
    }
    return 'https://github.com/$_syncRepo/releases/tag/v$version';
  }
  
  /// 检查是否有新版本
  static Future<VersionInfo?> checkForUpdate() async {
    try {
      final metadataUrl = _getMetadataUrl();
      if (metadataUrl.isEmpty) {
        print('SYNC_REPO 未配置，跳过更新检查');
        return null;
      }

      // 获取当前版本
      final packageInfo = await PackageInfo.fromPlatform();
      // 在 Android 平台，我们设置了 versionName 为 6.0.0.523，
      // 在 Windows 平台，我们也硬编码了 6.0.0.523。
      // packageInfo.version 在这些平台通常会返回完整版本号。
      String currentVersion = packageInfo.version;
      
      // 如果版本号不包含构建号且构建号存在，尝试拼接 (适配部分平台的默认行为)
      if (!currentVersion.contains(packageInfo.buildNumber) && packageInfo.buildNumber.isNotEmpty) {
        if (currentVersion == '6.0.0') {
           currentVersion = '6.0.0.523'; // 强制匹配目标版本格式
        } else {
           currentVersion = '$currentVersion.${packageInfo.buildNumber}';
        }
      }
      
      // 1. 获取最新元数据 (包含版本、大小、日志等)
      final response = await http.get(Uri.parse(metadataUrl)).timeout(const Duration(seconds: 10));
      if (response.statusCode != 200) return null;

      final data = json.decode(response.body);
      final latestVersion = data['version'] as String;
      final apkSize = data['apksize'] != null ? int.tryParse(data['apksize'].toString()) : null;
      
      // 2. 比较版本号
      if (_isNewerVersion(currentVersion, latestVersion)) {
        return VersionInfo(
          currentVersion: currentVersion,
          latestVersion: latestVersion,
          releaseNotes: data['releaseNotes'] ?? '修复已知问题，优化用户体验。',
          apkSize: apkSize,
        );
      }
      
      return null;
    } catch (e) {
      print('检查版本更新失败: $e');
      return null;
    }
  }
  
  /// 比较版本号，判断是否有新版本
  static bool _isNewerVersion(String current, String latest) {
    try {
      final currentParts = current.split('.').map((e) => int.tryParse(e) ?? 0).toList();
      final latestParts = latest.split('.').map((e) => int.tryParse(e) ?? 0).toList();
      
      final length = currentParts.length > latestParts.length ? currentParts.length : latestParts.length;
      
      for (int i = 0; i < length; i++) {
        final currentPart = i < currentParts.length ? currentParts[i] : 0;
        final latestPart = i < latestParts.length ? latestParts[i] : 0;
        
        if (latestPart > currentPart) return true;
        if (latestPart < currentPart) return false;
      }
    } catch (e) {
      print('版本号比较出错: $e');
    }
    return false;
  }
  
  /// 检查是否应该显示更新提示（避免频繁提示）
  static Future<bool> shouldShowUpdatePrompt(String version) async {
    final prefs = await SharedPreferences.getInstance();
    
    // 检查用户是否已忽略此版本
    final dismissedVersion = prefs.getString(_dismissedVersionKey);
    if (dismissedVersion == version) {
      return false;
    }
    
    // 检查上次检查时间（每天最多提示一次）
    final lastCheck = prefs.getInt(_lastCheckKey) ?? 0;
    final now = DateTime.now().millisecondsSinceEpoch;
    final dayInMs = 24 * 60 * 60 * 1000;
    
    if (now - lastCheck < dayInMs) {
      return false;
    }
    
    // 更新最后检查时间
    await prefs.setInt(_lastCheckKey, now);
    return true;
  }
  
  /// 标记用户已忽略某个版本
  static Future<void> dismissVersion(String version) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_dismissedVersionKey, version);
  }
  
  /// 清除忽略记录（用于测试或重置）
  static Future<void> clearDismissedVersion() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_dismissedVersionKey);
  }
}

class VersionInfo {
  final String currentVersion;
  final String latestVersion;
  final String releaseNotes;
  final int? apkSize;
  
  VersionInfo({
    required this.currentVersion,
    required this.latestVersion,
    required this.releaseNotes,
    this.apkSize,
  });

  String get formattedApkSize {
    if (apkSize == null) return '未知大小';
    if (apkSize! < 1024 * 1024) {
      return '${(apkSize! / 1024).toStringAsFixed(2)} KB';
    }
    return '${(apkSize! / (1024 * 1024)).toStringAsFixed(2)} MB';
  }
}
