import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocale } from '../i18n';
import { navigateToTab } from '../navigation/navigationRef';
import { colors, gradients, radius, spacing, type } from '../theme';
import { LinearGradient } from 'expo-linear-gradient';
import Container from './Container';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { navigationRef } from '../navigation/navigationRef';

export default function WebFooter({ wide = false }: { wide?: boolean }) {
  const { t, locale, setLocale } = useLocale();
  const { width } = useBreakpoint();
  const bleed = Math.max(0, (width - 1240) / 2);
  return (
    <View style={[styles.footer, wide && { width, marginLeft: -bleed }]}>
      <LinearGradient colors={gradients.dusk} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rule} />
      <Container style={styles.content}>
        <View style={styles.brandBlock}>
          <Text style={styles.wordmark}>migo</Text>
          <Text style={styles.tagline}>{t('footer_tagline')}</Text>
        </View>
        <View style={styles.linkBlock}>
          <Text style={styles.heading}>{t('discover')}</Text>
          <TouchableOpacity accessibilityRole="link" style={styles.footerLinkButton} onPress={() => navigationRef.current?.navigate('WeekendDigest')}><Text style={styles.link}>{t('this_weekend')}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="link" style={styles.footerLinkButton} onPress={() => navigateToTab('Events')}><Text style={styles.link}>{t('all_events')}</Text></TouchableOpacity>
        </View>
        <View style={styles.officialBlock}>
          <Text style={styles.heading}>{t('official_sources')}</Text>
          <Text style={styles.copy}>{t('footer_sources_list')}</Text>
          <Text style={styles.copy}>{t('official_sources_copy')}</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={locale === 'ar' ? t('english') : t('arabic')} onPress={() => void setLocale(locale === 'ar' ? 'en' : 'ar')} style={styles.locale}>
          <Text style={styles.link}>{locale === 'ar' ? t('english') : t('arabic')}</Text>
        </TouchableOpacity>
        <Text style={styles.copyright}>{t('copyright', { year: new Date().getFullYear() })}</Text>
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { marginTop: 56, backgroundColor: colors.ink, paddingBottom: 28 },
  rule: { height: 1 },
  content: { paddingTop: 32, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xl, flexWrap: 'wrap' },
  brandBlock: { flex: 1.1, minWidth: 180 },
  wordmark: { ...type.h1, color: colors.textInverse, fontSize: 30 },
  tagline: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 8, maxWidth: 220 },
  linkBlock: { minWidth: 130, gap: 10 },
  officialBlock: { flex: 1, minWidth: 180 },
  heading: { color: colors.textInverse, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  link: { color: 'rgba(255,255,255,0.78)', fontSize: 13 },
  copy: { color: 'rgba(255,255,255,0.68)', fontSize: 12, lineHeight: 19 },
  footerLinkButton: { minHeight: 44, justifyContent: 'center' },
  locale: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.1)' },
  copyright: { width: '100%', color: 'rgba(255,255,255,0.5)', fontSize: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)', paddingTop: 16 },
});
