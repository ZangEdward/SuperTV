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

  // 动画核心
  const dragX = useRef(new Animated.Value(0)).current;
  const indicatorBasePos = useRef(new Animated.Value(0)).current;
  const isTransitioning = useRef(false);

  // 实时位置映射
  const indicatorOffset = dragX.interpolate({
    inputRange: [-screenWidth, 0, screenWidth],
    outputRange: [tabWidth, 0, -tabWidth],
  });
  const totalIndicatorPos = Animated.add(indicatorBasePos, indicatorOffset);

  // 核心：页面透明度随着 dragX 实时淡入淡出
  const contentOpacity = dragX.interpolate({
    inputRange: [-screenWidth, -screenWidth * 0.5, 0, screenWidth * 0.5, screenWidth],
    outputRange: [0, 0.5, 1, 0.5, 0],
    extrapolate: 'clamp'
  });

  // 监听索引变化同步高亮
  useEffect(() => {
    if (isTabRoute) {
      Animated.spring(indicatorBasePos, {
        toValue: currentIndex * tabWidth,
        useNativeDriver: true,
        bounciness: 0,
        speed: 15,
      }).start();
    }
  }, [currentIndex, isTabRoute]);

  const handleTabPress = (route: string, direction = 'forward') => {
    if (pathname === route) return;
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
      const threshold = screenWidth * 0.2; // 极其灵敏的触发阈值
      const fastSwipeThreshold = 400;

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
      Animated.spring(dragX, {
        toValue: targetTranslate,
        velocity: velocityX / 1000,
        useNativeDriver: true,
        bounciness: 0,
        restSpeedThreshold: 20, // 提高停止速度，减少吸附等待
        restDisplacementThreshold: 20,
      }).start(({ finished }) => {
        if (finished && targetTranslate !== 0) {
          const direction = targetTranslate > 0 ? 'back' : 'forward';
          handleTabPress(filteredTabs[targetIndex].route, direction);

          // 【进场衔接】：新页面从镜像位置顺滑归位
          dragX.setValue(-targetTranslate);
          Animated.spring(dragX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 14,
          }).start(() => {
            isTransitioning.current = false;
          });
        } else {
          // 如果没有触发切页，则回弹原位
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
            opacity: contentOpacity // 全程由手指和物理弹簧驱动的透明度
          }
        ]}>
          {children}
        </Animated.View>
      </PanGestureHandler>
      
      {isTabRoute && (
        <View style={dynamicStyles.tabBar}>
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
