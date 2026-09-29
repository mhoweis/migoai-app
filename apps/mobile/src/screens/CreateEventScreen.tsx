import React, { useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Image,
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
import type { EventScheduleDay } from '@migo/shared';
import DateField from '../components/DateField';
import TimeField from '../components/TimeField';
import LocationPicker from '../components/LocationPicker';
import { placesService } from '../services/places.service';
import { uploadService } from '../services/upload.service';
import { colors } from '../theme';

const categories = ['Music', 'Sports', 'Art', 'Food', 'Tech', 'Business', 'Health', 'Theater', 'Comedy', 'Other'];
const cities = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];
const dressCodes = [
  ['formal', 'dress_formal'], ['semi_formal', 'dress_semi_formal'], ['smart_casual', 'dress_smart_casual'],
  ['casual', 'dress_casual'], ['themed', 'dress_themed'], ['sportswear', 'dress_sportswear'], ['none', 'dress_none'],
] as const;

type Navigation = NativeStackNavigationProp<ProfileStackParamList, 'CreateEvent'>;

export default function CreateEventScreen({ navigation }: { navigation: Navigation }) {
  const { t } = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ title: '', description: '', category: 'Other', venueName: '', address: '', city: 'Dubai', isFree: true, price: '', ticketUrl: '', capacity: '0', notes: '', coverImage: '' });
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [multiDay, setMultiDay] = useState(false);
  const [days, setDays] = useState<EventScheduleDay[]>([]);
  const [latitude, setLatitude] = useState<number>();
  const [longitude, setLongitude] = useState<number>();
  const [geocodeFailed, setGeocodeFailed] = useState(false);
  const [dressCode, setDressCode] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  const firstDay = days[0] || { date: fromDate, startTime: '', endTime: '' };
  const dayCount = (from: string, to: string) => Math.floor((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000) + 1;
  const regenerateDays = (from: string, to: string) => {
    const count = dayCount(from, to);
    if (!from || !to || count < 1 || count > 31) return;
    setDays(Array.from({ length: count }, (_, index) => ({ date: new Date(new Date(`${from}T00:00:00`).getTime() + index * 86400000).toISOString().slice(0, 10), startTime: days[0]?.startTime || '', endTime: days[0]?.endTime || '' })));
  };
  const schedule = useMemo(() => multiDay ? days : (fromDate ? [{ date: fromDate, startTime: firstDay.startTime, ...(firstDay.endTime ? { endTime: firstDay.endTime } : {}) }] : []), [multiDay, days, fromDate, firstDay.startTime, firstDay.endTime]);

  const submit = async () => {
    const first = schedule[0];
    const last = schedule[schedule.length - 1];
    if (!form.title.trim() || !first?.date || !first.startTime || !form.venueName.trim()) {
      Alert.alert(t('missing_details'), t('missing_details_help'));
      return;
    }
    if (schedule.length > 31 || schedule.some(day => !day.startTime || (day.endTime && day.endTime < day.startTime))) {
      Alert.alert(t('invalid_dates'), t('invalid_dates_help')); return;
    }
    const startDate = new Date(`${first.date}T${first.startTime}`);
    const endDate = new Date(`${last.date}T${last.endTime || last.startTime}`);
    const capacity = Number(form.capacity || 0);
    const price = Number(form.price || 0);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate < new Date() || endDate < startDate) {
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
        endDate: endDate.toISOString(),
        schedule,
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
        notes: form.notes.trim() || undefined,
        dressCode: dressCode && dressCode !== 'none' ? dressCode : undefined,
        locationLat: latitude,
        locationLng: longitude,
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
        <View style={styles.toggleRow}><Text style={styles.label}>{t('multiple_days')}</Text><Switch value={multiDay} onValueChange={(value: boolean) => { setMultiDay(value); if (value && fromDate && toDate) regenerateDays(fromDate, toDate); }} /></View>
        <Text style={styles.label}>{multiDay ? t('from_date') : t('start_date')}</Text>
        <View style={styles.row}><DateField value={fromDate} onChange={value => { setFromDate(value); if (multiDay && toDate) regenerateDays(value, toDate); }} placeholder={t('start_date')} minimumDate={today} />{!multiDay ? <TimeField value={firstDay.startTime} onChange={value => setDays([{ ...firstDay, startTime: value }])} placeholder={t('start_time')} /> : null}</View>
        {!multiDay ? <><Text style={styles.label}>{t('end_time')}</Text><TimeField value={firstDay.endTime || ''} onChange={value => setDays([{ ...firstDay, endTime: value }])} placeholder={t('end_time')} /></> : null}
        {multiDay ? <><Text style={styles.label}>{t('to_date')}</Text><DateField value={toDate} onChange={value => { setToDate(value); regenerateDays(fromDate, value); }} placeholder={t('end_date')} minimumDate={fromDate || today} />{days.map((day, index) => <View key={day.date} style={styles.dayRow}><Text style={styles.dayLabel}>{day.date}</Text><TimeField value={day.startTime} onChange={value => setDays(current => current.map((entry, i) => i === index ? { ...entry, startTime: value } : entry))} placeholder={t('start_time')} /><TimeField value={day.endTime || ''} onChange={value => setDays(current => current.map((entry, i) => i === index ? { ...entry, endTime: value } : entry))} placeholder={t('end_time')} /></View>)}{days.length > 1 ? <TouchableOpacity style={styles.secondaryButton} onPress={() => setDays(current => current.map(day => ({ ...day, startTime: current[0].startTime, endTime: current[0].endTime })))}><Text style={styles.secondaryText}>{t('apply_to_all_days')}</Text></TouchableOpacity> : null}</> : null}
        <TextInput style={styles.input} placeholder={t('venue_name')} value={form.venueName} onChangeText={(value: string) => set('venueName', value)} />
        <TextInput style={styles.input} placeholder={t('address')} value={form.address} onChangeText={(value: string) => set('address', value)} />
        <Text style={styles.label}>{t('city')}</Text>
        <View style={styles.chips}>{cities.map(city => (
          <TouchableOpacity key={city} style={[styles.chip, form.city === city && styles.selectedChip]} onPress={() => set('city', city)}>
            <Text style={[styles.chipText, form.city === city && styles.selectedChipText]}>{city}</Text>
          </TouchableOpacity>
        ))}</View>
        <TouchableOpacity style={styles.secondaryButton} onPress={async () => { try { const result = await placesService.geocode(form.venueName, form.address, form.city); if (result) { setLatitude(result.latitude); setLongitude(result.longitude); setGeocodeFailed(false); } else setGeocodeFailed(true); } catch { setGeocodeFailed(true); } }}><Text style={styles.secondaryText}>{t('find_on_map')}</Text></TouchableOpacity>
        {geocodeFailed ? <Text style={styles.notice}>{t('venue_not_found')}</Text> : null}
        <LocationPicker city={form.city} latitude={latitude} longitude={longitude} onChange={coords => { setLatitude(coords.latitude); setLongitude(coords.longitude); setGeocodeFailed(false); }} />
        {latitude !== undefined && longitude !== undefined ? <Text style={styles.hint}>{t('pinned_coordinates', { latitude: latitude.toFixed(4), longitude: longitude.toFixed(4) })}</Text> : null}
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
        <Text style={styles.label}>{t('dress_code')}</Text>
        <View style={styles.chips}>{dressCodes.map(([value, key]) => <TouchableOpacity key={value} style={[styles.chip, dressCode === value && styles.selectedChip]} onPress={() => setDressCode(value)}><Text style={[styles.chipText, dressCode === value && styles.selectedChipText]}>{t(key as any)}</Text></TouchableOpacity>)}</View>
        <TextInput style={[styles.input, styles.multiline]} placeholder={t('notes_attendees')} multiline value={form.notes} onChangeText={(value: string) => set('notes', value)} />
        <TouchableOpacity style={styles.secondaryButton} onPress={async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [16, 9] }); if (!result.canceled && result.assets[0]) { try { const asset = result.assets[0]; set('coverImage', await uploadService.uploadImage(asset.uri, { name: asset.fileName || 'cover.jpg', type: asset.mimeType || 'image/jpeg' })); } catch { Alert.alert(t('unable_upload_image'), t('review_details')); } } }}><Text style={styles.secondaryText}>{t('upload_cover_image')}</Text></TouchableOpacity>
        <Text style={styles.hint}>{t('cover_image_help')}</Text>
        {form.coverImage ? <View><Image source={{ uri: form.coverImage }} style={styles.cover} /><TouchableOpacity onPress={() => set('coverImage', '')}><Text style={styles.remove}>{t('remove')}</Text></TouchableOpacity></View> : null}
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowUrl(value => !value)}><Text style={styles.secondaryText}>{t('paste_image_url')}</Text></TouchableOpacity>
        {showUrl ? <TextInput style={styles.input} placeholder={t('cover_image_optional')} autoCapitalize="none" value={form.coverImage} onChangeText={(value: string) => set('coverImage', value)} /> : null}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.border },
  selectedChip: { backgroundColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13 },
  selectedChipText: { color: colors.textInverse, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, dayLabel: { width: 92, color: colors.text, fontSize: 12 },
  secondaryButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center' }, secondaryText: { color: colors.primary, fontWeight: '700' },
  notice: { color: colors.warning, fontSize: 13 }, hint: { color: colors.textMuted, fontSize: 12 }, cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12 }, remove: { color: colors.danger, textAlign: 'right', marginTop: 4 },
  submit: { marginTop: 10, paddingVertical: 15, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  submitText: { color: colors.textInverse, fontWeight: '700', fontSize: 16 },
});
