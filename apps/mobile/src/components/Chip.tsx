import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export default function Chip({ label, selected = false, onPress }: Props) {
  return (
    <TouchableOpacity
      disabled={!onPress}
      onPress={onPress}
      style={[styles.chip, selected ? styles.selected : styles.unselected]}
    >
      <Text style={[styles.label, selected ? styles.selectedLabel : styles.unselectedLabel]}>{label}</Text>
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
});
