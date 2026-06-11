import 'package:flutter/material.dart';
import '../../widgets/tv/tv_pinyin_keyboard.dart';
import '../../services/api_service.dart';
import '../../models/search_result.dart';
import '../player_screen.dart';
import '../../models/video_info.dart';
import '../../models/douban_movie.dart';
import '../../utils/font_utils.dart';
import '../../widgets/douban_movies_grid.dart'; // Reusing existing grid if possible

class TvSearchScreen extends StatefulWidget {
  const TvSearchScreen({super.key});

  @override
  State<TvSearchScreen> createState() => _TvSearchScreenState();
}

class _TvSearchScreenState extends State<TvSearchScreen> {
  String _query = '';
  List<SearchResult> _results = [];
  List<String> _suggestions = [];
  bool _isLoading = false;

  void _onKeyTap(String key) {
    setState(() {
      _query += key;
    });
    _fetchSuggestions();
  }

  void _onBackspace() {
    if (_query.isNotEmpty) {
      setState(() {
        _query = _query.substring(0, _query.length - 1);
      });
      _fetchSuggestions();
    }
  }

  void _onClear() {
    setState(() {
      _query = '';
      _results = [];
      _suggestions = [];
    });
  }

  Future<void> _fetchSuggestions() async {
    if (_query.isEmpty) {
      setState(() => _suggestions = []);
      return;
    }
    final suggestions = await ApiService.getTvSearchSuggestions(_query);
    if (mounted) {
      setState(() {
        _suggestions = suggestions;
      });
    }
  }

  Future<void> _doSearch(String term) async {
    setState(() {
      _isLoading = true;
      _query = term;
    });
    
    try {
      final results = await ApiService.fetchSourcesData(term);
      setState(() {
        _results = results;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Row(
        children: [
          // Left Pane: Keyboard
          TvPinyinKeyboard(
            onKeyTap: _onKeyTap,
            onBackspace: _onBackspace,
            onClear: _onClear,
          ),
          // Middle Pane: Suggestions
          Container(
            width: 250,
            decoration: const BoxDecoration(
              border: Border(
                left: BorderSide(color: Colors.white10),
                right: BorderSide(color: Colors.white10),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Text(
                    '搜索: $_query',
                    style: FontUtils.poppins(color: Colors.white, fontSize: 18),
                  ),
                ),
                Expanded(
                  child: ListView.builder(
                    itemCount: _suggestions.length,
                    itemBuilder: (context, index) {
                      return ListTile(
                        title: Text(_suggestions[index], style: const TextStyle(color: Colors.white70)),
                        onTap: () => _doSearch(_suggestions[index]),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
          // Right Pane: Results
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator())
              : _results.isEmpty 
                ? Center(child: Text('请输入拼音首字母进行搜索', style: FontUtils.poppins(color: Colors.white54)))
                : Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: DoubanMoviesGrid(
                      movies: _results.map((r) => DoubanMovie(
                        id: r.id,
                        title: r.title,
                        poster: r.poster,
                        year: r.year,
                      )).toList(),
                      isLoading: false,
                      onVideoTap: (videoInfo) {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => PlayerScreen(
                              title: videoInfo.title,
                              year: videoInfo.year,
                              source: videoInfo.source,
                              id: videoInfo.id,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
