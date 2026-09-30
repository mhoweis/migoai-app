import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useBreakpoint } from '../hooks/useBreakpoint';

export default function Container({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { contentMaxWidth, gutter } = useBreakpoint();
  return <View style={[styles.container, { maxWidth: contentMaxWidth, paddingHorizontal: gutter }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { width: '100%', alignSelf: 'center' },
});
