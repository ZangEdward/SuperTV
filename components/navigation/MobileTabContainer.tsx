import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform, Animated, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
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
  const enableSwipe = isTabRoute;
  const screenWidth = Dimensions.get('window').width;
  const tabBarWidth = screenWidth - spacing * 2;
  const tabWidth = tabBarWidth / filteredTabs.length;

  // 动画核心
  const dragX = useRef(new Animated.Value(0)).current;
  const indicatorBasePos = useRef(new Animated.Value(0)).current;
  const isTransitioning = useRef(false);
  const skipIndicatorAnimation = useRef(false);

  // 实时位置映射
  const indicatorOffset = dragX.interpolate({
    inputRange: [-screenWidth, 0, screenWidth],
    outputRange: [tabWidth, 0, -tabWidth],
  });
  const totalIndicatorPos = Animated.add(indicatorBasePos, indicatorOffset);

  // 监听索引变化同步高亮
  useEffect(() => {
    if (!isTabRoute) return;

    const nextPosition = currentIndex * tabWidth;
    if (skipIndicatorAnimation.current) {
      indicatorBasePos.setValue(nextPosition);
      skipIndicatorAnimation.current = false;
      return;
    }

    Animated.spring(indicatorBasePos, {
      toValue: nextPosition,
      useNativeDriver: true,
      bounciness: 0,
      speed: 15,
    }).start();
  }, [currentIndex, indicatorBasePos, isTabRoute, tabWidth]);

  const handleTabPress = (route: string, direction = 'forward', skipAnimation = false) => {
    if (pathname === route) return;
    skipIndicatorAnimation.current = skipAnimation;
    router.replace({
      pathname: route,
      params: { noAnim: 'true', dir: direction }
    } as any);
  };

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: dragX } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: any) => {
    if (!isTabRoute) return;

    const { state, translationX, velocityX } = event.nativeEvent;

    // 手指触摸瞬间，如果正在动画，则立即停止（打断）
    if (state === State.BEGAN) {
      dragX.stopAnimation();
      isTransitioning.current = false;
    }

    if (state === State.END || state === State.CANCELLED) {
      const threshold = screenWidth * 0.15; // 更灵敏
      const fastSwipeThreshold = 300;

      let targetTranslate = 0;
      let targetIndex = currentIndex;

      if (translationX > threshold || velocityX > fastSwipeThreshold) {
        if (currentIndex > 0) {
          targetTranslate = screenWidth;
          targetIndex = currentIndex - 1;
        }
      } else if (translationX < -threshold || velocityX < -fastSwipeThreshold) {
        if (currentIndex < filteredTabs.length - 1) {
          targetTranslate = -screenWidth;
          targetIndex = currentIndex + 1;
        }
      }

      isTransitioning.current = true;

      // 使用 timing 代替 spring 以获得更确定的完成时间，减少“割裂感”
      Animated.timing(dragX, {
        toValue: targetTranslate,
        duration: targetTranslate === 0 ? 200 : 150,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && targetTranslate !== 0) {
          const direction = targetTranslate > 0 ? 'back' : 'forward';

          // 在路由切换前先将位置重置，但为了平滑，我们不在这一帧切换
          // 而是通过 router.replace 的 noAnim 配合
          handleTabPress(filteredTabs[targetIndex].route, direction, true);

          // 延迟极短时间重置 dragX，确保新页面已渲染
          setTimeout(() => {
            dragX.setValue(0);
            isTransitioning.current = false;
          }, 0);
        } else {
          dragX.setValue(0);
          isTransitioning.current = false;
        }
      });
    }
  };

  const dynamicStyles = createStyles(spacing, tabWidth);

  if (deviceType !== 'mobile') return <>{children}</>;

  return (
    <View style={dynamicStyles.container}>
      {enableSwipe ? (
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
          activeOffsetX={[-5, 5]} // 极高灵敏度
          failOffsetY={[-50, 50]}  // 允许更大的垂直误差，不轻易中断滑动
          shouldCancelWhenOutside={false}
        >
          <Animated.View style={[
            dynamicStyles.content,
            {
              transform: [{ translateX: dragX }],
            }
          ]}>
            {children}
          </Animated.View>
        </PanGestureHandler>
      ) : (
        <View style={dynamicStyles.content}>{children}</View>
      )}
      
      {isTabRoute && (
        <BlurView tint="dark" intensity={80} style={dynamicStyles.tabBar}>
          <View style={dynamicStyles.tabBarInner}>
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
                  onPress={() => handleTabPress(tab.route, index < currentIndex ? 'back' : 'forward')}
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
      overflow: 'hidden' as any,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255, 255, 255, 0.15)',
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
