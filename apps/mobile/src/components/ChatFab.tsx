import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocale } from '../i18n';
import { navigationRef } from '../navigation/navigationRef';
import { colors, gradients, shadow } from '../theme';
import { PressableScale } from './PressableScale';
import { useBreakpoint } from '../hooks/useBreakpoint';

export default function ChatFab() {
  const { t } = useLocale();
  const { isWebDesktop } = useBreakpoint();

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('chat')}
      testID="chat-fab"
      onPress={() => navigationRef.current?.navigate('Chat')}
      style={[styles.fab, isWebDesktop && styles.desktopFab]}
    >
      <LinearGradient
        colors={gradients.primaryButton}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Ionicons name="sparkles" size={26} color={colors.textInverse} />
        {isWebDesktop ? <Text style={styles.fabLabel}>{t('ask_migo')}</Text> : null}
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
    overflow: 'hidden',
    ...shadow.float,
    zIndex: 50,
  },
  desktopFab: {
    right: 32,
    bottom: 32,
    width: 'auto',
    minWidth: 150,
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 18,
  },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabLabel: { color: colors.textInverse, fontSize: 15, fontWeight: '700' },
});
