import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../models/bangumi.dart';
import 'package:supertv/services/api_service.dart';
import 'package:supertv/services/douban_cache_service.dart';
import 'package:supertv/services/user_data_service.dart';

/// Bangumi 数据服务（函数级缓存，一天过期）
class BangumiService {
  static final DoubanCacheService _cache = DoubanCacheService();
  static bool _initialized = false;

  static Future<void> _initCache() async {
    if (!_initialized) {
      await _cache.init();
      _initialized = true;
    }
  }

  /// 清除 Bangumi 相关缓存
  static Future<void> clearCache() async {
    await _initCache();
    // 清除所有可能的数据源日历缓存
    final sources = ['client', 'forward', 'proxy', 'direct'];
    for (final source in sources) {
      await _cache.delete('bangumi_calendar_${source}_v1');
    }
    // 注意：bangumi_details 缓存由于 key 包含 ID，暂时不批量清理
  }

  /// 获取当天的新番放送（根据当前星期几）
  static Future<ApiResponse<List<BangumiItem>>> getTodayCalendar(
    BuildContext context,
  ) async {
    final weekday = DateTime.now().weekday; // 1..7
    return getCalendarByWeekday(context, weekday);
  }

  /// 获取指定星期的新番放送
  static Future<ApiResponse<List<BangumiItem>>> getCalendarByWeekday(
    BuildContext context,
    int weekday, // 1..7 (Monday..Sunday)
  ) async {
    await _initCache();

    final dataSource = await UserDataService.getBangumiDataSourceKey();
    // 接口级缓存：缓存原始 API 数组，包含数据源标识
    final cacheKey = 'bangumi_calendar_${dataSource}_v1';

    // 先尝试读取原始数组缓存
    try {
      final cachedRaw = await _cache.get<List<dynamic>>(
        cacheKey,
        (raw) => raw as List<dynamic>,
      );
      if (cachedRaw != null && cachedRaw.isNotEmpty) {
        final calendar = cachedRaw
            .map((item) => BangumiCalendarResponse.fromJson(item as Map<String, dynamic>))
            .toList();
        BangumiCalendarResponse? targetDay;
        for (final day in calendar) {
          if (day.weekday.id == weekday) {
            targetDay = day;
            break;
          }
        }
        final items = targetDay?.items ?? <BangumiItem>[];
        return ApiResponse.success(items);
      }
    } catch (_) {}

    // 未命中缓存，请求接口
    try {
      // 根据数据源选择不同的接口
      ApiResponse<List<dynamic>> response;
      
      if (dataSource == 'client') {
        // 客户端直连
        String apiUrl = 'https://api.bgm.tv/calendar';
        
        final headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        };
        final httpResponse = await http.get(Uri.parse(apiUrl), headers: headers).timeout(const Duration(seconds: 30));
        if (httpResponse.statusCode == 200) {
          response = ApiResponse.success(json.decode(httpResponse.body) as List<dynamic>, statusCode: 200);
        } else {
          response = ApiResponse.error('请求 Bangumi 失败: ${httpResponse.statusCode}');
        }
      } else {
        // 服务端转发或反向代理模式
        final endpoint = dataSource == 'proxy'
            ? '/api/bangumi/calendar'
            : '/api/proxy/bangumi?path=calendar';

        response = await ApiService.get<List<dynamic>>(
          endpoint,
          fromJson: (data) => data as List<dynamic>,
        );
      }

      if (response.success && response.data != null) {
        final List<dynamic> responseData = response.data!;
        final List<BangumiCalendarResponse> calendarData = responseData
            .map((item) =>
                BangumiCalendarResponse.fromJson(item as Map<String, dynamic>))
            .toList();

        BangumiCalendarResponse? targetDay;
        for (final day in calendarData) {
          if (day.weekday.id == weekday) {
            targetDay = day;
            break;
          }
        }

        final items = targetDay?.items ?? <BangumiItem>[];

        try {
          await _cache.set(cacheKey, responseData, const Duration(days: 1));
        } catch (_) {}

        return ApiResponse.success(items, statusCode: response.statusCode);
      }

      return ApiResponse.error(response.message ?? '获取 Bangumi 日历失败');
    } catch (e) {
      return ApiResponse.error('Bangumi 数据请求异常: ${e.toString()}');
    }
  }

  /// 获取 Bangumi 详情数据
  /// 
  /// 参数说明：
  /// - bangumiId: Bangumi ID
  static Future<ApiResponse<BangumiDetails>> getBangumiDetails(
    BuildContext context, {
    required String bangumiId,
  }) async {
    await _initCache();

    final dataSource = await UserDataService.getBangumiDataSourceKey();
    // 生成缓存键，包含数据源标识
    final cacheKey = '${_cache.generateBangumiDetailsCacheKey(bangumiId: bangumiId)}_$dataSource';

    // 尝试从缓存获取数据
    try {
      final cachedData = await _cache.get<BangumiDetails>(
        cacheKey,
        (raw) {
          if (raw is! Map<String, dynamic>) {
            throw FormatException('Bangumi 缓存数据格式错误: ${raw.runtimeType}');
          }
          return BangumiDetails.fromJson(raw);
        },
      );

      if (cachedData != null) {
        return ApiResponse.success(cachedData);
      }
    } catch (e) {
      // 缓存读取失败，清理可能损坏的缓存，继续执行网络请求
      try {
        // 清理这个特定的缓存项
        await _cache.set(cacheKey, null, Duration.zero);
      } catch (_) {}
    }

    try {
      ApiResponse<Map<String, dynamic>> response;

      if (dataSource == 'client') {
        // 客户端直连
        String apiUrl = 'https://api.bgm.tv/v0/subjects/$bangumiId';
        
        final headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        };
        final httpResponse = await http.get(Uri.parse(apiUrl), headers: headers).timeout(const Duration(seconds: 30));
        if (httpResponse.statusCode == 200) {
          response = ApiResponse.success(json.decode(httpResponse.body) as Map<String, dynamic>, statusCode: 200);
        } else {
          response = ApiResponse.error('请求 Bangumi 详情失败: ${httpResponse.statusCode}');
        }
      } else {
        // 根据数据源选择不同的服务端接口
        final endpoint = dataSource == 'proxy'
            ? '/api/bangumi/subject/$bangumiId'
            : '/api/proxy/bangumi?path=v0/subjects/$bangumiId';

        response = await ApiService.get<Map<String, dynamic>>(
          endpoint,
          fromJson: (data) => data as Map<String, dynamic>,
        );
      }

      if (response.success && response.data != null) {
        final details = BangumiDetails.fromJson(response.data!);
        // 缓存成功的结果
        try {
          await _cache.set(cacheKey, details.toJson(), const Duration(days: 3));
        } catch (_) {}
        return ApiResponse.success(details, statusCode: response.statusCode);
      }
    } catch (e) {
      debugPrint('获取 Bangumi 详情异常: $e');
    }

    return ApiResponse.error('获取 Bangumi 详情数据失败');
  }
}
