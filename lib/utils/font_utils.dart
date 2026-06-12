import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'device_utils.dart';

class FontUtils {
  /// 获取 Poppins 字体样式，Windows 下使用微软雅黑
  static TextStyle poppins({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? letterSpacing,
    double? height,
    FontStyle? fontStyle,
  }) {
    if (DeviceUtils.isWindows()) {
      return TextStyle(
        fontFamily: 'Microsoft YaHei',
        fontSize: fontSize,
        fontWeight: fontWeight ?? FontWeight.w500,
        color: color,
        letterSpacing: letterSpacing,
        height: height,
        fontStyle: fontStyle,
      );
    }

    FontWeight? effectiveWeight = fontWeight;
    // 如果禁用了运行时下载，且不是 Windows，则限制使用已有的字体权重以避免崩溃
    // 目前 pubspec.yaml 中只有 Regular (400) 和 Bold (700)
    if (!GoogleFonts.config.allowRuntimeFetching && !DeviceUtils.isWindows()) {
      if (effectiveWeight == FontWeight.w500 || effectiveWeight == FontWeight.w600) {
        if (kDebugMode) {
          print('[FontLog] Weight $effectiveWeight not found in assets, falling back to w400');
        }
        effectiveWeight = FontWeight.w400;
      }
    }

    return GoogleFonts.poppins(
      fontSize: fontSize,
      fontWeight: effectiveWeight,
      color: color,
      letterSpacing: letterSpacing,
      height: height,
      fontStyle: fontStyle,
      // 添加备用字体防止下载失败时显示异常
      textStyle: const TextStyle(
        fontFamilyFallback: ['sans-serif', 'Roboto', 'Arial'],
      ),
    );
  }

  /// 获取 Source Code Pro 字体样式，所有平台都使用 Google Fonts
  static TextStyle sourceCodePro({
    double? fontSize,
    FontWeight? fontWeight,
    Color? color,
    double? letterSpacing,
    double? height,
    FontStyle? fontStyle,
  }) {
    return GoogleFonts.sourceCodePro(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      letterSpacing: letterSpacing,
      height: height,
      fontStyle: fontStyle,
      // 添加备用字体
      textStyle: const TextStyle(
        fontFamilyFallback: ['monospace', 'Courier New'],
      ),
    );
  }
}
