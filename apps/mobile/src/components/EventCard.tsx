import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Event } from '@migo/shared';
import { categoryLabel, formatEventWhen, formatPrice, useLocale } from '../i18n';
import { sourceBadge } from '../utils/trust';
import { colors, radius, shadow, spacing, type } from '../theme';
import { PressableScale } from './PressableScale';
import DateBadge from './DateBadge';

type Props = {
  event: Event;
  onPress: () => void;
  onSave?: () => void;
  onShare?: () => void;
  saved?: boolean;
  footerSlot?: React.ReactNode;
  children?: React.ReactNode;
  rank?: number;
};

export default function EventCard({ event, onPress, onSave, onShare, saved, footerSlot, children, rank }: Props) {
  const { locale, t } = useLocale();
  const [hovered, setHovered] = useState(false);
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
  const badge = sourceBadge((event as any).trust, locale);
  const image = event.coverImage || event.thumbnail;
  return (
    <View style={[styles.card, hovered && !reduceMotion && Platform.OS === 'web' && shadow.hover, hovered && !reduceMotion && Platform.OS === 'web' && styles.hovered]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={event.title}
        onPress={onPress}
        onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
        onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
        style={styles.cardContent}
      >
        <View style={styles.media}>
          {image ? <Image source={{ uri: image }} style={[styles.image, event.hasEnded && styles.endedImage]} resizeMode="cover" /> : <View style={[styles.image, styles.placeholder, event.hasEnded && styles.endedImage]}><Ionicons name="calendar-outline" size={34} color={colors.textMuted} /></View>}
          <View style={styles.badge}><DateBadge date={event.startDate} /></View>
          {!!rank ? <View style={styles.rank}><Text style={styles.rankText}>{rank}</Text></View> : null}
        </View>
        <View style={styles.body}>
          <View style={styles.categoryRow}>
            <View style={styles.categoryChip}><Text style={styles.category} numberOfLines={1}>{categoryLabel(event.category)}</Text></View>
            {badge && ['official', 'venue'].includes(badge.kind) ? <View style={styles.official}><Ionicons name="shield-checkmark" size={12} color={colors.info} /><Text style={styles.officialText}>{t('official')}</Text></View> : null}
            {event.hasEnded ? <View style={styles.ended}><Text style={styles.endedText} numberOfLines={1}>{t('event_ended')}</Text></View> : null}
          </View>
          <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{[event.venueName, event.city].filter(Boolean).join(' · ') || t('location_tba')}</Text>
          <Text style={[styles.when, formatEventWhen(event, locale).startsWith(t('now_on')) && styles.live]} numberOfLines={1}>{formatEventWhen(event, locale)}</Text>
          <View style={styles.footer}>
            <Text style={styles.price}>{event.isFree || !event.priceFrom ? t('free') : formatPrice(Number(event.priceFrom), event.currency || 'AED')}</Text>
            {footerSlot || children}
          </View>
        </View>
      </PressableScale>
      {(onSave || onShare) ? (
        <View style={styles.actions}>
          {onSave ? <Pressable accessibilityRole="button" accessibilityLabel={saved ? t('remove_saved_event') : t('save_event')} onPress={onSave} style={styles.iconButton}><Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={18} color={colors.textInverse} /></Pressable> : null}
          {onShare ? <Pressable accessibilityRole="button" accessibilityLabel={t('share')} onPress={onShare} style={styles.iconButton}><Ionicons name="share-outline" size={18} color={colors.textInverse} /></Pressable> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadow.card },
  cardContent: { flex: 1 },
  hovered: { transform: [{ translateY: -2 }] },
  media: { position: 'relative', aspectRatio: 16 / 10, backgroundColor: colors.surfaceAlt },
  image: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 12, left: 12 },
  rank: { position: 'absolute', bottom: 12, left: 12, minWidth: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  rankText: { color: colors.accent, fontSize: 20, fontWeight: '800', fontFamily: type.display.fontFamily },
  actions: { position: 'absolute', top: 12, right: 12, zIndex: 1, flexDirection: 'row', gap: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(20,15,46,0.64)' },
  body: { padding: spacing.md, gap: 7 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden' },
  categoryChip: { alignSelf: 'flex-start', flexShrink: 1, maxWidth: '50%', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  category: { color: colors.primaryDark, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  official: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.infoSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  officialText: { color: colors.info, fontSize: 11, fontWeight: '700' },
  endedImage: { opacity: 0.6 },
  ended: { flexShrink: 1, backgroundColor: colors.surfaceAlt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  endedText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  title: { ...type.h3, color: colors.ink, minHeight: 44 },
  meta: { color: colors.textSecondary, fontSize: 13 },
  when: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  live: { alignSelf: 'flex-start', color: '#8A5700', backgroundColor: colors.accentSoft, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  footer: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  price: { color: colors.ink, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
