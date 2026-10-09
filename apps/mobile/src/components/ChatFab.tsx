import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocale } from '../i18n';
import { navigationRef } from '../navigation/navigationRef';
import { colors, gradients, shadow } from '../theme';
import { PressableScale } from './PressableScale';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useTabBarMetrics } from '../navigation/tabBarMetrics';

export default function ChatFab() {
  const { t } = useLocale();
  const { isWebDesktop, width } = useBreakpoint();
  const isDesktopPill = isWebDesktop && width >= 1440;
  const isCompactWebFab = Platform.OS === 'web' && width < 1024;
  const tabBarMetrics = useTabBarMetrics();

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('chat')}
      testID="chat-fab"
      onPress={() => navigationRef.current?.navigate('Chat')}
      style={[
        styles.fab,
        !isWebDesktop && { bottom: tabBarMetrics.height + 16 },
        isDesktopPill ? styles.desktopFab : isWebDesktop ? styles.compactDesktopFab : isCompactWebFab && styles.compactWebFab,
      ]}
    >
      <LinearGradient
        colors={gradients.primaryButton}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradient,
          isDesktopPill
            ? styles.desktopGradient
            : isWebDesktop
              ? styles.compactDesktopGradient
              : isCompactWebFab && styles.compactGradient,
        ]}
      >
        <Ionicons name="sparkles" size={isDesktopPill ? 24 : 26} color={colors.textInverse} />
        {isDesktopPill ? <Text style={styles.fabLabel}>{t('ask_migo')}</Text> : null}
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 84,
    width: 56,
    height: 56,
    borderRadius: 28,
    ...shadow.float,
    zIndex: 50,
  },
  desktopFab: {
    right: 32,
    bottom: 32,
    width: 'auto',
    height: 56,
    borderRadius: 28,
  },
  compactDesktopFab: { right: 0, bottom: 32, width: 48, height: 48, borderRadius: 24 },
  compactWebFab: { right: 0, width: 44, height: 44, borderRadius: 22 },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    overflow: 'hidden',
  },
  desktopGradient: {
    paddingHorizontal: 8,
    gap: 8,
  },
  compactDesktopGradient: { borderRadius: 24 },
  compactGradient: { borderRadius: 22 },
  fabLabel: { color: colors.textInverse, fontSize: 15, fontWeight: '700' },
});
