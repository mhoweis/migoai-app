import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useLocale } from '../i18n';
import { colors } from '../theme';
import { formatLocalTime } from '../utils/dateTime';

type Props = { value: string; onChange(value: string): void; placeholder?: string; label?: string };

export default function TimeField({ value, onChange, placeholder, label }: Props) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<any>(null);
  const { t, locale } = useLocale();
  const placeholderText = placeholder || t('select_time');
  const displayValue = value ? formatLocalTime(value, locale) : placeholderText;
  const fieldLabel = label || t('start_time');
  const accessibilityLabel = `${fieldLabel}, ${displayValue}`;
  const date = value ? new Date(`1970-01-01T${value}:00`) : new Date(1970, 0, 1, 12);
  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        input.focus();
        input.click();
        return;
      }
    }
    input.focus();
    input.click();
  };
  const field = (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.field}
      onPress={() => Platform.OS === 'web' ? openPicker() : setOpen(true)}
    >
      <Ionicons name="time-outline" size={18} color={colors.primary} />
      <Text numberOfLines={1} style={value ? styles.value : styles.placeholder}>{displayValue}</Text>
    </TouchableOpacity>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webField}>
        {field}
        {React.createElement('input', {
          ref: inputRef,
          type: 'time',
          value,
          'aria-label': accessibilityLabel,
          tabIndex: -1,
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
          style: styles.webPickerInput,
        })}
      </View>
    );
  }

  return (
    <>
      {field}
      {open ? (
        <DateTimePicker
          value={date}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_: any, selected?: Date) => {
            setOpen(false);
            if (selected) onChange(`${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  webField: { position: 'relative', flex: 1, minWidth: 0 } as any,
  webPickerInput: { position: 'absolute', left: 0, top: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none', zIndex: -1 } as any,
  field: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.textInverse, paddingHorizontal: 14, paddingVertical: 12, flex: 1, minWidth: 0 },
  value: { color: colors.text, fontSize: 15, flex: 1 },
  placeholder: { color: colors.textMuted, fontSize: 15 },
});
