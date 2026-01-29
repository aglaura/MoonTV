import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
  onLongPress: () => void;
  onClick?: () => void;
  longPressDelay?: number;
  moveThreshold?: number;
}

interface TouchPosition {
  x: number;
  y: number;
}

export const useLongPress = ({
  onLongPress,
  onClick,
  longPressDelay = 500,
  moveThreshold = 10,
}: UseLongPressOptions) => {
  const isLongPress = useRef(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const startPosition = useRef<TouchPosition | null>(null);
  const isActive = useRef(false); // 防止重复触发
  const wasButton = useRef(false); // 记录触摸开始时是否是按钮
  const wasScroll = useRef(false);

  const clearTimer = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    isLongPress.current = false;
    startPosition.current = null;
    isActive.current = false;
    wasButton.current = false;
    wasScroll.current = false;
  }, []);

  const handleStart = useCallback(
    (clientX: number, clientY: number, isButton = false) => {
      // 如果已经有活跃的手势，忽略新的开始
      if (isActive.current) {
        return;
      }

      isActive.current = true;
      isLongPress.current = false;
      startPosition.current = { x: clientX, y: clientY };
      wasScroll.current = false;

      // 记录触摸开始时是否是按钮
      wasButton.current = isButton;

      pressTimer.current = setTimeout(() => {
        // 再次检查是否仍然活跃
        if (!isActive.current) return;

        isLongPress.current = true;

        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

      // 触发长按事件
      onLongPress();
    }, longPressDelay);
  },
  [onLongPress, longPressDelay]
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!startPosition.current || !isActive.current) return;

      const dx = clientX - startPosition.current.x;
      const dy = clientY - startPosition.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const scrollThreshold = Math.max(4, Math.floor(moveThreshold * 0.6));

      // 任何方向移动超过滚动阈值，都视为滚动并取消长按
      if (Math.abs(dx) > scrollThreshold || Math.abs(dy) > scrollThreshold) {
        wasScroll.current = true;
        clearTimer();
        isActive.current = false;
        return;
      }

      // 如果移动距离超过阈值，取消长按
      if (distance > moveThreshold) {
        clearTimer();
        isActive.current = false;
      }
    },
    [clearTimer, moveThreshold]
  );

  const handleEnd = useCallback(() => {
    clearTimer();

    // 根据情况决定是否触发点击事件：
    // 1. 如果是长按，不触发点击
    // 2. 如果不是长按且触摸开始时是按钮，不触发点击
    // 3. 否则触发点击
    const shouldClick =
      !isLongPress.current &&
      !wasButton.current &&
      !wasScroll.current &&
      onClick &&
      isActive.current;

    if (shouldClick) {
      onClick();
    }

    // 重置所有状态
    resetState();
  }, [clearTimer, onClick, resetState]);

  // 触摸事件处理器
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // 检查是否触摸的是按钮或其他交互元素
      const target = e.target as HTMLElement;
      const buttonElement = target.closest('[data-button]');

      // 更精确的按钮检测：只有当触摸目标直接是按钮元素或其直接子元素时才认为是按钮
      const isDirectButton = target.hasAttribute('data-button');
      const isButton = !!buttonElement && isDirectButton;

      // 阻止默认的长按行为，但不阻止触摸开始事件
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY, !!isButton);
    },
    [handleStart]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    },
    [handleMove]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      handleEnd();
    },
    [handleEnd]
  );

  const onTouchCancel = useCallback(() => {
    clearTimer();
    resetState();
  }, [clearTimer, resetState]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
};
