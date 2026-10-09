import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { Event } from '@migo/shared';
import Chip from '../components/Chip';
import Container from '../components/Container';
import EventCard from '../components/EventCard';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useLocale } from '../i18n';
import { navigateToTab } from '../navigation/navigationRef';
import { colors, radius, spacing, type } from '../theme';
import { fetchAllEvents } from '../utils/fetchAllEvents';

type CategoryCount = { name: string; count: number };

export default function CommunitiesScreen() {
  const { t, isRTL } = useLocale();
  const { width } = useBreakpoint();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const loadEvents = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const now = Date.now();
      const results = await fetchAllEvents({ source: 'my-dubai-communities' });
      setEvents(results
        .filter(event => new Date(event.startDate).getTime() > now)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()));
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadEvents();
  }, [loadEvents]));

  const categories = useMemo<CategoryCount[]>(() => {
    const counts = new Map<string, number>();
    events.forEach(event => {
      const category = event.category?.trim();
      if (category) counts.set(category, (counts.get(category) || 0) + 1);
    });
    return Array.from(counts, ([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);

  const filteredEvents = selectedCategory
    ? events.filter(event => event.category?.trim() === selectedCategory)
    : events;
  const columns = width < 600 ? 1 : width < 1024 ? 2 : 3;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={Platform.OS === 'web' ? undefined : (
        <RefreshControl refreshing={refreshing} onRefresh={() => void loadEvents(true)} />
      )}
    >
      <Container style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, isRTL && styles.rtlText]}>{t('communities')}</Text>
          <Text style={[styles.subtitle, isRTL && styles.rtlText]}>{t('communities_subtitle')}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label={`${t('all')} (${events.length})`}
            selected={!selectedCategory}
            onPress={() => setSelectedCategory(null)}
          />
          {categories.map(category => (
            <Chip
              key={category.name}
              label={`${category.name} (${category.count})`}
              selected={selectedCategory === category.name}
              onPress={() => setSelectedCategory(category.name)}
            />
          ))}
        </ScrollView>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredEvents.length ? (
          <View style={styles.grid}>
            {filteredEvents.map(event => (
              <View
                key={event.id}
                style={[
                  styles.card,
                  columns === 3 ? styles.cardDesktop : columns === 2 ? styles.cardTablet : styles.cardPhone,
                ]}
              >
                <EventCard
                  event={event}
                  onPress={() => navigateToTab('Events', 'EventDetail', { eventId: event.id })}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, isRTL && styles.rtlText]}>{t('communities_empty')}</Text>
          </View>
        )}
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: spacing.xxl },
  container: { paddingTop: spacing.xl, gap: spacing.lg },
  header: { gap: spacing.sm },
  title: { ...type.h1, color: colors.ink },
  subtitle: { ...type.body, color: colors.textSecondary },
  rtlText: { textAlign: 'right' },
  chips: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  card: { minWidth: 0 },
  cardDesktop: { width: '31%' },
  cardTablet: { width: '48%' },
  cardPhone: { width: '100%' },
  loading: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  empty: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  emptyText: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
});
