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
  
  // 下载设置
  int _maxConcurrentEpisodes = 5;
  int _segmentConcurrency = 6;
  
  List<DownloadTask> get tasks => _tasks;
  int get maxConcurrentEpisodes => _maxConcurrentEpisodes;
  int get segmentConcurrency => _segmentConcurrency;

  Future<void> init() async {
    await _loadSettings();
    await _loadTasks();
    _checkQueue();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    _maxConcurrentEpisodes = prefs.getInt('max_concurrent_episodes') ?? 5;
    _segmentConcurrency = prefs.getInt('segment_concurrency') ?? 6;
  }

  Future<void> setMaxConcurrentEpisodes(int count) async {
    _maxConcurrentEpisodes = count;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('max_concurrent_episodes', count);
    _checkQueue();
    notifyListeners();
  }

  void _checkQueue() {
    // 计算当前正在下载的任务数
    int downloadingCount = _tasks.where((t) => t.status == DownloadStatus.downloading).length;
    
    if (downloadingCount < _maxConcurrentEpisodes) {
      // 找到等待中的任务并开始
      final pendingTasks = _tasks.where((t) => t.status == DownloadStatus.pending).toList();
      for (var task in pendingTasks) {
        if (downloadingCount >= _maxConcurrentEpisodes) break;
        _startDownload(task);
        downloadingCount++;
      }
    }
  }

  Future<void> _loadTasks() async {
    final prefs = await SharedPreferences.getInstance();
    final tasksJson = prefs.getStringList('download_tasks') ?? [];
    _tasks.clear();
    for (var jsonStr in tasksJson) {
      final task = DownloadTask.fromJson(json.decode(jsonStr));
      // 如果加载时是正在下载状态，改为等待，由队列控制
      if (task.status == DownloadStatus.downloading) {
        task.status = DownloadStatus.pending;
      }
      _tasks.add(task);
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
      totalSegments: 0,
      createdAt: DateTime.now(),
    );

    _tasks.add(task);
    _saveTasks();
    notifyListeners();
    
    _checkQueue();
  }

  void _startDownload(DownloadTask task) async {
    if (task.status == DownloadStatus.completed) return;

    task.status = DownloadStatus.downloading;
    notifyListeners();

    try {
      // 1. 解析 M3U8 链接 (处理 Master Playlist)
      final mediaUrl = await _m3u8Service.resolveMediaPlaylist(task.url);
      
      // 2. 获取 M3U8 内容
      final response = await _dio.get(mediaUrl);
      final String content = response.data.toString();
      
      // 3. 解析片段
      final segments = _m3u8Service.parseSegmentsFromContent(content, mediaUrl);
      if (segments.isEmpty) {
        task.status = DownloadStatus.failed;
        _saveTasks();
        notifyListeners();
        _checkQueue();
        return;
      }

      // 更新任务状态
      final index = _tasks.indexWhere((t) => t.id == task.id);
      if (index == -1) return;
      _tasks[index].totalSegments = segments.length;
      notifyListeners();

      // 4. 创建保存目录
      final directory = Directory(task.savePath);
      final segmentsDir = Directory('${task.savePath}/segments');
      if (!await segmentsDir.exists()) {
        await segmentsDir.create(recursive: true);
      }

      // 5. 并发下载片段
      int existingFilesCount = 0;
      final downloadQueue = <int>[];
      for (int i = 0; i < segments.length; i++) {
        final filePath = '${task.savePath}/segments/segment_$i.ts';
        if (await File(filePath).exists()) {
          existingFilesCount++;
        } else {
          downloadQueue.add(i);
        }
      }

      // 更新已下载片段数以支持断点续传显示
      final total = segments.length;
      _tasks[index].downloadedSegments = existingFilesCount;
      _tasks[index].progress = existingFilesCount / total;
      int completed = existingFilesCount;
      notifyListeners();

      if (downloadQueue.isEmpty && existingFilesCount >= total) {
        // 所有片段已存在，直接进入合并阶段
        _tasks[index].downloadedSegments = total;
      } else {
        // 使用控制并发的 worker
        final workers = <Future<void>>[];
        final concurrentCount = _segmentConcurrency;
        
        for (int i = 0; i < concurrentCount; i++) {
          workers.add(Future.microtask(() async {
            while (true) {
              if (_tasks[index].status != DownloadStatus.downloading) return;
              
              int? segmentIndex;
              if (downloadQueue.isNotEmpty) {
                segmentIndex = downloadQueue.removeAt(0);
              }
              
              if (segmentIndex == null) break;
              
              final url = segments[segmentIndex];
              final filePath = '${task.savePath}/segments/segment_$segmentIndex.ts';

              try {
                await _dio.download(url, filePath);
                completed++;
                _tasks[index].downloadedSegments = completed;
                _tasks[index].progress = completed / total;
                notifyListeners();
              } catch (e) {
                debugPrint('Failed to download segment $segmentIndex: $e');
                // 失败的重新放回队列末尾
                downloadQueue.add(segmentIndex);
                await Future.delayed(const Duration(seconds: 2));
              }
            }
          }));
        }

        await Future.wait(workers);
      }

      if (_tasks[index].status != DownloadStatus.downloading) return;

      if (_tasks[index].downloadedSegments >= total) {
        // 6. 合并片段
        _tasks[index].progress = 0.99; // 标记正在合并
        notifyListeners();
        
        final mergedFile = File('${task.savePath}.ts');
        if (await mergedFile.exists()) await mergedFile.delete();
        
        final sink = mergedFile.openWrite();
        for (int i = 0; i < total; i++) {
          final segmentFile = File('${task.savePath}/segments/segment_$i.ts');
          if (await segmentFile.exists()) {
            await sink.addStream(segmentFile.openRead());
          }
        }
        await sink.close();

        // 7. 清理临时文件
        if (await segmentsDir.exists()) {
          await segmentsDir.delete(recursive: true);
        }

        _tasks[index].status = DownloadStatus.completed;
        _tasks[index].progress = 1.0;
        _saveTasks();
        notifyListeners();
        _checkQueue();
      }

    } catch (e) {
      debugPrint('Download error: $e');
      task.status = DownloadStatus.failed;
      _saveTasks();
      notifyListeners();
      _checkQueue();
    }
  }

  void pauseTask(String id) {
    final index = _tasks.indexWhere((t) => t.id == id);
    if (index != -1) {
      _tasks[index].status = DownloadStatus.paused;
      _saveTasks();
      notifyListeners();
      _checkQueue();
    }
  }

  void resumeTask(String id) {
    final index = _tasks.indexWhere((t) => t.id == id);
    if (index != -1) {
      _tasks[index].status = DownloadStatus.pending;
      _saveTasks();
      notifyListeners();
      _checkQueue();
    }
  }

  void pauseAllTasks() {
    for (var task in _tasks) {
      if (task.status == DownloadStatus.downloading || task.status == DownloadStatus.pending) {
        task.status = DownloadStatus.paused;
      }
    }
    _saveTasks();
    notifyListeners();
  }

  void resumeAllTasks() {
    for (var task in _tasks) {
      if (task.status == DownloadStatus.paused || task.status == DownloadStatus.failed) {
        task.status = DownloadStatus.pending;
      }
    }
    _saveTasks();
    notifyListeners();
    _checkQueue();
  }

  void removeTask(String id) {
    _tasks.removeWhere((t) => t.id == id);
    _saveTasks();
    notifyListeners();
  }
}
