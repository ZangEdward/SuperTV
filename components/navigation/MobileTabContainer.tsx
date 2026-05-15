import React, { useEffect, useRef, useMemo } from 'react';
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
  
  const filteredTabs = useMemo(() =>
    tabs.filter(tab => deviceType !== 'mobile' || tab.key !== 'live'),
    [deviceType]
  );
  
  const currentIndex = useMemo(() => {
    return filteredTabs.findIndex(t => {
      if (t.route === '/' && pathname === '/') return true;
      if (t.route !== '/' && pathname.startsWith(t.route)) return true;
      return false;
    });
  }, [pathname, filteredTabs]);

  const isTabRoute = currentIndex !== -1;
  const screenWidth = Dimensions.get('window').width;
  const tabBarWidth = screenWidth - spacing * 2;
  const tabWidth = tabBarWidth / filteredTabs.length;

  // 动画值使用 Ref 保持
  const dragX = useRef(new Animated.Value(0)).current; // 实时拖拽偏移
  const indicatorBasePos = useRef(new Animated.Value(0)).current; // 基础高亮位置

  // 实时高亮位置 = 基础位置 + (手势位移的反向映射)
  const indicatorOffset = dragX.interpolate({
    inputRange: [-screenWidth, 0, screenWidth],
    outputRange: [tabWidth, 0, -tabWidth],
  });
  const totalIndicatorPos = Animated.add(indicatorBasePos, indicatorOffset);

  // 同步基础位置
  useEffect(() => {
    if (isTabRoute) {
      Animated.spring(indicatorBasePos, {
        toValue: currentIndex * tabWidth,
        useNativeDriver: true,
        bounciness: 0,
        speed: 12,
      }).start();
    }
  }, [currentIndex, tabWidth, isTabRoute]);

  const handleTabPress = (route: string, direction = 'forward') => {
    if (pathname === route) return;
    router.replace({
      pathname: route,
      params: { noAnim: 'true', dir: direction }
    } as any);
  };

  // 响应手势事件：跟手核心
  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: dragX } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: any) => {
    if (!isTabRoute) return;

    const { state, translationX, velocityX } = event.nativeEvent;

    if (state === State.END || state === State.CANCELLED) {
      const threshold = screenWidth * 0.25; // 降低阈值，更灵敏
      const fastSwipeThreshold = 500;

      // 决定去向
      let targetTranslate = 0;
      let targetIndex = currentIndex;

      if (translationX > threshold || velocityX > fastSwipeThreshold) {
        // 向右划 -> 尝试去左边的 Tab
        if (currentIndex > 0) {
          targetTranslate = screenWidth;
          targetIndex = currentIndex - 1;
        }
      } else if (translationX < -threshold || velocityX < -fastSwipeThreshold) {
        // 向左划 -> 尝试去右边的 Tab
        if (currentIndex < filteredTabs.length - 1) {
          targetTranslate = -screenWidth;
          targetIndex = currentIndex + 1;
        }
      }

      // 执行物理动画：平滑且可打断感
      Animated.spring(dragX, {
        toValue: targetTranslate,
        velocity: velocityX / 1000, // 将原生速度传入，实现惯性衔接
        useNativeDriver: true,
        bounciness: 0,
        restSpeedThreshold: 1,
        restDisplacementThreshold: 1,
      }).start(({ finished }) => {
        if (finished && targetTranslate !== 0) {
          // 动画完成后瞬间切换路由
          const direction = targetTranslate > 0 ? 'back' : 'forward';
          handleTabPress(filteredTabs[targetIndex].route, direction);
          // 瞬间复位拖拽值，因为路由已经变了
          dragX.setValue(0);
        } else if (finished) {
          // 回弹完成
          dragX.setValue(0);
        }
      });
    }
  };

  const dynamicStyles = createStyles(spacing, tabWidth);

  if (deviceType !== 'mobile') return <>{children}</>;

  return (
    <View style={dynamicStyles.container}>
      {/* 内容区域：包装手势处理器 */}
      <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
        activeOffsetX={[-10, 10]} // 极大提升手势触发灵敏度
        failOffsetY={[-30, 30]}  // 允许一定的上下误差，但不影响滚动
      >
        <Animated.View style={[
          dynamicStyles.content,
          {
            transform: [{ translateX: dragX }],
            opacity: dragX.interpolate({
              inputRange: [-screenWidth, 0, screenWidth],
              outputRange: [0.8, 1, 0.8] // 增加透明度变化，提升视觉反馈
            })
          }
        ]}>
          {children}
        </Animated.View>
      </PanGestureHandler>
      
      {/* 底部导航栏 */}
      {isTabRoute && (
        <View style={dynamicStyles.tabBar}>
          <View style={dynamicStyles.tabBarInner}>
            {/* 绿色高亮指示器：实时映射手势位移 */}
            <Animated.View
              style={[
                dynamicStyles.indicator,
                { transform: [{ translateX: totalIndicatorPos }] }
              ]}
            />

            {filteredTabs.map((tab, index) => {
              const isActive = index === currentIndex;
              const IconComponent = tab.icon;

              return (
                <TouchableOpacity
                  key={tab.key}
                  style={dynamicStyles.tab}
                  onPress={() => {
                    // 点击切换：平滑移动高亮后切页
                    Animated.spring(indicatorBasePos, {
                      toValue: index * tabWidth,
                      useNativeDriver: true,
                      bounciness: 0,
                    }).start(() => handleTabPress(tab.route, index < currentIndex ? 'back' : 'forward'));
                  }}
                  activeOpacity={1}
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
      )}
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
      zIndex: 1,
    },
    indicator: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: tabWidth,
      backgroundColor: 'rgba(0, 187, 94, 0.15)',
      borderRadius: 12,
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
