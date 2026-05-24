import { useEffect, useRef, useCallback } from "react";
import { useTVEventHandler as useTVEventHandlerRN, HWEvent } from "react-native";
import usePlayerStore from "@/stores/playerStore";
import { useResponsiveLayout } from "./useResponsiveLayout";

// 安全地获取 useTVEventHandler，兼容非 TV 平台
const useTVEventHandler = typeof useTVEventHandlerRN === 'function' ? useTVEventHandlerRN : (() => {}) as typeof useTVEventHandlerRN;

const SEEK_STEP = 20 * 1000; // 快进/快退的时间步长（毫秒）

// 定时器延迟时间（毫秒）
const CONTROLS_TIMEOUT = 5000;

/**
 * 管理播放器控件的显示/隐藏、遥控器事件和自动隐藏定时器。
 * @returns onScreenPress - 一个函数，用于处理屏幕点击事件，以显示控件并重置定时器。
 */
export const useTVRemoteHandler = () => {
  const { showControls, setShowControls, showEpisodeModal } = usePlayerStore();
  const { deviceType } = useResponsiveLayout();

  const showControlsRef = useRef(showControls);
  const showEpisodeModalRef = useRef(showEpisodeModal);

  useEffect(() => {
    showControlsRef.current = showControls;
  }, [showControls]);

  useEffect(() => {
    showEpisodeModalRef.current = showEpisodeModal;
  }, [showEpisodeModal]);

  const controlsTimer = useRef<NodeJS.Timeout | null>(null);
  const fastForwardIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 重置或启动隐藏控件的定时器
  const resetTimer = useCallback(() => {
    // 清除之前的定时器
    if (controlsTimer.current) {
      clearTimeout(controlsTimer.current);
    }
    // 设置新的定时器
    controlsTimer.current = setTimeout(() => {
      const { setShowControls } = usePlayerStore.getState();
      if (typeof setShowControls === 'function') setShowControls(false);
    }, CONTROLS_TIMEOUT);
  }, []);

  // 当控件显示时，启动定时器
  useEffect(() => {
    if (showControls) {
      resetTimer();
    } else {
      // 如果控件被隐藏，清除定时器
      if (controlsTimer.current) {
        clearTimeout(controlsTimer.current);
      }
    }

    // 组件卸载时清除定时器
    return () => {
      if (controlsTimer.current) {
        clearTimeout(controlsTimer.current);
      }
    };
  }, [showControls, resetTimer]);

  // 组件卸载时清除快进定时器
  useEffect(() => {
    return () => {
      if (fastForwardIntervalRef.current) {
        clearInterval(fastForwardIntervalRef.current);
      }
    };
  }, []);

  // 处理遥控器事件
  const handleTVEvent = useCallback(
    (event: HWEvent) => {
      if (showEpisodeModalRef.current) {
        return;
      }

      if (event.eventType === "longRight" || event.eventType === "longLeft") {
        if (event.eventKeyAction === 1) {
          if (fastForwardIntervalRef.current) {
            clearInterval(fastForwardIntervalRef.current);
            fastForwardIntervalRef.current = null;
          }
        }
      }

      resetTimer();

      if (showControlsRef.current) {
        // 如果控制条已显示，则不处理后台的快进/快退等操作
        // 避免与控制条上的按钮焦点冲突
        return;
      }

      switch (event.eventType) {
        case "select":
          {
            const { togglePlayPause } = usePlayerStore.getState();
            if (typeof togglePlayPause === 'function') togglePlayPause();
          }
          setShowControls?.(true);
          break;
        case "left":
          {
            const { seek } = usePlayerStore.getState();
            if (typeof seek === 'function') seek(-SEEK_STEP);
          }
          break;
        case "longLeft":
          if (!fastForwardIntervalRef.current && event.eventKeyAction === 0) {
            fastForwardIntervalRef.current = setInterval(() => {
              const { seek } = usePlayerStore.getState();
              if (typeof seek === 'function') seek(-SEEK_STEP);
            }, 200);
          }
          break;
        case "right":
          {
            const { seek } = usePlayerStore.getState();
            if (typeof seek === 'function') seek(SEEK_STEP);
          }
          break;
        case "longRight":
          // 长按开始: 启动连续快进
          if (!fastForwardIntervalRef.current && event.eventKeyAction === 0) {
            fastForwardIntervalRef.current = setInterval(() => {
              const { seek } = usePlayerStore.getState();
              if (typeof seek === 'function') seek(SEEK_STEP);
            }, 200);
          }
          break;
        case "down":
          setShowControls?.(true);
          break;
      }
    },
    [setShowControls, resetTimer]
  );

  // 始终挂载 hook，但在内部判断逻辑，符合 Rules of Hooks
  const handleTVEventCallback = useCallback((event: HWEvent) => {
    if (deviceType === 'tv') {
      handleTVEvent(event);
    }
  }, [deviceType, handleTVEvent]);

  useTVEventHandler(handleTVEventCallback);

  // 处理屏幕点击事件
  const onScreenPress = () => {
    // 切换控件的显示状态
    const newShowControls = !showControls;
    setShowControls?.(newShowControls);

    // 如果控件变为显示状态，则重置定时器
    if (newShowControls) {
      resetTimer?.();
    }
  };

  return { onScreenPress };
};
