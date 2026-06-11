import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:media_kit_video/media_kit_video.dart';
import '../../utils/font_utils.dart';

class TvPlayerControls extends StatefulWidget {
  final VideoController controller;
  final String title;
  final VoidCallback onNext;
  final VoidCallback onPrevious;
  final VoidCallback onShowEpisodes;
  final VoidCallback onShowSources;

  const TvPlayerControls({
    super.key,
    required this.controller,
    required this.title,
    required this.onNext,
    required this.onPrevious,
    required this.onShowEpisodes,
    required this.onShowSources,
  });

  @override
  State<TvPlayerControls> createState() => _TvPlayerControlsState();
}

class _TvPlayerControlsState extends State<TvPlayerControls> {
  bool _isVisible = true;
  DateTime _lastActivity = DateTime.now();

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    Future.delayed(const Duration(seconds: 5), () {
      if (mounted) {
        if (DateTime.now().difference(_lastActivity).inSeconds >= 5) {
          setState(() => _isVisible = false);
        }
        _startTimer();
      }
    });
  }

  void _onActivity() {
    setState(() {
      _isVisible = true;
      _lastActivity = DateTime.now();
    });
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _onActivity,
      behavior: HitTestBehavior.translucent,
      child: Focus(
        onKey: (node, event) {
          _onActivity();
          return KeyEventResult.ignored;
        },
        child: Stack(
          children: [
            if (_isVisible) ...[
              // Top Bar
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.black54, Colors.transparent],
                    ),
                  ),
                  child: Text(
                    widget.title,
                    style: FontUtils.poppins(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              // Bottom Controls
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 30),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [Colors.black54, Colors.transparent],
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Progress Bar
                      StreamBuilder<Duration>(
                        stream: widget.controller.player.stream.position,
                        builder: (context, snapshot) {
                          final position = snapshot.data ?? Duration.zero;
                          final duration = widget.controller.player.state.duration;
                          return Column(
                            children: [
                              SliderTheme(
                                data: SliderTheme.of(context).copyWith(
                                  trackHeight: 4,
                                  thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
                                ),
                                child: Slider(
                                  value: position.inMilliseconds.toDouble(),
                                  max: duration.inMilliseconds.toDouble(),
                                  onChanged: (value) {
                                    widget.controller.player.seek(Duration(milliseconds: value.toInt()));
                                    _onActivity();
                                  },
                                ),
                              ),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(_formatDuration(position), style: const TextStyle(color: Colors.white70)),
                                  Text(_formatDuration(duration), style: const TextStyle(color: Colors.white70)),
                                ],
                              ),
                            ],
                          );
                        },
                      ),
                      const SizedBox(height: 20),
                      // Buttons
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          _buildControlBtn(LucideIcons.skipBack, widget.onPrevious),
                          const SizedBox(width: 30),
                          StreamBuilder<bool>(
                            stream: widget.controller.player.stream.playing,
                            builder: (context, snapshot) {
                              final isPlaying = snapshot.data ?? false;
                              return _buildControlBtn(
                                isPlaying ? LucideIcons.pause : LucideIcons.play,
                                () => isPlaying ? widget.controller.player.pause() : widget.controller.player.play(),
                                size: 40,
                                autofocus: true,
                              );
                            },
                          ),
                          const SizedBox(width: 30),
                          _buildControlBtn(LucideIcons.skipForward, widget.onNext),
                          const SizedBox(width: 60),
                          _buildTextBtn('选集', widget.onShowEpisodes),
                          const SizedBox(width: 20),
                          _buildTextBtn('路线', widget.onShowSources),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildControlBtn(IconData icon, VoidCallback onTap, {double size = 28, bool autofocus = false}) {
    return Focus(
      autofocus: autofocus,
      child: Builder(
        builder: (context) {
          final hasFocus = Focus.of(context).hasFocus;
          return GestureDetector(
            onTap: () {
              onTap();
              _onActivity();
            },
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: hasFocus ? const Color(0xFF27AE60) : Colors.transparent,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: Colors.white, size: size),
            ),
          );
        },
      ),
    );
  }

  Widget _buildTextBtn(String label, VoidCallback onTap) {
    return Focus(
      child: Builder(
        builder: (context) {
          final hasFocus = Focus.of(context).hasFocus;
          return GestureDetector(
            onTap: () {
              onTap();
              _onActivity();
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              decoration: BoxDecoration(
                color: hasFocus ? const Color(0xFF27AE60) : Colors.white10,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                label,
                style: FontUtils.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  String _formatDuration(Duration duration) {
    String twoDigits(int n) => n.toString().padLeft(2, "0");
    String twoDigitMinutes = twoDigits(duration.inMinutes.remainder(60));
    String twoDigitSeconds = twoDigits(duration.inSeconds.remainder(60));
    if (duration.inHours > 0) {
      return "${twoDigits(duration.inHours)}:$twoDigitMinutes:$twoDigitSeconds";
    }
    return "$twoDigitMinutes:$twoDigitSeconds";
  }
}
