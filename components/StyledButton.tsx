import React, { forwardRef } from "react";
import { Animated, Pressable, StyleSheet, StyleProp, ViewStyle, PressableProps, TextStyle, View, Platform } from "react-native";
import { ThemedText } from "./ThemedText";
import { Colors } from "@/constants/Colors";
import { useButtonAnimation } from "@/hooks/useAnimation";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

interface StyledButtonProps extends PressableProps {
  children?: React.ReactNode;
  text?: string;
  variant?: "default" | "primary" | "ghost";
  isSelected?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const StyledButton = forwardRef<View, StyledButtonProps>(
  ({ children, text, variant = "default", isSelected = false, style, textStyle, ...rest }, ref) => {
    const colorScheme = "dark";
    const colors = Colors[colorScheme];
    const [isFocused, setIsFocused] = React.useState(false);
    const animationStyle = useButtonAnimation(isFocused);
    const deviceType = useResponsiveLayout().deviceType;

    const variantStyles = {
      default: StyleSheet.create({
        button: {
          backgroundColor: "#3a3a3c", // 更有质感的深灰色背景
          borderColor: "#48484a",
          borderWidth: 1,
        },
        text: {
          color: colors.text,
        },
        selectedButton: {
          backgroundColor: Colors.dark.primary,
          borderColor: Colors.dark.primary,
        },
        focusedButton: {
          borderColor: Colors.dark.primary,
          backgroundColor: "#48484a",
        },
        selectedText: {
          color: "#fff",
        },
      }),
      primary: StyleSheet.create({
        button: {
          backgroundColor: Colors.dark.primary,
        },
        text: {
          color: "#fff",
        },
        focusedButton: {
          backgroundColor: Colors.dark.primary,
          borderColor: "#fff", // primary 按钮焦点时用白色边框区分绿色背景
          borderWidth: 3,
        },
        selectedButton: {
          backgroundColor: Colors.dark.primary,
        },
        selectedText: {
          color: "#fff",
        },
      }),
      ghost: StyleSheet.create({
        button: {
          backgroundColor: "transparent",
        },
        text: {
          color: colors.text,
        },
        focusedButton: {
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          borderColor: Colors.dark.primary,
        },
        selectedButton: {
          borderBottomWidth: 2,
          borderBottomColor: Colors.dark.primary,
        },
        selectedText: {
          color: Colors.dark.primary,
          fontWeight: 'bold',
        },
      }),
    };

    const styles = StyleSheet.create({
      button: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: "transparent",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
      },
      focusedButton: {
        backgroundColor: colors.link,
        borderColor: Colors.dark.primary,
        elevation: 12,
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 15,
      },
      selectedButton: {
        backgroundColor: Colors.dark.primary,
      },
      text: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
        lineHeight: 24,
        includeFontPadding: false, // 禁用 Android 默认字体填充，解决偏移问题
      },
      selectedText: {
        color: "#fff",
      },
    });

    // 彻底解决“两个框”的问题：分离布局和装饰样式，并过滤 undefined
    const flattenedStyle = StyleSheet.flatten(style) || {};
    const layoutProps = [
      'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
      'margin', 'marginBottom', 'marginTop', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
      'flex', 'flexBasis', 'flexGrow', 'flexShrink',
      'position', 'top', 'left', 'right', 'bottom', 'zIndex', 'alignSelf'
    ];

    const containerStyle: any = {
      overflow: 'visible', // 允许投影和边框溢出
      padding: 4, // 为焦点边框和阴影留出空间，解决“显示不完整”问题
    };
    const decorationStyle: any = {};

    Object.keys(flattenedStyle).forEach(key => {
      const val = (flattenedStyle as any)[key];
      if (val === undefined) return;

      if (layoutProps.includes(key)) {
        containerStyle[key] = val;
      } else {
        decorationStyle[key] = val;
      }
    });

    return (
      <Animated.View
        style={[
          animationStyle,
          containerStyle,
          { overflow: 'visible' },
          isFocused && { zIndex: 10 } // 确保选中的按钮在最上层
        ]}
      >
        <Pressable
          android_ripple={Platform.isTV || deviceType !== 'tv'? { color: 'transparent' } : { color: Colors.dark.link }}
          ref={ref}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={({ focused }) => [
            styles.button,
            variantStyles[variant].button,
            decorationStyle,
            isSelected && (variantStyles[variant].selectedButton ?? styles.selectedButton),
            focused && (variantStyles[variant].focusedButton ?? styles.focusedButton),
          ]}
          {...rest}
        >
          {text ? (
            <ThemedText
              style={[
                styles.text,
                variantStyles[variant].text,
                isSelected && (variantStyles[variant].selectedText ?? styles.selectedText),
                textStyle,
              ]}
            >
              {text}
            </ThemedText>
          ) : (
            children
          )}
        </Pressable>
      </Animated.View>
    );
  }
);

StyledButton.displayName = "StyledButton";
