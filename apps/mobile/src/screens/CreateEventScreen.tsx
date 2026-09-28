import { colors } from '../theme';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ticketsService } from '../services/tickets.service';
import type { ProfileStackParamList } from '../navigation/MainTabNavigator';
import { useLocale, categoryLabel } from '../i18n';

const categories = ['Music', 'Sports', 'Art', 'Food', 'Tech', 'Business', 'Health', 'Theater', 'Comedy', 'Other'];
const cities = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

type Navigation = NativeStackNavigationProp<ProfileStackParamList, 'CreateEvent'>;

export default function CreateEventScreen({ navigation }: { navigation: Navigation }) {
  const { t } = useLocale();
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Other',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    venueName: '',
    address: '',
    city: 'Dubai',
    isFree: true,
    price: '',
    ticketUrl: '',
    capacity: '0',
    coverImage: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!form.title.trim() || !form.startDate || !form.startTime || !form.venueName.trim()) {
      Alert.alert(t('missing_details'), t('missing_details_help'));
      return;
    }
    const startDate = new Date(`${form.startDate}T${form.startTime}`);
    const endDate = form.endDate
      ? new Date(`${form.endDate}T${form.endTime || form.startTime}`)
      : undefined;
    const capacity = Number(form.capacity || 0);
    const price = Number(form.price || 0);
    if (Number.isNaN(startDate.getTime()) || (endDate && Number.isNaN(endDate.getTime())) || (endDate && endDate < startDate)) {
      Alert.alert(t('invalid_dates'), t('invalid_dates_help'));
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 0 || (!form.isFree && price < 0)) {
      Alert.alert(t('invalid_ticket_details'), t('invalid_ticket_details_help'));
      return;
    }
    setSaving(true);
    try {
      await ticketsService.createEvent({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        startDate: startDate.toISOString(),
        endDate: endDate?.toISOString(),
        venueName: form.venueName.trim(),
        address: form.address.trim() || undefined,
        city: form.city,
        country: 'United Arab Emirates',
        isFree: form.isFree,
        priceFrom: form.isFree ? undefined : price,
        currency: 'AED',
        ticketUrl: form.isFree || !form.ticketUrl.trim() ? undefined : form.ticketUrl.trim(),
        capacity,
        coverImage: form.coverImage.trim() || undefined,
      });
      Alert.alert(t('event_created'), t('event_created_help'));
      navigation.replace('MyEvents');
    } catch {
      Alert.alert(t('unable_create_event'), t('review_details'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{t('create_event')}</Text>
        <TextInput style={styles.input} placeholder={t('event_title')} value={form.title} onChangeText={(value: string) => set('title', value)} />
        <TextInput style={[styles.input, styles.multiline]} placeholder={t('description')} multiline value={form.description} onChangeText={(value: string) => set('description', value)} />
        <Text style={styles.label}>{t('event')}</Text>
        <View style={styles.chips}>{categories.map(category => (
          <TouchableOpacity key={category} style={[styles.chip, form.category === category && styles.selectedChip]} onPress={() => set('category', category)}>
            <Text style={[styles.chipText, form.category === category && styles.selectedChipText]}>{categoryLabel(category)}</Text>
          </TouchableOpacity>
        ))}</View>
        <Text style={styles.label}>{t('start_date')}</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.half]} placeholder={t('start_date')} value={form.startDate} onChangeText={(value: string) => set('startDate', value)} />
          <TextInput style={[styles.input, styles.half]} placeholder={t('start_time')} value={form.startTime} onChangeText={(value: string) => set('startTime', value)} />
        </View>
        <Text style={styles.label}>{t('end_date')}</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.half]} placeholder={t('end_date')} value={form.endDate} onChangeText={(value: string) => set('endDate', value)} />
          <TextInput style={[styles.input, styles.half]} placeholder={t('end_time')} value={form.endTime} onChangeText={(value: string) => set('endTime', value)} />
        </View>
        <TextInput style={styles.input} placeholder={t('venue_name')} value={form.venueName} onChangeText={(value: string) => set('venueName', value)} />
        <TextInput style={styles.input} placeholder={t('address')} value={form.address} onChangeText={(value: string) => set('address', value)} />
        <Text style={styles.label}>{t('location_tba')}</Text>
        <View style={styles.chips}>{cities.map(city => (
          <TouchableOpacity key={city} style={[styles.chip, form.city === city && styles.selectedChip]} onPress={() => set('city', city)}>
            <Text style={[styles.chipText, form.city === city && styles.selectedChipText]}>{city}</Text>
          </TouchableOpacity>
        ))}</View>
        <View style={styles.toggleRow}>
          <Text style={styles.label}>{t('free')}</Text>
          <Switch value={form.isFree} onValueChange={(value: boolean) => set('isFree', value)} />
        </View>
        {!form.isFree && (
          <>
            <TextInput style={styles.input} placeholder={t('price_aed')} keyboardType="decimal-pad" value={form.price} onChangeText={(value: string) => set('price', value)} />
            <TextInput style={styles.input} placeholder={t('ticket_url_optional')} autoCapitalize="none" value={form.ticketUrl} onChangeText={(value: string) => set('ticketUrl', value)} />
          </>
        )}
        <TextInput style={styles.input} placeholder={t('capacity_unlimited')} keyboardType="number-pad" value={form.capacity} onChangeText={(value: string) => set('capacity', value)} />
        <TextInput style={styles.input} placeholder={t('cover_image_optional')} autoCapitalize="none" value={form.coverImage} onChangeText={(value: string) => set('coverImage', value)} />
        <TouchableOpacity style={styles.submit} disabled={saving} onPress={submit}>
          <Text style={styles.submitText}>{saving ? t('loading') : t('create_event')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12 },
  heading: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 6 },
  label: { color: colors.textSecondary, fontSize: 14, fontWeight: '700', marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.textInverse, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.border },
  selectedChip: { backgroundColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13 },
  selectedChipText: { color: colors.textInverse, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  submit: { marginTop: 10, paddingVertical: 15, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  submitText: { color: colors.textInverse, fontWeight: '700', fontSize: 16 },
});
