import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, shadow } from '../theme';
import { PressableScale } from './PressableScale';

type Props = {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
};

export default function GradientButton({ label, onPress, icon, disabled, loading, testID }: Props) {
  const content = loading ? (
    <ActivityIndicator color={colors.textInverse} />
  ) : (
    <View style={styles.content}>
      {icon}
      <Text style={styles.label}>{label}</Text>
    </View>
  );

  if (disabled && !loading) {
    return (
      <TouchableOpacity testID={testID} disabled onPress={onPress} style={styles.disabled}>
        <Text style={styles.disabledLabel}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <PressableScale testID={testID} accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={styles.button}>
      <LinearGradient colors={gradients.primaryButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
        {content}
      </LinearGradient>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: { height: 52, borderRadius: radius.pill, overflow: 'hidden', ...shadow.card },
  gradient: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: colors.textInverse, fontSize: 16, fontWeight: '700' },
  disabled: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  disabledLabel: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },
});
