import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocale } from '../i18n';
import { colors, spacing, type } from '../theme';

const TrailingActions = View as unknown as React.ComponentType<any>;

export default function SectionHeader({ title, subtitle, onSeeAll, actionLabel, actionRole, horizontalInset = 0, trailingContent }: { title: string; subtitle?: string; onSeeAll?: () => void; actionLabel?: string; actionRole?: 'button' | 'link'; horizontalInset?: number; trailingContent?: React.ReactNode }) {
  const { t } = useLocale();
  const [hovered, setHovered] = useState(false);
  return (
    <View style={[styles.row, { paddingHorizontal: horizontalInset }]}>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <TrailingActions style={styles.trailing}>
        {onSeeAll ? (
          <Pressable accessibilityRole={actionRole || (Platform.OS === 'web' ? 'link' : 'button')} accessibilityLabel={`${actionLabel || t('see_all')} ${title}`} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} onPress={onSeeAll} style={styles.action}>
            <Text style={[styles.actionText, hovered && Platform.OS === 'web' && styles.actionTextHovered]}>{actionLabel || t('see_all')}</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primary} />
          </Pressable>
        ) : null}
        {trailingContent}
      </TrailingActions>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  textBlock: { flex: 1, gap: 3 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { ...type.h2, color: colors.ink },
  subtitle: { ...type.caption },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  actionText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  actionTextHovered: { textDecorationLine: 'underline' },
});
