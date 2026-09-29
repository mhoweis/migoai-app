import React from 'react';
import { Pressable, PressableProps, PressableStateCallbackType, StyleProp, ViewStyle } from 'react-native';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children?: React.ReactNode;
};

export function PressableScale({ style, scaleTo = 0.97, children, ...rest }: Props) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }: PressableStateCallbackType) => [style, pressed && { transform: [{ scale: scaleTo }], opacity: 0.94 }]}
    >
      {children}
    </Pressable>
  );
}
