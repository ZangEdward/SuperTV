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

  // 核心动画值
  const translateX = useRef(new Animated.Value(0)).current; // 页面位移
  const indicatorBasePos = useRef(new Animated.Value(0)).current; // 基础高亮位置

  // 实时高亮位置 = 基础位置 + (手势位移的反向映射)
  // 当页面右滑(translationX为正)时，高亮应该左移。映射比例为 tabWidth / screenWidth
  const indicatorOffset = Animated.multiply(translateX, -tabWidth / screenWidth);
  const totalIndicatorPos = Animated.add(indicatorBasePos, indicatorOffset);

  // 当索引改变时，同步更新基础位置
  useEffect(() => {
    if (isTabRoute) {
      Animated.spring(indicatorBasePos, {
        toValue: currentIndex * tabWidth,
        useNativeDriver: true,
        tension: 60,
        friction: 9,
      }).start();
    }
  }, [currentIndex, tabWidth]);

  const handleTabPress = (route: string, direction = 'forward') => {
    if (pathname === route) return;
    router.replace({
      pathname: route,
      params: { noAnim: 'true', dir: direction }
    } as any);
  };

  // 响应手势
  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: any) => {
    if (!isTabRoute) return;

    if (event.nativeEvent.state === State.END || event.nativeEvent.state === State.CANCELLED) {
      const { translationX, velocityX } = event.nativeEvent;
      const threshold = screenWidth * 0.35; // 滑动超过 35% 触发切换

      if (translationX > threshold || velocityX > 500) {
        // 尝试向左切 (Finger -> Right)
        if (currentIndex > 0) {
          // 先把高亮条动画到目标位置，然后瞬间切页
          Animated.parallel([
            Animated.spring(translateX, { toValue: screenWidth, useNativeDriver: true, bounciness: 0 }),
            Animated.spring(indicatorBasePos, { toValue: (currentIndex - 1) * tabWidth, useNativeDriver: true })
          ]).start(() => {
            translateX.setValue(0);
            handleTabPress(filteredTabs[currentIndex - 1].route, 'back');
          });
          return;
        }
      } else if (translationX < -threshold || velocityX < -500) {
        // 尝试向右切 (Finger -> Left)
        if (currentIndex < filteredTabs.length - 1) {
          Animated.parallel([
            Animated.spring(translateX, { toValue: -screenWidth, useNativeDriver: true, bounciness: 0 }),
            Animated.spring(indicatorBasePos, { toValue: (currentIndex + 1) * tabWidth, useNativeDriver: true })
          ]).start(() => {
            translateX.setValue(0);
            handleTabPress(filteredTabs[currentIndex + 1].route, 'forward');
          });
          return;
        }
      }

      // 否则：回弹
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    }
  };

  const dynamicStyles = createStyles(spacing, tabWidth);

  if (deviceType !== 'mobile') return <>{children}</>;

  return (
    <View style={dynamicStyles.container}>
      <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
        activeOffsetX={[-20, 20]}
      >
        <Animated.View style={[dynamicStyles.content, { transform: [{ translateX }] }]}>
          {children}
        </Animated.View>
      </PanGestureHandler>
      
      {isTabRoute && (
        <View style={dynamicStyles.tabBar}>
          <View style={dynamicStyles.tabBarInner}>
            {/* 实时跟随手指的高亮指示器 */}
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
                    // 点击切换时，先把高亮条滑过去，再执行 replace
                    Animated.spring(indicatorBasePos, {
                      toValue: index * tabWidth,
                      useNativeDriver: true,
                      speed: 20
                    }).start(() => handleTabPress(tab.route));
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
    container: { flex: 1, backgroundColor: Colors.dark.background },
    content: { flex: 1 },
    tabBar: {
      backgroundColor: '#1c1c1e',
      borderTopWidth: 1,
      borderTopColor: '#333',
      paddingTop: spacing / 2,
      paddingBottom: Platform.OS === 'ios' ? spacing * 2 : spacing,
      paddingHorizontal: spacing,
    },
    tabBarInner: { flexDirection: 'row', position: 'relative' },
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
    tabLabel: { fontSize: 11, color: '#888', marginTop: 2, fontWeight: '500' },
    activeTabLabel: { color: Colors.dark.primary, fontWeight: '600' },
  });
};

export default MobileTabContainer;
