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
    
    // 如果禁用了运行时下载，且不是 Windows，则直接使用本地 Poppins 字体以避免 GoogleFonts 下载失败
    if (!GoogleFonts.config.allowRuntimeFetching && !DeviceUtils.isWindows()) {
      // 映射权重
      if (effectiveWeight != null) {
        if (effectiveWeight.index < 5) { // w600 的 index 是 5
          effectiveWeight = FontWeight.w400;
        } else {
          effectiveWeight = FontWeight.w700;
        }
      }
      
      return TextStyle(
        fontFamily: 'Poppins',
        fontSize: fontSize,
        fontWeight: effectiveWeight,
        color: color,
        letterSpacing: letterSpacing,
        height: height,
        fontStyle: fontStyle,
        fontFamilyFallback: const ['sans-serif', 'Roboto', 'Arial'],
      );
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
    // 同样做安全映射
    FontWeight? effectiveWeight = fontWeight;
    if (!GoogleFonts.config.allowRuntimeFetching && !DeviceUtils.isWindows()) {
       if (effectiveWeight != null) {
          effectiveWeight = effectiveWeight.index < 5 ? FontWeight.w400 : FontWeight.w700;
       }
    }

    return GoogleFonts.sourceCodePro(
      fontSize: fontSize,
      fontWeight: effectiveWeight,
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
