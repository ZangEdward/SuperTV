import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Home, Search, Heart, Settings, Tv } from 'lucide-react-native';
import { Colors } from '@/constants/Colors';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { DeviceUtils } from '@/utils/DeviceUtils';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

interface TabItem {
  key: string;
  label: string;
  icon: React.ComponentType<any>;
  route: string;
}

const tabs: TabItem[] = [
  { key: 'home', label: '首页', icon: Home, route: '/' },
  { key: 'search', label: '搜索', icon: Search, route: '/search' },
  { key: 'live', label: '直播', icon: Tv, route: '/live' },
  { key: 'favorites', label: '收藏', icon: Heart, route: '/favorites' },
  { key: 'settings', label: '设置', icon: Settings, route: '/settings' },
];

interface MobileTabContainerProps {
  children: React.ReactNode;
}

const MobileTabContainer: React.FC<MobileTabContainerProps> = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { spacing, deviceType } = useResponsiveLayout();
  
  // 在手机端过滤掉直播 tab
  const filteredTabs = tabs.filter(tab => 
    deviceType !== 'mobile' || tab.key !== 'live'
  );
  
  const handleTabPress = (route: string) => {
    // 使用 replace 避免在切换标签时堆叠历史记录
    router.replace(route as any);
  };

  const isTabActive = (route: string) => {
    if (route === '/' && pathname === '/') return true;
    if (route !== '/' && pathname === route) return true;
    return false;
  };

  const onGestureEvent = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const { translationX, velocityX } = event.nativeEvent;
      const currentIndex = filteredTabs.findIndex(t => isTabActive(t.route));

      // 识别滑动逻辑：位移超过 50 或 速度较快
      if (translationX > 100 || velocityX > 500) {
        // 向右划 -> 切换到左边的 Tab
        if (currentIndex > 0) {
          handleTabPress(filteredTabs[currentIndex - 1].route);
        }
      } else if (translationX < -100 || velocityX < -500) {
        // 向左划 -> 切换到右边的 Tab
        if (currentIndex < filteredTabs.length - 1) {
          handleTabPress(filteredTabs[currentIndex + 1].route);
        }
      }
    }
  };

  const dynamicStyles = createStyles(spacing);

  return (
    <View style={dynamicStyles.container}>
      {/* 内容区域：包装手势处理器 */}
      <PanGestureHandler
        onHandlerStateChange={onGestureEvent}
        activeOffsetX={[-20, 20]} // 避免轻微抖动触发
        failOffsetY={[-20, 20]}    // 允许上下滚动不干扰左右滑动
      >
        <View style={dynamicStyles.content}>
          {children}
        </View>
      </PanGestureHandler>
      
      {/* 底部导航栏 */}
      <View style={dynamicStyles.tabBar}>
        {filteredTabs.map((tab) => {
          const isActive = isTabActive(tab.route);
          const IconComponent = tab.icon;
          
          return (
            <TouchableOpacity
              key={tab.key}
              style={[dynamicStyles.tab, isActive && dynamicStyles.activeTab]}
              onPress={() => handleTabPress(tab.route)}
              activeOpacity={0.7}
            >
              <IconComponent
                size={20}
                color={isActive ? Colors.dark.primary : '#888'}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <Text style={[
                dynamicStyles.tabLabel,
                isActive && dynamicStyles.activeTabLabel
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const createStyles = (spacing: number) => {
  const minTouchTarget = DeviceUtils.getMinTouchTargetSize();
  
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.dark.background,
    },
    content: {
      flex: 1,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: '#1c1c1e',
      borderTopWidth: 1,
      borderTopColor: '#333',
      paddingTop: spacing / 2,
      paddingBottom: Platform.OS === 'ios' ? spacing * 2 : spacing,
      paddingHorizontal: spacing,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: minTouchTarget,
      paddingVertical: spacing / 2,
      borderRadius: 8,
    },
    activeTab: {
      backgroundColor: 'rgba(0, 187, 94, 0.1)', // 使用 primary 颜色的透明版
    },
    tabLabel: {
      fontSize: 11,
      color: '#888',
      marginTop: 2,
      fontWeight: '500',
    },
    activeTabLabel: {
      color: Colors.dark.primary,
      fontWeight: '600',
    },
  });
};

export default MobileTabContainer;
