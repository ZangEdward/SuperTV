import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../services/download_service.dart';
import '../models/download_task.dart';
import '../utils/font_utils.dart';

class DownloadManagerScreen extends StatelessWidget {
  const DownloadManagerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: DownloadService(),
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            '缓存管理',
            style: FontUtils.poppins(fontWeight: FontWeight.w600),
          ),
          elevation: 0,
        ),
        body: Consumer<DownloadService>(
          builder: (context, service, child) {
            if (service.tasks.isEmpty) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      LucideIcons.download,
                      size: 64,
                      color: Colors.grey.withOpacity(0.5),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      '暂无缓存任务',
                      style: FontUtils.poppins(
                        color: Colors.grey,
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
              );
            }

            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: service.tasks.length,
              itemBuilder: (context, index) {
                final task = service.tasks[index];
                return _DownloadTaskItem(task: task);
              },
            );
          },
        ),
      ),
    );
  }
}

class _DownloadTaskItem extends StatelessWidget {
  final DownloadTask task;

  const _DownloadTaskItem({required this.task});

  @override
  Widget build(BuildContext context) {
    final service = Provider.of<DownloadService>(context, listen: false);
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            // 封面
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                task.cover,
                width: 60,
                height: 90,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  width: 60,
                  height: 90,
                  color: Colors.grey[300],
                  child: const Icon(Icons.movie),
                ),
              ),
            ),
            const SizedBox(width: 12),
            // 信息
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    task.title,
                    style: FontUtils.poppins(
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    task.episodeTitle ?? '',
                    style: FontUtils.poppins(
                      color: Colors.grey[600],
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 8),
                  // 进度条
                  ClipRRect(
                    borderRadius: BorderRadius.circular(2),
                    child: LinearProgressIndicator(
                      value: task.progress,
                      backgroundColor: Colors.grey[200],
                      valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF27ae60)),
                      minHeight: 4,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        _getStatusText(task.status),
                        style: FontUtils.poppins(
                          fontSize: 12,
                          color: _getStatusColor(task.status),
                        ),
                      ),
                      Text(
                        '${(task.progress * 100).toInt()}%',
                        style: FontUtils.poppins(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            // 操作按钮
            Column(
              children: [
                IconButton(
                  icon: Icon(
                    task.status == DownloadStatus.downloading
                        ? LucideIcons.pause
                        : LucideIcons.play,
                    size: 20,
                  ),
                  onPressed: () {
                    if (task.status == DownloadStatus.downloading) {
                      service.pauseTask(task.id);
                    } else {
                      service.resumeTask(task.id);
                    }
                  },
                ),
                IconButton(
                  icon: const Icon(LucideIcons.trash2, size: 20, color: Colors.red),
                  onPressed: () => service.removeTask(task.id),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _getStatusText(DownloadStatus status) {
    switch (status) {
      case DownloadStatus.pending: return '等待中';
      case DownloadStatus.downloading: return '下载中';
      case DownloadStatus.paused: return '已暂停';
      case DownloadStatus.completed: return '已完成';
      case DownloadStatus.failed: return '失败';
    }
  }

  Color _getStatusColor(DownloadStatus status) {
    switch (status) {
      case DownloadStatus.pending: return Colors.orange;
      case DownloadStatus.downloading: return const Color(0xFF27ae60);
      case DownloadStatus.paused: return Colors.grey;
      case DownloadStatus.completed: return Colors.blue;
      case DownloadStatus.failed: return Colors.red;
    }
  }
}
