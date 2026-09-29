import React from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocale } from '../i18n';
import { navigationRef } from '../navigation/navigationRef';
import { colors, gradients, shadow } from '../theme';
import { PressableScale } from './PressableScale';

export default function ChatFab() {
  const { t } = useLocale();

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('chat')}
      testID="chat-fab"
      onPress={() => navigationRef.current?.navigate('Chat')}
      style={styles.fab}
    >
      <LinearGradient
        colors={gradients.primaryButton}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Ionicons name="sparkles" size={26} color={colors.textInverse} />
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
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
