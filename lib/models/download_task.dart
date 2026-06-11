enum DownloadStatus {
  pending,
  downloading,
  paused,
  completed,
  failed,
}

class DownloadTask {
  final String id;
  final String title;
  final String url;
  final String savePath;
  final String cover;
  final String? episodeTitle;
  final int totalSegments;
  int downloadedSegments;
  DownloadStatus status;
  double progress;
  final DateTime createdAt;

  DownloadTask({
    required this.id,
    required this.title,
    required this.url,
    required this.savePath,
    required this.cover,
    this.episodeTitle,
    required this.totalSegments,
    this.downloadedSegments = 0,
    this.status = DownloadStatus.pending,
    this.progress = 0.0,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'url': url,
      'savePath': savePath,
      'cover': cover,
      'episodeTitle': episodeTitle,
      'totalSegments': totalSegments,
      'downloadedSegments': downloadedSegments,
      'status': status.index,
      'progress': progress,
      'createdAt': createdAt.millisecondsSinceEpoch,
    };
  }

  factory DownloadTask.fromJson(Map<String, dynamic> json) {
    return DownloadTask(
      id: json['id'],
      title: json['title'],
      url: json['url'],
      savePath: json['savePath'],
      cover: json['cover'],
      episodeTitle: json['episodeTitle'],
      totalSegments: json['totalSegments'],
      downloadedSegments: json['downloadedSegments'] ?? 0,
      status: DownloadStatus.values[json['status']],
      progress: (json['progress'] ?? 0.0).toDouble(),
      createdAt: DateTime.fromMillisecondsSinceEpoch(json['createdAt']),
    );
  }
}
