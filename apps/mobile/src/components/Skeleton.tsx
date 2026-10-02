import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Props = { style?: StyleProp<ViewStyle> };

export function Skeleton({ style }: Props) {
  return <View style={[styles.base, style]} />;
}

export function EventListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.list} accessibilityLabel="Loading">
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.card}>
          <Skeleton style={styles.thumb} />
          <View style={styles.lines}>
            <Skeleton style={styles.lineShort} />
            <Skeleton style={styles.lineLong} />
            <Skeleton style={styles.lineMid} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function DetailSkeleton() {
  return (
    <View style={styles.detail} accessibilityLabel="Loading">
      <Skeleton style={styles.hero} />
      <View style={styles.detailBody}>
        <Skeleton style={styles.lineShort} />
        <Skeleton style={styles.titleLine} />
        <Skeleton style={styles.lineLong} />
        <Skeleton style={styles.lineMid} />
        <Skeleton style={styles.block} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.border, borderRadius: radius.sm },
  list: { padding: spacing.lg, gap: spacing.md },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  thumb: { width: 88, height: 88, borderRadius: radius.md },
  lines: { flex: 1, justifyContent: 'center', gap: 10 },
  lineShort: { height: 12, width: '35%' },
  lineLong: { height: 16, width: '90%' },
  lineMid: { height: 12, width: '60%' },
  titleLine: { height: 24, width: '80%' },
  detail: { flex: 1 },
  hero: { height: 320, borderRadius: 0 },
  detailBody: { padding: spacing.lg, gap: 14 },
  block: { height: 120, borderRadius: radius.lg, marginTop: spacing.sm },
});
