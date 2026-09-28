// src/screens/PlacesScreen.tsx
//
// "Places" — venue discovery powered by the Google Maps scraper running on
// Migo's own infrastructure.
//
// The screen never blocks on a scrape. Cached results appear instantly; a
// cache miss shows a "looking this up" state and polls in the background,
// so a slow lookup degrades into a wait rather than a spinner-lock.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  RefreshControl,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  placesService,
  awaitSearch,
  Place,
  PlaceSearchStatus,
} from '../services/places.service';
import { useUserLocation, UAE_CITIES } from '../hooks/useUserLocation';

const QUICK_SEARCHES = [
  { label: 'Coffee', icon: 'cafe', keyword: 'specialty coffee shop' },
  { label: 'Brunch', icon: 'restaurant', keyword: 'brunch restaurant' },
  { label: 'Rooftop', icon: 'wine', keyword: 'rooftop lounge' },
  { label: 'Art', icon: 'color-palette', keyword: 'art gallery' },
  { label: 'Padel', icon: 'tennisball', keyword: 'padel court' },
  { label: 'Gym', icon: 'barbell', keyword: 'gym fitness' },
  { label: 'Beach', icon: 'sunny', keyword: 'beach club' },
  { label: 'Live music', icon: 'musical-notes', keyword: 'live music venue' },
];

function categoryIcon(category: string | null): any {
  const cat = (category || '').toLowerCase();
  if (cat.includes('coffee') || cat.includes('cafe')) return 'cafe';
  if (cat.includes('restaurant') || cat.includes('food')) return 'restaurant';
  if (cat.includes('bar') || cat.includes('lounge') || cat.includes('pub')) return 'wine';
  if (cat.includes('gallery') || cat.includes('art') || cat.includes('museum')) return 'color-palette';
  if (cat.includes('gym') || cat.includes('fitness')) return 'barbell';
  if (cat.includes('club') || cat.includes('night')) return 'musical-notes';
  if (cat.includes('park') || cat.includes('beach')) return 'sunny';
  if (cat.includes('sport') || cat.includes('court')) return 'tennisball';
  return 'location';
}

export default function PlacesScreen() {
  const navigation = useNavigation<any>();
  const location = useUserLocation();

  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<PlaceSearchStatus | 'idle'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [lastKeyword, setLastKeyword] = useState('');

  // Lets an in-flight poll be abandoned when the user searches again.
  const pollGuard = useRef<{ cancelled: boolean } | null>(null);

  useEffect(() => {
    return () => {
      if (pollGuard.current) pollGuard.current.cancelled = true;
    };
  }, []);

  /** Instant cache-only load, so the screen is never empty on open. */
  const loadNearby = useCallback(async () => {
    if (!location.coords) return;
    try {
      const result = await placesService.nearby({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        radiusKm: 25,
        limit: 20,
      });
      setPlaces(result.places);
      setStatus(result.places.length ? 'ready' : 'idle');
    } catch {
      // Cache read failing is not worth an error banner.
    }
  }, [location.coords]);

  useEffect(() => {
    if (location.coords && !query) void loadNearby();
  }, [location.coords, loadNearby, query]);

  const runSearch = useCallback(
    async (keyword: string) => {
      if (!keyword.trim()) return;

      if (!location.coords) {
        setShowExplainer(true);
        return;
      }

      if (pollGuard.current) pollGuard.current.cancelled = true;
      const guard = { cancelled: false };
      pollGuard.current = guard;

      setLoading(true);
      setError(null);
      setMessage(null);
      setLastKeyword(keyword);

      try {
        const initial = await placesService.search({
          keyword,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          radiusKm: 15,
        });

        setStatus(initial.status);
        if (initial.places.length) setPlaces(initial.places);
        setMessage(initial.message ?? null);

        if (initial.status === 'pending') {
          const final = await awaitSearch(initial.searchId, {
            origin: location.coords,
            signal: guard,
            onUpdate: (update) => {
              if (guard.cancelled) return;
              setStatus(update.status);
              if (update.places.length) setPlaces(update.places);
              setMessage(update.message ?? null);
            },
          });

          if (!guard.cancelled) {
            setStatus(final.status);
            setPlaces(final.places);
            setMessage(
              final.status === 'failed'
                ? final.message ?? 'That lookup did not come back.'
                : null
            );
          }
        }
      } catch (err: any) {
        if (!guard.cancelled) setError(err.message || 'Search failed');
      } finally {
        if (!guard.cancelled) setLoading(false);
      }
    },
    [location.coords]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (lastKeyword) await runSearch(lastKeyword);
    else await loadNearby();
    setRefreshing(false);
  }, [lastKeyword, runSearch, loadNearby]);

  const handleEnableLocation = async () => {
    setShowExplainer(false);
    const coords = await location.request();
    if (!coords) setShowCityPicker(true);
  };

  // ── Pre-permission explainer ───────────────────────────────────────────────
  if (showExplainer) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.explainer}>
          <View style={styles.explainerIcon}>
            <Ionicons name="location" size={44} color="#3b82f6" />
          </View>
          <Text style={styles.explainerTitle}>Find what's around you</Text>
          <Text style={styles.explainerBody}>
            Migo uses your location to show venues and events nearby, and to sort them by how
            far you'd actually have to travel.
          </Text>
          <Text style={styles.explainerNote}>
            Your location stays on your device for this session. We don't store a history of
            where you've been.
          </Text>

          <TouchableOpacity style={styles.primaryButton} onPress={handleEnableLocation}>
            <Text style={styles.primaryButtonText}>Use my location</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              setShowExplainer(false);
              setShowCityPicker(true);
            }}
          >
            <Text style={styles.secondaryButtonText}>Pick a city instead</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Manual city fallback ───────────────────────────────────────────────────
  if (showCityPicker) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.explainer}>
          <Text style={styles.explainerTitle}>Where are you?</Text>
          <Text style={styles.explainerBody}>Pick a city and we'll search from there.</Text>

          <View style={styles.cityGrid}>
            {UAE_CITIES.map((city) => (
              <TouchableOpacity
                key={city.label}
                style={styles.cityChip}
                onPress={async () => {
                  await location.setManualCity(city.label);
                  setShowCityPicker(false);
                }}
              >
                <Text style={styles.cityChipText}>{city.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main screen ────────────────────────────────────────────────────────────
  const renderPlace = ({ item }: { item: Place }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('PlaceDetail', { placeId: item.id })}
      activeOpacity={0.7}
    >
      {item.thumbnail ? (
        <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons name={categoryIcon(item.category)} size={24} color="#94a3b8" />
        </View>
      )}

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>

        {item.category ? (
          <Text style={styles.cardCategory} numberOfLines={1}>
            {item.category}
          </Text>
        ) : null}

        <View style={styles.cardMeta}>
          {item.rating ? (
            <View style={styles.metaItem}>
              <Ionicons name="star" size={13} color="#f59e0b" />
              <Text style={styles.metaText}>
                {item.rating.toFixed(1)}
                {item.reviewCount ? ` (${item.reviewCount})` : ''}
              </Text>
            </View>
          ) : null}

          {item.distanceKm != null ? (
            <View style={styles.metaItem}>
              <Ionicons name="navigate" size={13} color="#64748b" />
              <Text style={styles.metaText}>{item.distanceKm} km</Text>
            </View>
          ) : null}
        </View>
      </View>

      {item.phone ? (
        <TouchableOpacity
          style={styles.callButton}
          onPress={() => Linking.openURL(`tel:${item.phone}`)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="call" size={18} color="#3b82f6" />
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Places</Text>
        <TouchableOpacity
          style={styles.locationPill}
          onPress={() => setShowCityPicker(true)}
        >
          <Ionicons name="location" size={14} color="#3b82f6" />
          <Text style={styles.locationPillText}>
            {location.cityLabel ?? (location.hasLocation ? 'Nearby' : 'Set location')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#94a3b8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Coffee, padel, galleries…"
          placeholderTextColor="#94a3b8"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch(query)}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color="#cbd5e1" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
      >
        {QUICK_SEARCHES.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.chip, lastKeyword === item.keyword && styles.chipActive]}
            onPress={() => {
              setQuery(item.label);
              runSearch(item.keyword);
            }}
          >
            <Ionicons
              name={item.icon as any}
              size={14}
              color={lastKeyword === item.keyword ? '#fff' : '#475569'}
            />
            <Text
              style={[styles.chipText, lastKeyword === item.keyword && styles.chipTextActive]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {error ? (
        <View style={styles.banner}>
          <Ionicons name="alert-circle" size={16} color="#dc2626" />
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      ) : null}

      {status === 'pending' && message ? (
        <View style={[styles.banner, styles.bannerInfo]}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={[styles.bannerText, styles.bannerTextInfo]}>{message}</Text>
        </View>
      ) : null}

      {loading && places.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.centerText}>Looking around you…</Text>
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(item: Place) => item.id}
          renderItem={renderPlace}
          contentContainerStyle={
            places.length === 0 ? styles.emptyContainer : styles.listContent
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="compass-outline" size={44} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>
                {location.hasLocation ? 'Nothing here yet' : 'Set your location'}
              </Text>
              <Text style={styles.emptyBody}>
                {location.hasLocation
                  ? 'Try one of the shortcuts above, or search for something specific.'
                  : 'Turn on location or pick a city to start exploring.'}
              </Text>
              {!location.hasLocation && (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setShowExplainer(true)}
                >
                  <Text style={styles.primaryButtonText}>Set location</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#0f172a' },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  locationPillText: { fontSize: 13, color: '#3b82f6', fontWeight: '600' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a', padding: 0 },

  chipRow: { maxHeight: 44, marginTop: 12 },
  chipRowContent: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    height: 34,
  },
  chipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  chipTextActive: { color: '#fff' },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
  },
  bannerInfo: { backgroundColor: '#eff6ff' },
  bannerText: { flex: 1, fontSize: 13, color: '#dc2626' },
  bannerTextInfo: { color: '#1d4ed8' },

  listContent: { padding: 16, gap: 10 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  thumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: '#f1f5f9' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  cardCategory: { fontSize: 13, color: '#64748b' },
  cardMeta: { flexDirection: 'row', gap: 12, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: '#64748b' },
  callButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  centerText: { fontSize: 14, color: '#64748b', marginTop: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#334155', marginTop: 8 },
  emptyBody: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20 },

  explainer: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 12 },
  explainerIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  explainerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  explainerBody: {
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
  },
  explainerNote: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 8,
  },

  primaryButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    alignSelf: 'stretch',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { paddingVertical: 12, alignItems: 'center' },
  secondaryButtonText: { color: '#64748b', fontSize: 15 },

  cityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginTop: 16,
  },
  cityChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cityChipText: { fontSize: 14, color: '#334155', fontWeight: '500' },
});
