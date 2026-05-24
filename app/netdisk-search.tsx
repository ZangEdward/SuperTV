import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, TextInput, StyleSheet, Alert, Keyboard, TouchableOpacity, ScrollView, Linking, FlatList, Clipboard, Platform } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { StyledButton } from "@/components/StyledButton";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import ResponsiveHeader from "@/components/navigation/ResponsiveHeader";
import { Colors } from "@/constants/Colors";
import useNetDiskStore, { NetDiskItem } from "@/stores/netdiskStore";
import { Search, Copy, ExternalLink, QrCode, Settings } from "lucide-react-native";
import { useRemoteControlStore } from "@/stores/remoteControlStore";
import { RemoteControlModal } from "@/components/RemoteControlModal";
import { useSettingsStore } from "@/stores/settingsStore";
import VideoLoadingAnimation from "@/components/VideoLoadingAnimation";
import Toast from "react-native-toast-message";
import { useRouter } from "expo-router";

export default function NetDiskSearchScreen() {
  const { keyword, results, loading, error, setKeyword, search } = useNetDiskStore();
  const [activeTab, setActiveTab] = useState<string>('');
  const textInputRef = useRef<TextInput>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const router = useRouter();

  // 当结果更新时，如果没有选中的 Tab 或当前 Tab 已失效，默认选中第一个
  useEffect(() => {
    const keys = Object.keys(results);
    if (keys.length > 0 && (!activeTab || !results[activeTab])) {
      setActiveTab(keys[0]);
    }
  }, [results, activeTab]);

  const { showModal: showRemoteModal, lastMessage, targetPage, clearMessage } = useRemoteControlStore();
  const { remoteInputEnabled } = useSettingsStore();

  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  useEffect(() => {
    if (lastMessage && targetPage === 'netdisk') {
      const realMessage = lastMessage.split("_")[0];
      setKeyword(realMessage);
      search(realMessage);
      clearMessage();
    }
  }, [lastMessage, targetPage, setKeyword, search, clearMessage]);

  const handleSearch = () => {
    if (!keyword.trim()) return;
    Keyboard.dismiss();
    search();
  };

  const handleQrPress = () => {
    if (!remoteInputEnabled) {
      Alert.alert("远程输入未启用", "请先在设置页面中启用远程输入功能");
      return;
    }
    showRemoteModal('netdisk');
  };

  const handleOpenUrl = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert("错误", "无法打开链接，可能未安装相关应用");
    });
  };

  const handleCopy = (text: string) => {
    Clipboard.setString(text);
    Toast.show({ type: 'success', text1: '已复制到剪贴板' });
  };

  const getTypeName = (type: string) => {
    const map: Record<string, string> = {
      quark: '夸克',
      magnet: '磁力',
      baidu: '百度',
      aliyun: '阿里',
      xunlei: '迅雷',
      pikpak: 'PikPak',
      uc: 'UC',
    };
    return map[type] || type.toUpperCase();
  };

  const renderItem = ({ item }: { item: NetDiskItem }) => (
    <View style={styles.resultCard}>
      <View style={styles.cardHeader}>
        <ThemedText style={styles.cardSource}>{item.source}</ThemedText>
        <ThemedText style={styles.cardTime}>{new Date(item.datetime).toLocaleDateString()}</ThemedText>
      </View>
      <ThemedText style={styles.cardNote} numberOfLines={3}>{item.note}</ThemedText>
      <View style={styles.cardActions}>
        <StyledButton
          variant="ghost"
          style={styles.actionBtn}
          onPress={() => handleCopy(item.url)}
        >
          <Copy size={16} color={Colors.dark.primary} />
          <ThemedText style={styles.actionText}>复制链接</ThemedText>
        </StyledButton>
        <StyledButton
          variant="primary"
          style={styles.actionBtn}
          onPress={() => handleOpenUrl(item.url)}
        >
          <ExternalLink size={16} color="white" />
          <ThemedText style={[styles.actionText, { color: 'white' }]}>直接打开</ThemedText>
        </StyledButton>
      </View>
    </View>
  );

  const currentData = activeTab ? results[activeTab] || [] : [];
  const tabs = Object.keys(results);

  return (
    <ResponsiveNavigation>
      <ResponsiveHeader
        title="盘搜"
        showBackButton={false}
        rightElement={
          <TouchableOpacity onPress={() => router.push("/settings")}>
            <Settings size={22} color="#888" />
          </TouchableOpacity>
        }
      />
      <ThemedView style={[commonStyles.container, { paddingTop: deviceType === 'tv' ? 20 : 0 }]}>
        <View style={styles.headerSection}>
          <View style={styles.searchBar}>
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.inputContainer, isInputFocused && { borderColor: Colors.dark.primary }]}
              onPress={() => textInputRef.current?.focus()}
            >
              <TextInput
                ref={textInputRef}
                style={styles.input}
                placeholder="搜索网盘资源..."
                placeholderTextColor="#888"
                value={keyword}
                onChangeText={setKeyword}
                onSubmitEditing={handleSearch}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
              />
            </TouchableOpacity>
            <StyledButton style={styles.iconBtn} onPress={handleSearch}>
              <Search size={24} color="white" />
            </StyledButton>
            {deviceType !== 'mobile' && (
              <StyledButton style={styles.iconBtn} onPress={handleQrPress}>
                <QrCode size={24} color="white" />
              </StyledButton>
            )}
          </View>

          {tabs.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
              <View style={styles.tabContainer}>
                {tabs.map((tab) => (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.tab, activeTab === tab && styles.activeTab]}
                    onPress={() => setActiveTab(tab)}
                  >
                    <ThemedText style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                      {getTypeName(tab)} ({results[tab].length})
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        {loading ? (
          <VideoLoadingAnimation />
        ) : error ? (
          <View style={styles.centerBox}><ThemedText style={{ color: '#888' }}>{error}</ThemedText></View>
        ) : tabs.length === 0 ? (
          <View style={styles.centerBox}><ThemedText style={{ color: '#888' }}>暂无结果</ThemedText></View>
        ) : (
          <FlatList
            data={currentData}
            renderItem={renderItem}
            keyExtractor={(item, index) => `${activeTab}-${index}`}
            contentContainerStyle={styles.listContent}
            numColumns={deviceType === 'mobile' ? 1 : 2}
            style={styles.resultsList}
          />
        )}
      </ThemedView>
      <RemoteControlModal />
    </ResponsiveNavigation>
  );
}

const styles = StyleSheet.create({
  headerSection: {
    zIndex: 10,
    backgroundColor: '#151718', // 确保背景不透明，防止列表内容穿透
    paddingBottom: 4,
  },
  searchBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  inputContainer: {
    flex: 1,
    height: 48,
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  input: {
    color: 'white',
    fontSize: 16,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  tabScroll: {
    maxHeight: 50,
    marginBottom: 8,
    flexGrow: 0, // 确保不会撑开
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    height: 40,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#1c1c1e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: Colors.dark.primary,
  },
  tabText: {
    fontSize: 14,
    color: '#888',
  },
  activeTabText: {
    color: 'white',
    fontWeight: 'bold',
  },
  resultsList: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    paddingBottom: 30,
  },
  resultCard: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    margin: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardSource: {
    fontSize: 12,
    color: Colors.dark.primary,
    fontWeight: 'bold',
  },
  cardTime: {
    fontSize: 12,
    color: '#666',
  },
  cardNote: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    color: '#eee',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 6,
    minHeight: 36,
    gap: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.dark.primary,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
