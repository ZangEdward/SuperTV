import React, { useState, useEffect } from "react";
import { View, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { ThemedText } from "../ThemedText";
import { StyledButton } from "../StyledButton";
import { SettingsSection } from "./SettingsSection";
import { PlayRecordManager } from "@/services/storage";
import { CacheService } from "@/services/cacheService";
import useCacheStore from "@/stores/cacheStore";
import Toast from "react-native-toast-message";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

export function CacheSection() {
  const router = useRouter();
  const { deviceType } = useResponsiveLayout();
  const isMobile = deviceType === 'mobile';

  const { clearCache } = useCacheStore();
  const [clearing, setClearing] = useState(false);
  const [cacheSize, setCacheSize] = useState<string>("0 MB");

  useEffect(() => {
    if (isMobile) calculateCacheSize();
  }, [isMobile]);

  const calculateCacheSize = async () => {
    try {
      const totalSize = await CacheService.calculateCacheSize();
      setCacheSize((totalSize / (1024 * 1024)).toFixed(2) + " MB");
    } catch (e) {
      console.warn("计算缓存大小失败:", e);
    }
  };

  const handleClearCache = async () => {
    Alert.alert(
      "清除缓存",
      "确定要清除已下载的缓存视频吗？此操作不可撤销。",
      [
        { text: "取消", style: "cancel" },
        {
          text: "确定",
          onPress: async () => {
            setClearing(true);
            try {
              await clearCache();
              await calculateCacheSize();
              Toast.show({
                type: "success",
                text1: "缓存已清除",
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

        {isMobile && (
          <View style={styles.row}>
            <View style={styles.info}>
              <ThemedText style={styles.label}>已下载缓存</ThemedText>
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
        )}

        <View style={[styles.row, { marginTop: isMobile ? 16 : 0 }]}>
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

        {isMobile && (
          <View style={[styles.row, { marginTop: 16 }]}>
            <View style={styles.info}>
              <ThemedText style={styles.label}>缓存管理</ThemedText>
              <ThemedText style={styles.subtitle}>进入缓存管理页面查看已下载视频</ThemedText>
            </View>
            <StyledButton
              text="查看"
              onPress={() => router.push("/cache-management")}
              style={styles.actionButton}
            />
          </View>
        )}
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
    minWidth: 100,
    minHeight: 40,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
