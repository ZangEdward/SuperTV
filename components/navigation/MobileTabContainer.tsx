import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform, Animated, Dimensions } from 'react-native';
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
  
  const currentIndex = filteredTabs.findIndex(t => {
    if (t.route === '/' && pathname === '/') return true;
    if (t.route !== '/' && pathname === t.route) return true;
    return false;
  });

  const indicatorAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;
  const tabBarWidth = screenWidth - spacing * 2;
  const tabWidth = tabBarWidth / filteredTabs.length;

  useEffect(() => {
    if (currentIndex !== -1) {
      Animated.spring(indicatorAnim, {
        toValue: currentIndex * tabWidth,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    }
  }, [currentIndex, tabWidth]);

  const handleTabPress = (route: string, withAnim = true, direction = 'forward') => {
    // 点击按钮切换不要动画
    router.replace({
      pathname: route,
      params: {
        noAnim: !withAnim ? 'true' : 'false',
        dir: direction
      }
    } as any);
  };

  const onGestureEvent = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const { translationX, velocityX } = event.nativeEvent;

      // 识别滑动逻辑：位移超过 80 或 速度较快
      if (translationX > 80 || velocityX > 400) {
        // 向右划 (Finger L->R) -> 切换到左边的 Tab
        if (currentIndex > 0) {
          handleTabPress(filteredTabs[currentIndex - 1].route, true, 'back');
        }
      } else if (translationX < -80 || velocityX < -400) {
        // 向左划 (Finger R->L) -> 切换到右边的 Tab
        if (currentIndex < filteredTabs.length - 1) {
          handleTabPress(filteredTabs[currentIndex + 1].route, true, 'forward');
        }
      }
    }
  };

  const dynamicStyles = createStyles(spacing, tabWidth);

  return (
    <View style={dynamicStyles.container}>
      {/* 内容区域：包装手势处理器 */}
      <PanGestureHandler
        onHandlerStateChange={onGestureEvent}
        activeOffsetX={[-20, 20]}
        failOffsetY={[-20, 20]}
      >
        <View style={dynamicStyles.content}>
          {children}
        </View>
      </PanGestureHandler>
      
      {/* 底部导航栏 */}
      <View style={dynamicStyles.tabBar}>
        <View style={dynamicStyles.tabBarInner}>
          {/* 绿色高亮指示器：背景层，不随标签移动 */}
          <Animated.View
            style={[
              dynamicStyles.indicator,
              { transform: [{ translateX: indicatorAnim }] }
            ]}
          />
          
          {filteredTabs.map((tab, index) => {
            const isActive = index === currentIndex;
            const IconComponent = tab.icon;

            return (
              <TouchableOpacity
                key={tab.key}
                style={dynamicStyles.tab}
                onPress={() => handleTabPress(tab.route, false)} // 点击按钮不要动画
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
    </View>
  );
};

const createStyles = (spacing: number, tabWidth: number) => {
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
      backgroundColor: '#1c1c1e',
      borderTopWidth: 1,
      borderTopColor: '#333',
      paddingTop: spacing / 2,
      paddingBottom: Platform.OS === 'ios' ? spacing * 2 : spacing,
      paddingHorizontal: spacing,
    },
    tabBarInner: {
      flexDirection: 'row',
      position: 'relative',
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: minTouchTarget,
      paddingVertical: spacing / 2,
      zIndex: 1, // 确保标签在指示器之上
    },
    indicator: {
      position: 'absolute',
      top: spacing / 4,
      bottom: spacing / 4,
      width: tabWidth,
      backgroundColor: 'rgba(0, 187, 94, 0.15)', // 绿色高亮
      borderRadius: 8,
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
