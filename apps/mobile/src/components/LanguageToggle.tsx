import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { setLocale, useLocale } from '../i18n';

export function LanguageToggle() {
  const { locale, t } = useLocale();
  const label = locale === 'ar' ? t('english') : t('arabic');

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => void setLocale(locale === 'ar' ? 'en' : 'ar')}
      style={styles.toggle}
    >
      <Ionicons name="globe-outline" size={16} color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  toggle: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    marginTop: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  label: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
