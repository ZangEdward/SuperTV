import React, { useState, useEffect, useRef, forwardRef } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert, Animated } from "react-native";
import { useRouter } from "expo-router";
import { Star, Play } from "lucide-react-native";
import { PlayRecordManager } from "@/services/storage";
import { API } from "@/services/api";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { ImageCacheService } from "@/services/imageCacheService";
import { DeviceUtils } from "@/utils/DeviceUtils";
import Logger from '@/utils/Logger';

const logger = Logger.withTag('VideoCardMobile');

interface VideoCardMobileProps extends React.ComponentProps<typeof TouchableOpacity> {
  id: string;
  source: string;
  title: string;
  poster: string;
  year?: string;
  rate?: string;
  sourceName?: string;
  progress?: number;
  playTime?: number;
  episodeIndex?: number;
  totalEpisodes?: number;
  sourceCount?: number; // 新增：资源数量
  from?: string; // 增加场景标识
  onFocus?: () => void;
  onRecordDeleted?: () => void;
  api: API;
}

const VideoCardMobile = forwardRef<View, VideoCardMobileProps>(
  (
    {
      id,
      source,
      title,
      poster,
      year,
      rate,
      sourceName,
      progress,
      episodeIndex,
      totalEpisodes,
      sourceCount,
      from,
      onFocus,
      onRecordDeleted,
      api,
      playTime = 0,
    }: VideoCardMobileProps,
    ref
  ) => {
    const router = useRouter();
    const { cardWidth, cardHeight, spacing } = useResponsiveLayout();
    const [fadeAnim] = useState(new Animated.Value(0));

    // [优先显示逻辑] 初始值直接使用远程代理，确保秒出图片
    const proxyUrl = api.getImageProxyUrl(poster);
    const [imageUri, setImageUri] = useState<string>(proxyUrl);

    useEffect(() => {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // 后台执行缓存检查与下载，如果本地已有，下一次加载就会变成本地 file 路径
      const checkCache = async () => {
        const finalUri = await ImageCacheService.getLocalOrRemote(proxyUrl);
        // 只有当本地确实有现成文件时才更新 state，避免重复触发远程加载
        if (finalUri.startsWith('file://')) {
          setImageUri(finalUri);
        }
      };
      checkCache();
    }, [poster]);

    const handlePress = () => {
      // 优化：只要有集数索引（来自播放记录），就直接跳转播放
      if (episodeIndex !== undefined) {
        router.push({
          pathname: "/play",
          params: { source, id, episodeIndex: episodeIndex - 1, title, position: (playTime || 0) * 1000 },
        });
      } else {
        router.push({
          pathname: "/detail",
          params: { source, q: title, id },
        });
      }
    };

    const handleLongPress = () => {
      if (progress === undefined) return;

      Alert.alert("删除观看记录", `确定要删除"${title}"的观看记录吗？`, [
        {
          text: "取消",
          style: "cancel"
        },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            try {
              await PlayRecordManager.remove(source, id);
              onRecordDeleted?.();
            } catch (error) {
              logger.info("Failed to delete play record:", error);
              Alert.alert("错误", "删除观看记录失败，请重试");
            }
          },
        },
      ]);
    };

    const isContinueWatching = progress !== undefined && progress > 0 && progress < 1;

    // --- Selene 风格角标逻辑 ---
    const showYearBadge = (from === 'search' || from === 'agg') && year && year !== 'unknown';
    const showEpisodeBadge = (from === 'search' || from === 'agg') && totalEpisodes && totalEpisodes > 1;

    const styles = createMobileStyles(cardWidth, cardHeight, spacing);

    return (
      <Animated.View style={[styles.wrapper, { opacity: fadeAnim }]} ref={ref}>
        <TouchableOpacity
          onPress={handlePress}
          style={styles.pressable}
          activeOpacity={0.8}
        >
          <View style={styles.card}>
            {imageUri && <Image source={{ uri: imageUri }} style={styles.poster} />}
            
            {/* 年份 (Top-Left) */}
            {showYearBadge && (
              <View style={styles.seleneYearBadge}>
                <Text style={styles.badgeText}>{year}</Text>
              </View>
            )}

            {/* 集数 (Top-Right) */}
            {showEpisodeBadge && (
              <View style={styles.seleneEpisodeBadge}>
                <Text style={styles.badgeText}>{totalEpisodes}</Text>
              </View>
            )}

            {/* 资源数量 (Bottom-Right) - 聚合模式专用 */}
            {from === 'agg' && sourceCount && sourceCount > 1 && (
              <View style={styles.seleneSourceCountBadge}>
                <Text style={styles.badgeText}>{sourceCount}</Text>
              </View>
            )}

            {/* 评分 */}
            {rate && (
              <View style={styles.ratingContainer}>
                <Star size={10} color="#FFD700" fill="#FFD700" />
                <Text style={styles.ratingText}>{rate}</Text>
              </View>
            )}

            {/* 来源 (Bottom-Left) */}
            {sourceName && (
              <View style={styles.sourceNameBadge}>
                <Text style={styles.badgeText}>{sourceName}</Text>
              </View>
            )}
          </View>

          <View style={styles.infoContainer}>
            <ThemedText numberOfLines={1} style={styles.title}>{title}</ThemedText>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }
);

VideoCardMobile.displayName = "VideoCardMobile";

const createMobileStyles = (cardWidth: number, cardHeight: number, spacing: number) => {
  return StyleSheet.create({
    wrapper: {
      width: cardWidth,
      marginBottom: spacing,
    },
    pressable: {
      alignItems: 'flex-start',
    },
    card: {
      width: cardWidth,
      height: cardHeight,
      borderRadius: 8,
      backgroundColor: "#222",
      overflow: "hidden",
    },
    poster: {
      width: "100%",
      height: "100%",
      resizeMode: 'cover',
    },
    progressContainer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
    },
    progressBar: {
      height: 3,
      backgroundColor: Colors.dark.primary,
    },
    continueWatchingBadge: {
      position: 'absolute',
      top: 6,
      left: 6,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.dark.primary,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 4,
    },
    continueWatchingText: {
      color: "white",
      marginLeft: 3,
      fontSize: 10,
      fontWeight: "bold",
    },
    ratingContainer: {
      position: "absolute",
      bottom: 6,
      right: 6,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#e91e63",
      borderRadius: 12,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    ratingText: {
      color: "white",
      fontSize: 10,
      fontWeight: "bold",
    },
    seleneYearBadge: {
      position: "absolute",
      top: 6,
      left: 6,
      backgroundColor: "rgba(44, 62, 80, 0.8)",
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 3,
    },
    seleneEpisodeBadge: {
      position: "absolute",
      top: 6,
      right: 6,
      backgroundColor: "#27ae60",
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 3,
    },
    seleneSourceCountBadge: {
      position: "absolute",
      bottom: 6,
      right: 6,
      backgroundColor: "rgba(155, 89, 182, 0.8)", // 紫色
      borderRadius: 12,
      width: 20,
      height: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sourceNameBadge: {
      position: "absolute",
      bottom: 6,
      left: 6,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      borderRadius: 3,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderWidth: 0.5,
      borderColor: '#7f8c8d',
    },
    badgeText: {
      color: "white",
      fontSize: 10,
      fontWeight: "bold",
    },
    infoContainer: {
      width: cardWidth,
      marginTop: 4,
      alignItems: 'center',
    },
    title: {
      fontSize: 13,
      fontWeight: '500',
      color: '#fff',
      textAlign: 'center',
    },
  });
};

export default VideoCardMobile;