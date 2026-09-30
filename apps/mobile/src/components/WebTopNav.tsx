import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocale } from '../i18n';
import { navigateToTab, navigationRef } from '../navigation/navigationRef';
import { colors, radius, spacing, type } from '../theme';
import Container from './Container';
import { useUserStore } from '../store/userStore';
import GradientButton from './GradientButton';

const links = [
  { route: 'HomeTab', label: 'home', icon: 'home-outline' as const },
  { route: 'EventsTab', label: 'discover', icon: 'compass-outline' as const },
  { route: 'WalletTab', label: 'wallet', icon: 'wallet-outline' as const },
  { route: 'ProfileTab', label: 'profile', icon: 'person-outline' as const },
];

export default function WebTopNav({ activeTab }: { activeTab?: string }) {
  const { t, locale, setLocale } = useLocale();
  const { user } = useUserStore();
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  return (
    <View style={styles.bar}>
      <Container style={styles.inner}>
          <TouchableOpacity accessibilityRole="link" accessibilityLabel={t('home')} style={styles.brand} onPress={() => navigateToTab('Home')}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} />
          <Text style={styles.wordmark}>Migo</Text>
        </TouchableOpacity>
        <View style={styles.links}>
          {links.map(link => {
            const active = activeTab === link.route;
            return (
              <TouchableOpacity key={link.route} accessibilityRole="link" accessibilityState={{ selected: active }} onHoverIn={() => setHoveredLink(link.route)} onHoverOut={() => setHoveredLink(null)} onPress={() => navigateToTab(link.route.replace('Tab', ''))} style={[styles.link, active && styles.activeLink, hoveredLink === link.route && styles.hoverLink]}>
                <Text style={[styles.linkText, active && styles.activeLinkText]}>{t(link.label as any)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('search_events')} onPress={() => navigateToTab('Events')} style={styles.search}>
          <Ionicons name="search" size={17} color={colors.textMuted} />
          <Text numberOfLines={1} style={styles.searchText}>{t('search_events')}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={locale === 'ar' ? t('english') : t('arabic')} onPress={() => void setLocale(locale === 'ar' ? 'en' : 'ar')} style={styles.localeButton}>
          <Ionicons name="globe-outline" size={17} color={colors.ink} />
          <Text style={styles.localeText}>{locale === 'ar' ? 'EN' : 'ع'}</Text>
        </TouchableOpacity>
        <GradientButton accessibilityLabel={t('create_event')} style={styles.createButton} label={t('create_event')} icon={<Ionicons name="add" size={18} color={colors.textInverse} />} onPress={() => navigationRef.current?.navigate('Main', { screen: 'ProfileTab', params: { screen: 'CreateEvent' } })} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('profile')} onPress={() => navigateToTab('Profile')} style={styles.avatarButton}>
          {user?.avatar
            ? <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
            : <Text style={styles.avatarInitial}>{user?.name?.charAt(0) || 'M'}</Text>}
        </TouchableOpacity>
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 68, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 20 },
  inner: { height: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 108 },
  logo: { width: 32, height: 32, borderRadius: 10 },
  wordmark: { ...type.h2, fontWeight: '800', color: colors.ink, fontSize: 23 },
  links: { flexDirection: 'row', height: '100%', alignItems: 'center', gap: 2 },
  link: { height: '100%', minWidth: 68, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeLink: { borderBottomColor: colors.primary },
  hoverLink: { backgroundColor: colors.primarySoft },
  linkText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  activeLinkText: { color: colors.ink, fontWeight: '700' },
  search: { flex: 1, minWidth: 90, maxWidth: 205, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 12, backgroundColor: colors.surfaceAlt },
  searchText: { flex: 1, color: colors.textMuted, fontSize: 11 },
  avatarButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  avatarImage: { width: 36, height: 36, borderRadius: 18 },
  avatarInitial: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  localeButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
  localeText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  createButton: { height: 44, minWidth: 124, flexShrink: 0, borderRadius: radius.pill, paddingHorizontal: 10 },
});
