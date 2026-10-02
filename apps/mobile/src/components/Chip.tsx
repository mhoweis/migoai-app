import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
};

export default function Chip({ label, selected = false, onPress, disabled = false }: Props) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: disabled || !onPress }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[styles.chip, selected ? styles.selected : styles.unselected, disabled && styles.disabled]}
    >
      <Text style={[styles.label, selected ? styles.selectedLabel : styles.unselectedLabel, disabled && styles.disabledLabel]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.primary },
  unselected: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  label: { fontSize: 13, fontWeight: '600' },
  selectedLabel: { color: colors.textInverse },
  unselectedLabel: { color: colors.textSecondary },
  disabled: { opacity: 0.5 },
  disabledLabel: { color: colors.textMuted },
});
