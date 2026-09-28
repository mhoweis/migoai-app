import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { useUserStore } from '../store/userStore';
import { useLocale } from '../i18n';

type DigestEvent = {
  id: string;
  title: string;
  startDate: string;
  venueName?: string | null;
  city?: string | null;
  coverImage?: string | null;
  isFree: boolean;
  priceFrom?: number | null;
  currency: string;
  source: string;
};
type Digest = {
  title: string;
  rangeStart: string;
  rangeEnd: string;
  sections: Array<{ heading: string; events: DigestEvent[] }>;
};

export default function WeekendDigestScreen({ navigation }: { navigation: any }) {
  const { userLocation } = useUserStore();
  const { locale, t } = useLocale();
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userLocation) params.set('city', userLocation);
      params.set('lang', locale);
      const response = await api.get<{ success: boolean; data: Digest }>(`/digest/weekend?${params.toString()}`);
      setDigest(response.data.data);
    } catch {
      setDigest(null);
    } finally {
      setLoading(false);
    }
  }, [locale, userLocation]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const share = async () => {
    try {
      const params = userLocation ? `?city=${encodeURIComponent(userLocation)}` : '';
      const response = await api.get<{ success: boolean; data: { whatsappUrl: string } }>(`/digest/weekend/whatsapp${params}`);
      await Linking.openURL(response.data.data.whatsappUrl);
    } catch {
      Alert.alert(t('unable_to_share'), t('please_try_again'));
    }
  };

  if (loading) return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color="#2563eb" /></SafeAreaView>;
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{digest?.title || t('weekend_digest')}</Text>
        {digest?.sections.map(section => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.events.map(event => (
              <TouchableOpacity key={event.id} style={styles.card} onPress={() => navigation.navigate('EventDetail', { eventId: event.id })}>
                {event.coverImage ? <Image source={{ uri: event.coverImage }} style={styles.image} /> : <View style={[styles.image, styles.placeholder]}><Ionicons name="calendar-outline" size={28} color="#9ca3af" /></View>}
                <View style={styles.cardCopy}>
                  <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
                  <Text style={styles.meta}>{new Date(event.startDate).toLocaleString()} · {event.venueName || event.city || ''}</Text>
                  <Text style={styles.source}>{event.source}{event.isFree ? ` · ${t('free')}` : ''}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        {!digest?.sections.length && <Text style={styles.empty}>{t('no_events_help')}</Text>}
        <TouchableOpacity style={styles.shareButton} onPress={() => { void share(); }}>
          <Ionicons name="logo-whatsapp" size={20} color="#fff" />
          <Text style={styles.shareText}>{t('share_this_weekend')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 20, gap: 18 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827' },
  section: { gap: 10 },
  heading: { fontSize: 20, fontWeight: '700', color: '#1f2937' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 10, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  image: { width: 88, height: 88, borderRadius: 10 },
  placeholder: { backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  cardCopy: { flex: 1, gap: 5 },
  eventTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  meta: { color: '#6b7280', fontSize: 12 },
  source: { color: '#2563eb', fontSize: 12, fontWeight: '600' },
  empty: { color: '#6b7280', textAlign: 'center' },
  shareButton: { backgroundColor: '#16a34a', borderRadius: 12, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  shareText: { color: '#fff', fontWeight: '700' },
});
