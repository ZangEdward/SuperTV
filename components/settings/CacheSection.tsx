import React, { useState, useEffect } from "react";
import { View, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { ThemedText } from "../ThemedText";
import { StyledButton } from "../StyledButton";
import { SettingsSection } from "./SettingsSection";
import { SearchHistoryManager, PlayRecordManager } from "@/services/storage";
import * as FileSystem from 'expo-file-system';
import Toast from "react-native-toast-message";

export function CacheSection() {
  const [clearing, setClearing] = useState(false);
  const [cacheSize, setCacheSize] = useState<string>("0 MB");

  useEffect(() => {
    calculateCacheSize();
  }, []);

  const calculateCacheSize = async () => {
    try {
      let totalSize = 0;

      // 1. APK 缓存目录
      const dirUri = FileSystem.documentDirectory;
      if (dirUri) {
        const listing = await FileSystem.readDirectoryAsync(dirUri);
        for (const file of listing) {
          if (file.endsWith('.apk')) {
            const info = await FileSystem.getInfoAsync(dirUri + file);
            if (info.exists) {
              totalSize += info.size;
            }
          }
        }
      }

      // 2. 这里的缓存可以根据实际情况添加更多目录
      // 例如 expo-image 缓存等

      setCacheSize((totalSize / (1024 * 1024)).toFixed(2) + " MB");
    } catch (e) {
      console.warn("计算缓存大小失败:", e);
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      "清除缓存",
      "确定要清除搜索历史和临时文件吗？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "确定",
          onPress: async () => {
            setClearing(true);
            try {
              // 1. 清除搜索历史
              await SearchHistoryManager.clear();

              // 2. 清除 APK 缓存
              const dirUri = FileSystem.documentDirectory;
              if (dirUri) {
                const listing = await FileSystem.readDirectoryAsync(dirUri);
                for (const file of listing) {
                  if (file.endsWith('.apk')) {
                    await FileSystem.deleteAsync(dirUri + file, { idempotent: true });
                  }
                }
              }

              await calculateCacheSize();
              Toast.show({
                type: "success",
                text1: "清理完成",
              });
            } catch (e) {
              Alert.alert("错误", "清理缓存失败");
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  const handleClearHistory = async () => {
      Alert.alert(
          "清除播放记录",
          "确定要清除所有播放历史吗？此操作不可撤销。",
          [
              { text: "取消", style: "cancel" },
              {
                  text: "确定",
                  onPress: async () => {
                      setClearing(true);
                      try {
                          await PlayRecordManager.clearAll();
                          Toast.show({
                              type: "success",
                              text1: "清理完成",
                          });
                      } catch (e) {
                          Alert.alert("错误", "清理失败");
                      } finally {
                          setClearing(false);
                      }
                  },
              },
          ]
      );
  };

  return (
    <SettingsSection focusable={false}>
      <View style={styles.container}>
        <ThemedText style={styles.title}>存储管理</ThemedText>

        <View style={styles.row}>
          <View style={styles.info}>
            <ThemedText style={styles.label}>临时文件缓存</ThemedText>
            <ThemedText style={styles.value}>{cacheSize}</ThemedText>
          </View>
          <StyledButton
            onPress={handleClearCache}
            disabled={clearing}
            style={styles.actionButton}
          >
            {clearing ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={styles.buttonText}>清除</ThemedText>}
          </StyledButton>
        </View>

        <View style={[styles.row, { marginTop: 16 }]}>
          <View style={styles.info}>
            <ThemedText style={styles.label}>播放历史记录</ThemedText>
            <ThemedText style={styles.subtitle}>清除所有视频的观看进度</ThemedText>
          </View>
          <StyledButton
            onPress={handleClearHistory}
            variant="ghost"
            disabled={clearing}
            style={styles.actionButton}
          >
            <ThemedText style={[styles.buttonText, { color: '#ff4d4f' }]}>清除历史</ThemedText>
          </StyledButton>
        </View>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    color: 'white',
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: 'rgba(255,255,255,0.03)', // 为每一行添加微弱背景
    padding: 10,
    borderRadius: 8,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: "500",
  },
  value: {
    fontSize: 14,
    color: "#888",
    marginTop: 2,
  },
  subtitle: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  actionButton: {
    minWidth: 100, // 进一步增加宽度
    height: 42,
    borderRadius: 6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "bold",
  },
});
