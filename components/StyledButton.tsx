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
          backgroundColor: colors.border,
        },
        text: {
          color: colors.text,
        },
        selectedButton: {
          backgroundColor: colors.primary,
        },
        focusedButton: {
          borderColor: colors.primary,
        },
        selectedText: {
          color: Colors.dark.text,
        },
      }),
      primary: StyleSheet.create({
        button: {
          backgroundColor: "transparent",
        },
        text: {
          color: colors.text,
        },
        focusedButton: {
          backgroundColor: colors.primary,
          borderColor: colors.background,
        },
        selectedButton: {
          backgroundColor: colors.primary,
        },
        selectedText: {
          color: colors.link,
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
          backgroundColor: "rgba(119, 119, 119, 0.2)",
          borderColor: colors.primary,
        },
        selectedButton: {},
        selectedText: {},
      }),
    };

    const styles = StyleSheet.create({
      button: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: "transparent",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        width: '100%',
        height: '100%',
      },
      focusedButton: {
        backgroundColor: colors.link,
        borderColor: colors.background,
        elevation: 5,
        shadowColor: colors.link,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 15,
      },
      selectedButton: {
        backgroundColor: colors.tint,
      },
      text: {
        fontSize: 16,
        fontWeight: "500",
        color: colors.text,
      },
      selectedText: {
        color: Colors.dark.text,
      },
    });

    // 分离布局样式和装饰样式，彻底解决“两个框”的问题
    const flattenedStyle = StyleSheet.flatten(style) || {};
    const {
      // 布局相关：放在 Animated.View (container)
      width, height, minWidth, minHeight, maxWidth, maxHeight,
      margin, marginBottom, marginTop, marginLeft, marginRight, marginHorizontal, marginVertical,
      flex, flexBasis, flexGrow, flexShrink,
      position, top, left, right, bottom, zIndex, alignSelf,

      // 装饰相关：放在 Pressable (inner)
      backgroundColor, borderRadius, borderWidth, borderColor,
      padding, paddingHorizontal, paddingVertical, paddingLeft, paddingRight, paddingTop, paddingBottom,

      ...restStyle
    } = flattenedStyle as any;

    const containerStyle = {
      width, height, minWidth, minHeight, maxWidth, maxHeight,
      margin, marginBottom, marginTop, marginLeft, marginRight, marginHorizontal, marginVertical,
      flex, flexBasis, flexGrow, flexShrink,
      position, top, left, right, bottom, zIndex, alignSelf
    };

    const decorationStyle = {
      backgroundColor, borderRadius, borderWidth, borderColor,
      padding, paddingHorizontal, paddingVertical, paddingLeft, paddingRight, paddingTop, paddingBottom,
      ...restStyle
    };

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
