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
    // 清除不同数据源下的日历缓存
    await _cache.delete('bangumi_calendar_direct_v1');
    await _cache.delete('bangumi_calendar_proxy_v1');
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
      if (dataSource == 'proxy') {
        final response = await ApiService.get<List<dynamic>>(
          '/api/proxy/bangumi?path=calendar',
          fromJson: (data) => data as List<dynamic>,
        );

        if (response.success && response.data != null) {
          final List<dynamic> responseData = response.data!;
          final List<BangumiCalendarResponse> calendarData = responseData
              .map((item) => BangumiCalendarResponse.fromJson(item as Map<String, dynamic>))
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
      }

      // 降级或直连逻辑
      // 如果设置的是直连，或者代理获取失败，尝试直连
      const apiUrl = 'https://api.bgm.tv/calendar';
      final headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      };

      final httpResponse = await http
          .get(Uri.parse(apiUrl), headers: headers)
          .timeout(const Duration(seconds: 30));

      if (httpResponse.statusCode == 200) {
        final List<dynamic> responseData = json.decode(httpResponse.body);

        // 解析所有星期数据
        final List<BangumiCalendarResponse> calendarData = responseData
            .map((item) => BangumiCalendarResponse.fromJson(item as Map<String, dynamic>))
            .toList();

        BangumiCalendarResponse? targetDay;
        for (final day in calendarData) {
          if (day.weekday.id == weekday) {
            targetDay = day;
            break;
          }
        }

        final items = targetDay?.items ?? <BangumiItem>[];

        // 写入接口级缓存
        try {
          await _cache.set(cacheKey, responseData, const Duration(days: 1));
        } catch (_) {}

        return ApiResponse.success(items, statusCode: httpResponse.statusCode);
      } else {
        return ApiResponse.error(
          '获取 Bangumi 日历失败: ${httpResponse.statusCode}',
          statusCode: httpResponse.statusCode,
        );
      }
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
      if (dataSource == 'proxy') {
        // 优先通过服务器代理获取详情 (使用 Bangumi v0 API)
        final response = await ApiService.get<Map<String, dynamic>>(
          '/api/proxy/bangumi?path=v0/subjects/$bangumiId',
          fromJson: (data) => data as Map<String, dynamic>,
        );

        if (response.success && response.data != null) {
          final details = BangumiDetails.fromJson(response.data!);
          // 缓存成功的结果
          try {
            await _cache.set(cacheKey, details.toJson(), const Duration(days: 3));
          } catch (_) {}
          return ApiResponse.success(details, statusCode: response.statusCode);
        }
      }
    } catch (e) {
      debugPrint('通过代理获取 Bangumi 详情异常: $e');
    }

    // 降级：直连 (如果设置了直连或代理失败)
    try {
      final apiUrl = 'https://api.bgm.tv/v0/subjects/$bangumiId';
      final headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      };

      final response = await http.get(
        Uri.parse(apiUrl),
        headers: headers,
      ).timeout(const Duration(seconds: 30));

      if (response.statusCode == 200) {
        try {
          final Map<String, dynamic> data = json.decode(response.body);
          final details = BangumiDetails.fromJson(data);
          
          // 缓存成功的结果，缓存时间为 3 天
          try {
            await _cache.set(
              cacheKey,
              details.toJson(),
              const Duration(days: 3),
            );
          } catch (cacheError) {
            // 静默处理缓存错误
          }
          
          return ApiResponse.success(details, statusCode: response.statusCode);
        } catch (parseError) {
          return ApiResponse.error('Bangumi 详情数据解析失败: ${parseError.toString()}');
        }
      } else {
        return ApiResponse.error(
          '获取 Bangumi 详情数据失败: ${response.statusCode}',
          statusCode: response.statusCode,
        );
      }
    } catch (e) {
      return ApiResponse.error('Bangumi 详情数据请求异常: ${e.toString()}');
    }
  }
}
