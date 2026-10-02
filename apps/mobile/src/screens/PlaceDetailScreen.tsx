import { colors } from '../theme';
// src/screens/PlaceDetailScreen.tsx
//
// One venue, plus any Migo events happening there — the bridge between the
// Places directory and the events catalogue.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { placesService, PlaceDetail } from '../services/places.service';
import { useUserLocation } from '../hooks/useUserLocation';

export type PlaceDetailParams = { placeId: string };

export default function PlaceDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ PlaceDetail: PlaceDetailParams }, 'PlaceDetail'>>();
  const { placeId } = route.params;
  const { coords } = useUserLocation();

  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await placesService.getById(placeId, coords ?? undefined);
        if (active) setPlace(data);
      } catch (err: any) {
        if (active) setError(err.message || 'Could not load this place');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [placeId, coords]);

  const openDirections = () => {
    if (!place) return;

    // Prefer the canonical Maps URL when we have one.
    if (place.mapsUrl) {
      Linking.openURL(place.mapsUrl).catch(() =>
        Alert.alert('Error', 'Unable to open maps.')
      );
      return;
    }

    if (place.latitude == null || place.longitude == null) {
      Alert.alert('No location', 'We do not have coordinates for this place yet.');
      return;
    }

    const label = encodeURIComponent(place.title);
    const url = Platform.select({
      ios: `maps://?q=${label}&ll=${place.latitude},${place.longitude}`,
      android: `geo:${place.latitude},${place.longitude}?q=${label}`,
      default: `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`,
    })!;

    Linking.openURL(url).catch(() => Alert.alert('Error', 'Unable to open maps.'));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !place) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={44} color={colors.border} />
          <Text style={styles.errorText}>{error ?? 'Place not found'}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {place.thumbnail ? (
          <Image source={{ uri: place.thumbnail }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]}>
            <Ionicons name="business" size={48} color={colors.border} />
          </View>
        )}

        <View style={styles.body}>
          <Text style={styles.title}>{place.title}</Text>

          {place.category ? <Text style={styles.category}>{place.category}</Text> : null}

          <View style={styles.metaRow}>
            {place.rating ? (
              <View style={styles.metaItem}>
                <Ionicons name="star" size={15} color={colors.warning} />
                <Text style={styles.metaText}>
                  {place.rating.toFixed(1)}
                  {place.reviewCount ? ` · ${place.reviewCount} reviews` : ''}
                </Text>
              </View>
            ) : null}

            {place.distanceKm != null ? (
              <View style={styles.metaItem}>
                <Ionicons name="navigate" size={15} color={colors.textMuted} />
                <Text style={styles.metaText}>{place.distanceKm} km away</Text>
              </View>
            ) : null}

            {place.priceRange ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaText}>{place.priceRange}</Text>
              </View>
            ) : null}
          </View>

          {place.address ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={18} color={colors.textMuted} />
              <Text style={styles.infoText}>{place.address}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionButton} onPress={openDirections}>
              <Ionicons name="navigate" size={18} color={colors.textInverse} />
              <Text style={styles.actionButtonText}>Directions</Text>
            </TouchableOpacity>

            {place.phone ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.actionSecondary]}
                onPress={() => Linking.openURL(`tel:${place.phone}`)}
              >
                <Ionicons name="call" size={18} color={colors.primary} />
                <Text style={[styles.actionButtonText, styles.actionSecondaryText]}>Call</Text>
              </TouchableOpacity>
            ) : null}

            {place.website ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.actionSecondary]}
                onPress={() => Linking.openURL(place.website!)}
              >
                <Ionicons name="globe-outline" size={18} color={colors.primary} />
                <Text style={[styles.actionButtonText, styles.actionSecondaryText]}>Website</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {place.instagram ? (
            <TouchableOpacity
              style={styles.socialRow}
              onPress={() => Linking.openURL(place.instagram!)}
            >
              <Ionicons name="logo-instagram" size={18} color={colors.accent} />
              <Text style={styles.socialText}>Instagram</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.border} />
            </TouchableOpacity>
          ) : null}

          {place.events.length > 0 && (
            <View style={styles.eventsSection}>
              <Text style={styles.sectionTitle}>Happening here</Text>

              {place.events.map((event: PlaceDetail['events'][number]) => (
                <TouchableOpacity
                  key={event.id}
                  style={styles.eventCard}
                  onPress={() => navigation.navigate('EventDetail', { eventId: event.id })}
                >
                  {event.coverImage ? (
                    <Image source={{ uri: event.coverImage }} style={styles.eventThumb} />
                  ) : (
                    <View style={[styles.eventThumb, styles.heroPlaceholder]}>
                      <Ionicons name="calendar" size={18} color={colors.border} />
                    </View>
                  )}

                  <View style={styles.eventBody}>
                    <Text style={styles.eventTitle} numberOfLines={2}>
                      {event.title}
                    </Text>
                    <Text style={styles.eventMeta}>
                      {new Date(event.startDate).toLocaleDateString('en-AE', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                      {' · '}
                      {event.isFree
                        ? 'Free'
                        : `${event.priceFrom ?? 0} ${event.currency || 'AED'}`}
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={colors.border} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={styles.attribution}>
            Venue information from public Google Maps listings. Details can change — check with
            the venue before travelling.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.textInverse },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },

  hero: { width: '100%', height: 200, backgroundColor: colors.surfaceAlt },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  body: { padding: 20, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  category: { fontSize: 15, color: colors.textMuted },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 14, color: colors.textSecondary },

  infoRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 4 },
  infoText: { flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
  },
  actionSecondary: { backgroundColor: colors.primarySoft },
  actionButtonText: { color: colors.textInverse, fontSize: 14, fontWeight: '600' },
  actionSecondaryText: { color: colors.primary },

  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceAlt,
  },
  socialText: { flex: 1, fontSize: 14, color: colors.textSecondary, fontWeight: '500' },

  eventsSection: { marginTop: 18, gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 2 },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 10,
  },
  eventThumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  eventBody: { flex: 1, gap: 3 },
  eventTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  eventMeta: { fontSize: 12, color: colors.textMuted },

  attribution: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 22,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceAlt,
  },

  primaryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryButtonText: { color: colors.textInverse, fontSize: 15, fontWeight: '600' },
});
