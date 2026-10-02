import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, PressableProps, PressableStateCallbackType, StyleProp, ViewStyle } from 'react-native';
import { motion } from '../theme';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children?: React.ReactNode;
};

export function PressableScale({ style, scaleTo = 0.97, children, ...rest }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted) setReduceMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return (
    <Pressable
      {...rest}
      style={({ pressed }: PressableStateCallbackType) => [
        style,
        pressed && !reduceMotion && { transform: [{ scale: scaleTo }], opacity: 0.94 },
        { transitionDuration: `${motion.press}ms`, transitionTimingFunction: 'ease-out' } as ViewStyle,
      ]}
    >
      {children}
    </Pressable>
  );
}
