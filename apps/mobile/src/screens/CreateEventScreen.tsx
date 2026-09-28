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

const categories = ['Music', 'Sports', 'Art', 'Food', 'Tech', 'Business', 'Health', 'Theater', 'Comedy', 'Other'];
const cities = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

type Navigation = NativeStackNavigationProp<ProfileStackParamList, 'CreateEvent'>;

export default function CreateEventScreen({ navigation }: { navigation: Navigation }) {
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
      Alert.alert('Missing details', 'Add a title, start date/time, and venue.');
      return;
    }
    const startDate = new Date(`${form.startDate}T${form.startTime}`);
    const endDate = form.endDate
      ? new Date(`${form.endDate}T${form.endTime || form.startTime}`)
      : undefined;
    const capacity = Number(form.capacity || 0);
    const price = Number(form.price || 0);
    if (Number.isNaN(startDate.getTime()) || (endDate && Number.isNaN(endDate.getTime())) || (endDate && endDate < startDate)) {
      Alert.alert('Invalid dates', 'Use YYYY-MM-DD and HH:mm, with the end after the start.');
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 0 || (!form.isFree && price < 0)) {
      Alert.alert('Invalid ticket details', 'Check capacity and price.');
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
      Alert.alert('Event created', 'Your event is now live.');
      navigation.replace('MyEvents');
    } catch {
      Alert.alert('Unable to create event', 'Please review the details and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Create an event</Text>
        <TextInput style={styles.input} placeholder="Event title" value={form.title} onChangeText={(value: string) => set('title', value)} />
        <TextInput style={[styles.input, styles.multiline]} placeholder="Description" multiline value={form.description} onChangeText={(value: string) => set('description', value)} />
        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>{categories.map(category => (
          <TouchableOpacity key={category} style={[styles.chip, form.category === category && styles.selectedChip]} onPress={() => set('category', category)}>
            <Text style={[styles.chipText, form.category === category && styles.selectedChipText]}>{category}</Text>
          </TouchableOpacity>
        ))}</View>
        <Text style={styles.label}>Start date and time</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.half]} placeholder="YYYY-MM-DD" value={form.startDate} onChangeText={(value: string) => set('startDate', value)} />
          <TextInput style={[styles.input, styles.half]} placeholder="HH:mm" value={form.startTime} onChangeText={(value: string) => set('startTime', value)} />
        </View>
        <Text style={styles.label}>End date and time (optional)</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.half]} placeholder="YYYY-MM-DD" value={form.endDate} onChangeText={(value: string) => set('endDate', value)} />
          <TextInput style={[styles.input, styles.half]} placeholder="HH:mm" value={form.endTime} onChangeText={(value: string) => set('endTime', value)} />
        </View>
        <TextInput style={styles.input} placeholder="Venue name" value={form.venueName} onChangeText={(value: string) => set('venueName', value)} />
        <TextInput style={styles.input} placeholder="Address" value={form.address} onChangeText={(value: string) => set('address', value)} />
        <Text style={styles.label}>City</Text>
        <View style={styles.chips}>{cities.map(city => (
          <TouchableOpacity key={city} style={[styles.chip, form.city === city && styles.selectedChip]} onPress={() => set('city', city)}>
            <Text style={[styles.chipText, form.city === city && styles.selectedChipText]}>{city}</Text>
          </TouchableOpacity>
        ))}</View>
        <View style={styles.toggleRow}>
          <Text style={styles.label}>Free event</Text>
          <Switch value={form.isFree} onValueChange={(value: boolean) => set('isFree', value)} />
        </View>
        {!form.isFree && (
          <>
            <TextInput style={styles.input} placeholder="Price in AED" keyboardType="decimal-pad" value={form.price} onChangeText={(value: string) => set('price', value)} />
            <TextInput style={styles.input} placeholder="External ticket URL (optional)" autoCapitalize="none" value={form.ticketUrl} onChangeText={(value: string) => set('ticketUrl', value)} />
          </>
        )}
        <TextInput style={styles.input} placeholder="Capacity (0 = unlimited)" keyboardType="number-pad" value={form.capacity} onChangeText={(value: string) => set('capacity', value)} />
        <TextInput style={styles.input} placeholder="Cover image URL (optional)" autoCapitalize="none" value={form.coverImage} onChangeText={(value: string) => set('coverImage', value)} />
        <TouchableOpacity style={styles.submit} disabled={saving} onPress={submit}>
          <Text style={styles.submitText}>{saving ? 'Creating…' : 'Create event'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, gap: 12 },
  heading: { fontSize: 28, fontWeight: '700', color: '#111827', marginBottom: 6 },
  label: { color: '#374151', fontSize: 14, fontWeight: '700', marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#e5e7eb' },
  selectedChip: { backgroundColor: '#2563eb' },
  chipText: { color: '#374151', fontSize: 13 },
  selectedChipText: { color: '#fff', fontWeight: '700' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  submit: { marginTop: 10, paddingVertical: 15, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
