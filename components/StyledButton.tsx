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
          borderColor: "#fff",
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
        selectedButton: {},
        selectedText: {},
      }),
    };

    const styles = StyleSheet.create({
      button: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "transparent",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
      },
      focusedButton: {
        backgroundColor: colors.link,
        borderColor: colors.background,
        elevation: 8,
        shadowColor: Colors.dark.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
      },
      selectedButton: {
        backgroundColor: Colors.dark.primary,
      },
      text: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
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

    const containerStyle: any = {};
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
      <Animated.View style={[animationStyle, containerStyle]}>
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
