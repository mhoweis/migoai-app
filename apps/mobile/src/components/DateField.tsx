import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../theme';

type Props = { value: string; onChange(value: string): void; placeholder?: string; minimumDate?: string };

export default function DateField({ value, onChange, placeholder, minimumDate }: Props) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'date', value, min: minimumDate, placeholder,
      onChange: (event: { target: { value: string } }) => onChange(event.target.value),
      style: styles.webInput,
    });
  }
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return (
    <>
      <TouchableOpacity style={styles.nativeInput} onPress={() => setOpen(true)}>
        <Text style={value ? styles.value : styles.placeholder}>{value || placeholder || 'YYYY-MM-DD'}</Text>
      </TouchableOpacity>
      {open ? <DateTimePicker value={date} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        minimumDate={minimumDate ? new Date(`${minimumDate}T00:00:00`) : undefined}
        onChange={(_: any, selected?: Date) => { setOpen(false); if (selected) onChange(selected.toISOString().slice(0, 10)); }} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  webInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.textInverse, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, flex: 1 } as any,
  nativeInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.textInverse, paddingHorizontal: 14, paddingVertical: 12, flex: 1 },
  value: { color: colors.text, fontSize: 15 },
  placeholder: { color: colors.textMuted, fontSize: 15 },
});
