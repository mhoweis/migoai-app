import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useLocale } from '../i18n';
import { colors } from '../theme';
import { formatLocalDate, parseLocalDate, toLocalDateString } from '../utils/dateTime';

type Props = {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  minimumDate?: string;
  label?: string;
};

export default function DateField({ value, onChange, placeholder, minimumDate, label }: Props) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<any>(null);
  const { t, locale } = useLocale();
  const placeholderText = placeholder || t('select_date');
  const displayValue = value ? formatLocalDate(value, locale) : placeholderText;
  const fieldLabel = label || t('start_date');
  const accessibilityLabel = `${fieldLabel}, ${displayValue}`;
  const date = value ? parseLocalDate(value) : new Date();
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
      <Ionicons name="calendar-outline" size={18} color={colors.primary} />
      <Text numberOfLines={1} style={value ? styles.value : styles.placeholder}>{displayValue}</Text>
    </TouchableOpacity>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webField}>
        {field}
        {React.createElement('input', {
          ref: inputRef,
          type: 'date',
          value,
          min: minimumDate,
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
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={minimumDate ? parseLocalDate(minimumDate) : undefined}
          onChange={(_: any, selected?: Date) => {
            setOpen(false);
            if (selected) onChange(toLocalDateString(selected));
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
