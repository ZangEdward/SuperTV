import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/download_task.dart';
import '../models/search_result.dart';
import 'm3u8_service.dart';

class DownloadService extends ChangeNotifier {
  static final DownloadService _instance = DownloadService._internal();
  factory DownloadService() => _instance;
  DownloadService._internal();

  final List<DownloadTask> _tasks = [];
  final Dio _dio = Dio();
  final M3U8Service _m3u8Service = M3U8Service();
  
  List<DownloadTask> get tasks => _tasks;

  Future<void> init() async {
    await _loadTasks();
    // 恢复之前的任务（如果正在下载）
    for (var task in _tasks) {
      if (task.status == DownloadStatus.downloading) {
        _startDownload(task);
      }
    }
  }

  Future<void> _loadTasks() async {
    final prefs = await SharedPreferences.getInstance();
    final tasksJson = prefs.getStringList('download_tasks') ?? [];
    _tasks.clear();
    for (var jsonStr in tasksJson) {
      _tasks.add(DownloadTask.fromJson(json.decode(jsonStr)));
    }
    notifyListeners();
  }

  Future<void> _saveTasks() async {
    final prefs = await SharedPreferences.getInstance();
    final tasksJson = _tasks.map((t) => json.encode(t.toJson())).toList();
    await prefs.setStringList('download_tasks', tasksJson);
  }

  Future<void> addTask(SearchResult detail, int episodeIndex) async {
    final episodeUrl = detail.episodes[episodeIndex];
    final episodeTitle = detail.episodesTitles.isNotEmpty && episodeIndex < detail.episodesTitles.length 
        ? detail.episodesTitles[episodeIndex] 
        : '第${episodeIndex + 1}集';
    
    final id = '${detail.source}_${detail.id}_$episodeIndex';
    
    // 检查是否已存在
    if (_tasks.any((t) => t.id == id)) return;

    final appDocDir = await getApplicationDocumentsDirectory();
    final savePath = '${appDocDir.path}/downloads/${detail.title}/$episodeTitle';
    
    final task = DownloadTask(
      id: id,
      title: detail.title,
      url: episodeUrl,
      savePath: savePath,
      cover: detail.poster,
      episodeTitle: episodeTitle,
      totalSegments: 0, // 初始为0，解析后再更新
      createdAt: DateTime.now(),
    );

    _tasks.add(task);
    _saveTasks();
    notifyListeners();
    
    _startDownload(task);
  }

  void _startDownload(DownloadTask task) async {
    if (task.status == DownloadStatus.completed) return;

    task.status = DownloadStatus.downloading;
    notifyListeners();

    try {
      // 1. 获取 M3U8 内容
      final response = await _dio.get(task.url);
      final String content = response.data.toString();
      
      // 2. 解析片段
      final segments = _m3u8Service.parseSegmentsFromContent(content, task.url);
      if (segments.isEmpty) {
        task.status = DownloadStatus.failed;
        _saveTasks();
        notifyListeners();
        return;
      }

      // 更新任务状态
      final index = _tasks.indexWhere((t) => t.id == task.id);
      if (index == -1) return;
      _tasks[index].totalSegments = segments.length;
      _tasks[index].downloadedSegments = 0;
      notifyListeners();

      // 3. 创建保存目录
      final directory = Directory(task.savePath);
      if (!await directory.exists()) {
        await directory.create(recursive: true);
      }

      // 4. 并发下载片段 (限制并发数为 3)
      final concurrentDownloads = 3;
      final total = segments.length;
      int completed = 0;

      for (int i = 0; i < total; i += concurrentDownloads) {
        if (_tasks[index].status != DownloadStatus.downloading) break;

        final batch = segments.skip(i).take(concurrentDownloads);
        final futures = batch.map((url) async {
          final segmentIndex = segments.indexOf(url);
          final fileName = 'segment_$segmentIndex.ts';
          final filePath = '${task.savePath}/$fileName';

          try {
            await _dio.download(url, filePath);
            completed++;
            _tasks[index].downloadedSegments = completed;
            _tasks[index].progress = completed / total;
            notifyListeners();
          } catch (e) {
            debugPrint('Failed to download segment $segmentIndex: $e');
          }
        });

        await Future.wait(futures);
        _saveTasks();
      }

      if (_tasks[index].downloadedSegments >= total) {
        _tasks[index].status = DownloadStatus.completed;
        _tasks[index].progress = 1.0;
        _saveTasks();
        notifyListeners();
      }

    } catch (e) {
      debugPrint('Download error: $e');
      task.status = DownloadStatus.failed;
      _saveTasks();
      notifyListeners();
    }
  }

  List<String> _parseSegments(String content, String baseUrl) {
    // 逻辑已迁移到 m3u8_service.dart 并设为 public
    return [];
  }

  void pauseTask(String id) {
    final index = _tasks.indexWhere((t) => t.id == id);
    if (index != -1) {
      _tasks[index].status = DownloadStatus.paused;
      _saveTasks();
      notifyListeners();
    }
  }

  void resumeTask(String id) {
    final index = _tasks.indexWhere((t) => t.id == id);
    if (index != -1) {
      _startDownload(_tasks[index]);
    }
  }

  void removeTask(String id) {
    _tasks.removeWhere((t) => t.id == id);
    _saveTasks();
    notifyListeners();
  }
}
