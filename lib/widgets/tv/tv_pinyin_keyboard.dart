import 'package:flutter/material.dart';
import '../../utils/font_utils.dart';

class TvPinyinKeyboard extends StatelessWidget {
  final Function(String) onKeyTap;
  final VoidCallback onBackspace;
  final VoidCallback onClear;

  const TvPinyinKeyboard({
    super.key,
    required this.onKeyTap,
    required this.onBackspace,
    required this.onClear,
  });

  static const List<String> _keys = [
    'A', 'B', 'C', 'D', 'E', 'F',
    'G', 'H', 'I', 'J', 'K', 'L',
    'M', 'N', 'O', 'P', 'Q', 'R',
    'S', 'T', 'U', 'V', 'W', 'X',
    'Y', 'Z', '0', '1', '2', '3',
    '4', '5', '6', '7', '8', '9',
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 300,
      padding: const EdgeInsets.all(10),
      child: Column(
        children: [
          Expanded(
            child: GridView.builder(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 6,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
              ),
              itemCount: _keys.length,
              itemBuilder: (context, index) {
                return _buildKey(_keys[index], context);
              },
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _buildActionButton('退格', onBackspace, context, color: Colors.redAccent)),
              const SizedBox(width: 8),
              Expanded(child: _buildActionButton('清空', onClear, context)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildKey(String label, BuildContext context) {
    return Focus(
      child: Builder(
        builder: (context) {
          final hasFocus = Focus.of(context).hasFocus;
          return GestureDetector(
            onTap: () => onKeyTap(label),
            child: Container(
              decoration: BoxDecoration(
                color: hasFocus ? const Color(0xFF27AE60) : Colors.white10,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: hasFocus ? Colors.white : Colors.white24,
                  width: hasFocus ? 2 : 1,
                ),
              ),
              child: Center(
                child: Text(
                  label,
                  style: FontUtils.poppins(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildActionButton(String label, VoidCallback onTap, BuildContext context, {Color? color}) {
    return Focus(
      child: Builder(
        builder: (context) {
          final hasFocus = Focus.of(context).hasFocus;
          return GestureDetector(
            onTap: onTap,
            child: Container(
              height: 50,
              decoration: BoxDecoration(
                color: hasFocus ? const Color(0xFF27AE60) : (color ?? Colors.white10),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: hasFocus ? Colors.white : Colors.white24,
                  width: hasFocus ? 2 : 1,
                ),
              ),
              child: Center(
                child: Text(
                  label,
                  style: FontUtils.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
