import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform, Animated, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter, usePathname } from 'expo-router';
import { Home, Search, Heart, Settings, Tv } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { DeviceUtils } from '../../utils/DeviceUtils';
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
  const tabBarPadding = spacing;
  const tabBarWidth = screenWidth - tabBarPadding * 2;
  const tabWidth = tabBarWidth / filteredTabs.length;

  const dragX = useRef(new Animated.Value(0)).current;
  const indicatorBasePos = useRef(new Animated.Value(0)).current;
  const isTransitioning = useRef(false);
  const skipIndicatorAnimation = useRef(false);

  const indicatorOffset = dragX.interpolate({
    inputRange: [-screenWidth, 0, screenWidth],
    outputRange: [tabWidth, 0, -tabWidth],
  });
  const totalIndicatorPos = Animated.add(indicatorBasePos, indicatorOffset);

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

    if (state === State.BEGAN) {
      dragX.stopAnimation();
      isTransitioning.current = false;
    }

    if (state === State.END || state === State.CANCELLED) {
      const threshold = screenWidth * 0.15;
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

      Animated.timing(dragX, {
        toValue: targetTranslate,
        duration: targetTranslate === 0 ? 200 : 150,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && targetTranslate !== 0) {
          const direction = targetTranslate > 0 ? 'back' : 'forward';
          handleTabPress(filteredTabs[targetIndex].route, direction, true);
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
      <View style={dynamicStyles.contentWrapper}>
        {enableSwipe ? (
          <PanGestureHandler
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onHandlerStateChange}
            activeOffsetX={[-5, 5]}
            failOffsetY={[-50, 50]}
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
      </View>
      
      {isTabRoute && (
        <View style={dynamicStyles.tabBarContainer}>
          <BlurView tint="dark" intensity={60} style={dynamicStyles.tabBar}>
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
          </BlurView>
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
    contentWrapper: {
      flex: 1,
    },
    content: {
      flex: 1,
    },
    tabBarContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: spacing,
      paddingBottom: Platform.OS === 'ios' ? spacing * 1.5 : spacing,
      backgroundColor: 'transparent',
    },
    tabBar: {
      borderRadius: 24,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.1)',
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    tabBarInner: {
      flexDirection: 'row',
      position: 'relative',
      height: 60,
      alignItems: 'center',
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      zIndex: 1,
    },
    indicator: {
      position: 'absolute',
      height: 44,
      width: tabWidth - 8,
      marginHorizontal: 4,
      backgroundColor: 'rgba(0, 187, 94, 0.15)',
      borderRadius: 18,
    },
    tabLabel: {
      fontSize: 10,
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
