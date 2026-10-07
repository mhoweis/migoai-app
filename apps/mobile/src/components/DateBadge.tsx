import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocale } from '../i18n';
import { colors, radius, type } from '../theme';

export default function DateBadge({ date }: { date: string }) {
  const { locale } = useLocale();
  const value = new Date(date);
  const month = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE' : 'en-AE', {
    month: 'short',
    timeZone: 'Asia/Dubai',
  }).format(value);
  const day = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE-u-nu-latn' : 'en-AE', {
    day: 'numeric',
    timeZone: 'Asia/Dubai',
  }).format(value);
  return (
    <View style={styles.badge}>
      <Text style={styles.month}>{month.toLocaleUpperCase(locale === 'ar' ? 'ar-AE' : 'en-AE')}</Text>
      <Text style={styles.day}>{day}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { minWidth: 48, paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center', borderRadius: radius.sm, backgroundColor: colors.surface },
  month: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  day: { ...type.h3, color: colors.ink, fontSize: 20, lineHeight: 24, fontFamily: type.display.fontFamily },
});
