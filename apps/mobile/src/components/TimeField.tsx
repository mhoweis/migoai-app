import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../theme';

type Props = { value: string; onChange(value: string): void; placeholder?: string; minimumDate?: string };

export default function TimeField({ value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'time', value, placeholder,
      onChange: (event: { target: { value: string } }) => onChange(event.target.value),
      style: styles.webInput,
    });
  }
  const date = value ? new Date(`1970-01-01T${value}:00`) : new Date(1970, 0, 1, 12);
  return (
    <>
      <TouchableOpacity style={styles.nativeInput} onPress={() => setOpen(true)}>
        <Text style={value ? styles.value : styles.placeholder}>{value || placeholder || 'HH:mm'}</Text>
      </TouchableOpacity>
      {open ? <DateTimePicker value={date} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        onChange={(_: any, selected?: Date) => {
          setOpen(false);
          if (selected) onChange(`${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`);
        }} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  webInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.textInverse, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, flex: 1 } as any,
  nativeInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.textInverse, paddingHorizontal: 14, paddingVertical: 12, flex: 1 },
  value: { color: colors.text, fontSize: 15 },
  placeholder: { color: colors.textMuted, fontSize: 15 },
});
