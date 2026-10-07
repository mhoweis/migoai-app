import { colors } from '../theme';
// src/screens/HomeScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
  RefreshControl,
  Platform,
  Modal,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUserStore } from '../store/userStore';
import { useSavedEventsStore } from '../store/savedEventsStore';
import { useWalletStore } from '../store/walletStore';
import { Event } from '@migo/shared';
import { api } from '../services/api';
import { socialService, SocialUser } from '../services/social.service';
import { navigateToTab, navigationRef } from '../navigation/navigationRef';
import { categoryLabel, formatEventDate, formatEventWhen, formatPrice, useLocale } from '../i18n';
import { sourceBadge } from '../utils/trust';
import { matchesEventDateRange } from '../utils/eventDateRange';
import { LinearGradient } from 'expo-linear-gradient';
import Chip from '../components/Chip';
import { gradients, radius, shadow, spacing, type } from '../theme';
import { PressableScale } from '../components/PressableScale';
import { Skeleton } from '../components/Skeleton';
import { HomeSectionId, normalizeHomeLayout } from '../config/homeSections';
import { fetchAllEvents } from '../utils/fetchAllEvents';
import { useBreakpoint } from '../hooks/useBreakpoint';
import Container from '../components/Container';
import SectionHeader from '../components/SectionHeader';
import EventCard from '../components/EventCard';
import WebFooter from '../components/WebFooter';
import DateBadge from '../components/DateBadge';

const RankedEventView = View as unknown as React.ComponentType<any>;
const RankedEventText = Text as unknown as React.ComponentType<any>;

type WeekendDigestPreview = {
  title: string;
  sections: Array<{ events: Array<{ id: string; title: string; coverImage?: string | null; isFree: boolean }> }>;
};

interface Props {
  navigation: any;
}

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { isWebDesktop, gutter, width } = useBreakpoint();
  const recommendationColumns = width >= 1400 ? 5 : 4;
  const recommendationCellWidth = (count: number) => (Math.min(width, 1240) - gutter * 2 - (count - 1) * 16) / count;
  const venueColumns = 3;
  const venueCellWidth = (Math.min(width, 1240) - gutter * 2 - (venueColumns - 1) * 12) / venueColumns;
  const topCardWidth = isWebDesktop
    ? (Math.min(width, 1240) - gutter * 2 - 32) / 3
    : Math.min(width * 0.75, 360);
  const { user, userLocation, setUserLocation } = useUserStore();
  const { t, locale } = useLocale();
  const { savedEvents, savedIds, loadSavedEvents, toggleSaved } = useSavedEventsStore();
  const { upcomingTickets, loadTickets } = useWalletStore();
  const [refreshing, setRefreshing] = useState(false);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [filteredTopEvents, setFilteredTopEvents] = useState<Event[]>([]);
  const [filteredThisWeek, setFilteredThisWeek] = useState<Event[]>([]);
  const [recommendedThisWeek, setRecommendedThisWeek] = useState<Event[]>([]);
  const [friendsGoingEvents, setFriendsGoingEvents] = useState<Array<Event & { friendsGoing: SocialUser[]; friendsGoingCount: number }>>([]);
  const [filteredToday, setFilteredToday] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTopIndex, setActiveTopIndex] = useState(0);
  const topListRef = useRef<FlatList<Event>>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTopScroll = (offsetX: number) => {
    const index = Math.round(offsetX / (topCardWidth + 16));
    setActiveTopIndex(index);
    if (Platform.OS !== 'web') return;
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      const target = index * (topCardWidth + 16);
      if (Math.abs(target - offsetX) > 1) topListRef.current?.scrollToOffset({ offset: target, animated: true });
    }, 140);
  };
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showAllVenues, setShowAllVenues] = useState(false);
  const [availableCities, setAvailableCities] = useState<Array<{ name: string; count: number }>>([]);
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [allCityEvents, setAllCityEvents] = useState<Event[]>([]);
  const [weekendDigest, setWeekendDigest] = useState<WeekendDigestPreview | null>(null);
  const heroFanEvents = React.useMemo(() => {
    const covers = new Set<string>();
    const events: Event[] = [];
    filteredTopEvents.forEach(event => {
      const cover = (event.coverImage || event.thumbnail || '').trim();
      const key = cover.split(/[?#]/, 1)[0].toLowerCase();
      if (!key || covers.has(key)) return;
      covers.add(key);
      events.push(event);
    });
    return events.slice(0, 3);
  }, [filteredTopEvents]);

  useEffect(() => {
    loadEvents();
    void loadWeekendDigest();
    loadSavedEvents();
    loadTickets();
  }, [user?.interests, userLocation, locale]);

  const loadWeekendDigest = async () => {
    try {
      const params = userLocation ? `?city=${encodeURIComponent(userLocation)}&lang=${locale}` : `?lang=${locale}`;
      const response = await api.get(`/digest/weekend${params}`);
      setWeekendDigest(response.data.data || null);
    } catch {
      setWeekendDigest(null);
    }
  };

  useEffect(() => {
    loadAvailableCities();
  }, []);

  const loadAvailableCities = async () => {
    try {
      console.log('Fetching available cities...');
      const response = await api.get('/events/filters/quick');
      console.log('Cities API response:', response.data);

      if (response.data.success && response.data.data?.cities) {
        const cities = response.data.data.cities;
        console.log('Setting cities:', cities);
        setAvailableCities(cities);
      } else {
        console.log('No cities in response, using fallback');
        // Fallback to default UAE cities if API returns no cities
        setAvailableCities([
          { name: 'Dubai', count: 0 },
          { name: 'Abu Dhabi', count: 0 },
          { name: 'Sharjah', count: 0 },
        ]);
      }
    } catch (error) {
      console.error('Error loading available cities:', error);
      // Fallback to default UAE cities if API fails
      setAvailableCities([
        { name: 'Dubai', count: 0 },
        { name: 'Abu Dhabi', count: 0 },
        { name: 'Sharjah', count: 0 },
      ]);
    }
  };

  // Filter events happening on today's date
  const getTodayEvents = (events: Event[]): Event[] => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return events.filter(event =>
      matchesEventDateRange(event, start.toISOString(), end.toISOString())
    );
  };

  // Filter events from today to end of current week (Sunday).
  // If today IS Sunday, the range extends to next Sunday.
  const getThisWeekEvents = (events: Event[]): Event[] => {
    const { start, end } = getThisWeekRange();

    return events.filter(event =>
      matchesEventDateRange(event, start.toISOString(), end.toISOString())
    );
  };

  const getThisWeekRange = (): { start: Date; end: Date } => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const dayOfWeek = start.getDay(); // 0 = Sun, 1 = Mon … 6 = Sat
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;

    const end = new Date(start);
    end.setDate(start.getDate() + daysUntilSunday);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  };

  const toDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Share an event via the native share sheet
  const handleShare = async (event: Event) => {
    try {
      const date = new Date(event.startDate).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      });
      await Share.share({
        message: `Check out "${event.title}" on ${date}${event.city ? ` in ${event.city}` : ''}! 🎉`,
        title: event.title,
      });
    } catch {}
  };

  const loadEvents = async () => {
    try {
      setRefreshing(true);
      const { start, end } = getThisWeekRange();

      // Fetch events filtered by user's location (default: Dubai)
      const [fetchedEvents, recommendedResponse, friendsGoingResponse] = await Promise.all([
        fetchAllEvents({
          city: userLocation || 'Dubai',
        }),
        api.get('/events/recommended', {
          params: {
            city: userLocation || 'Dubai',
            from: start.toISOString(),
            to: end.toISOString(),
            limit: 10,
          },
        }).catch(() => null),
        socialService.friendsGoingEvents(10).catch(() => null),
      ]);

      setAllCityEvents(fetchedEvents);

      // Apply interest filtering if user has interests
      let filtered = fetchedEvents;
      if (user?.interests && user.interests.length > 0) {
        filtered = fetchedEvents.filter((event: Event) =>
          user.interests.some((interest: string) =>
            event.category?.toLowerCase().includes(interest.toLowerCase())
          )
        );
      }

      setAllEvents(filtered);
      setFilteredEvents(filtered);
      setFilteredTopEvents(filtered.slice(0, 10));
      setFilteredThisWeek(getThisWeekEvents(filtered));
      setFilteredToday(getTodayEvents(filtered));
      const recommended = recommendedResponse?.data?.success
        ? recommendedResponse.data.data?.events || []
        : getThisWeekEvents(filtered).slice(0, 10);
      setRecommendedThisWeek(recommended.slice(0, 10));
      setFriendsGoingEvents(friendsGoingResponse || []);
    } catch (error) {
      console.error('Error loading events:', error);
      setAllCityEvents([]);
      setFilteredEvents([]);
      setFilteredTopEvents([]);
      setFilteredThisWeek([]);
      setFilteredToday([]);
      setRecommendedThisWeek([]);
      setFriendsGoingEvents([]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    await loadEvents();
  };

  // Function to navigate to Events tab
  const navigateToEvents = () => {
    navigateToTab('Events');
  };

  // Handle interest pill selection — filters all event sections on HomeScreen
  const handleInterestSelect = (interest: string) => {
    const next = selectedInterest === interest ? null : interest;
    setSelectedInterest(next);
    const base = next
      ? allEvents.filter((e: Event) =>
          e.category?.toLowerCase().includes(next.toLowerCase())
        )
      : allEvents;
    setFilteredEvents(base);
    setFilteredTopEvents(base.slice(0, 10));
    setFilteredThisWeek(getThisWeekEvents(base));
    setFilteredToday(getTodayEvents(base));
  };

  // Reset interest filter to show all events
  const handleResetFilter = () => {
    setSelectedInterest(null);
    setFilteredEvents(allEvents);
    setFilteredTopEvents(allEvents.slice(0, 10));
    setFilteredThisWeek(getThisWeekEvents(allEvents));
    setFilteredToday(getTodayEvents(allEvents));
  };

  // Derive top venues from all city events (sorted by event count)
  const topVenues = React.useMemo(() => {
    interface VenueInfo { name: string; image?: string; city: string; count: number }
    const map = new Map<string, VenueInfo>();
    allCityEvents.forEach((event: Event) => {
      if (!event.venueName) return;
      const existing = map.get(event.venueName);
      if (existing) {
        existing.count++;
        if (!existing.image) existing.image = event.coverImage || event.thumbnail;
      } else {
        map.set(event.venueName, {
          name: event.venueName,
          image: event.coverImage || event.thumbnail,
          city: event.city || '',
          count: 1,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [allCityEvents]);

  const renderVenueCard = (item: { name: string; image?: string; city: string; count: number }, style?: object) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={item.name}
      style={[styles.venueCard, style]}
      onPress={() => navigateToVenue(item.name)}
    >
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.venueImage} />
      ) : (
        <View style={[styles.venueImage, styles.venuePlaceholder]}>
          <Ionicons name="business-outline" size={32} color={colors.border} />
        </View>
      )}
      <View style={styles.venueOverlay}>
        <Text style={styles.venueName} numberOfLines={2}>{item.name}</Text>
        <View style={styles.venueMetaRow}>
          {item.city ? (
            <View style={styles.venueMetaItem}>
              <Ionicons name="location-outline" size={10} color="rgba(255,255,255,0.8)" />
              <Text style={styles.venueMetaText} numberOfLines={1}>{item.city}</Text>
            </View>
          ) : null}
          <View style={styles.venueEventCount}>
            <Text style={styles.venueEventCountText}>{item.count} {t(item.count === 1 ? 'events_count_one' : 'events_count_other')}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  // Navigate to EventsScreen filtered by a specific venue
  const navigateToVenue = (venueName: string) => {
    navigateToTab('Events', 'EventsMain', { venueFilter: venueName });
  };

  // Helper function to get category icon
  const getCategoryIcon = (category: string): any => {
    const cat = category?.toLowerCase() || '';
    if (cat.includes('music') || cat.includes('concert')) return 'musical-notes';
    if (cat.includes('sport')) return 'football';
    if (cat.includes('art') || cat.includes('exhibition')) return 'color-palette';
    if (cat.includes('food') || cat.includes('drink')) return 'restaurant';
    if (cat.includes('tech') || cat.includes('business')) return 'briefcase';
    if (cat.includes('family') || cat.includes('kids')) return 'people';
    if (cat.includes('theater') || cat.includes('comedy')) return 'mic';
    if (cat.includes('health') || cat.includes('wellness')) return 'fitness';
    if (cat.includes('education') || cat.includes('learning')) return 'school';
    if (cat.includes('network')) return 'people-circle';
    return 'calendar';
  };

  const renderTopEventCard = ({ item }: { item: Event }) => {
    const formattedDate = formatEventWhen(item, locale);

    const saved = savedIds.has(item.id);
    const trustKind = sourceBadge((item as any).trust, locale)?.kind;
    const isOfficial = ['official', 'venue'].includes(trustKind || '');

    return (
      <View style={[styles.topEventCard, { width: topCardWidth }]}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={item.title}
          style={styles.topEventCardContent}
          onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
        >
          {item.coverImage ? (
            <Image source={{ uri: item.coverImage }} style={styles.topEventImage} />
          ) : (
            <View style={[styles.topEventImage, styles.placeholderImageTop]}>
              <Ionicons name="image-outline" size={48} color={colors.border} />
            </View>
          )}
          <LinearGradient colors={['rgba(15,18,34,0.15)', 'rgba(15,18,34,0.05)', 'rgba(15,18,34,0.85)']} style={styles.topEventOverlay}>
            <View style={styles.topEventTopRow}>
              <View style={styles.topEventBadge}>
                <Text style={styles.topEventBadgeText}>{t('featured')}</Text>
              </View>
              {isOfficial && (
                <View style={styles.topTrustPill}><Ionicons name="shield-checkmark" size={11} color={colors.textInverse} /><Text style={styles.topTrustPillText}>{t('official')}</Text></View>
              )}
            </View>

            <View style={styles.topEventContent}>
              <Text style={styles.topEventTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <View style={styles.topEventMeta}>
                <Ionicons name="calendar-outline" size={12} color={colors.textInverse} />
                <Text style={[styles.topEventMetaText, formattedDate.startsWith(t('now_on')) && styles.topEventLiveWhen]}>
                  {formattedDate}
                </Text>
              </View>
              <View style={styles.topEventMeta}>
                <Ionicons name="location-outline" size={12} color={colors.textInverse} />
                <Text style={styles.topEventMetaText}>
                  {item.city}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </PressableScale>
        <View style={styles.topEventActions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={saved ? t('remove_saved_event') : t('save_event')}
            hitSlop={4}
            style={styles.topEventActionBtn}
            onPress={() => toggleSaved(item)}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={saved ? colors.accent : colors.textInverse}
            />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('share')}
            hitSlop={4}
            style={styles.topEventActionBtn}
            onPress={() => handleShare(item)}
          >
            <Ionicons name="share-outline" size={18} color={colors.textInverse} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEventCard = (item: Event, isToday = false, rank?: number) => {
    const formattedDate = formatEventWhen(item, locale);

    // Format price with "Starting from" text
    const priceDisplay = item.isFree || !item.priceFrom ? (
      <Text style={styles.eventPrice}>{t('free')}</Text>
    ) : (
      <View style={styles.priceContainer}>
        <Text style={styles.priceStarting}>{t('starting')} </Text>
        <Text style={styles.eventPrice}>
          {formatPrice(Number(item.priceFrom), item.currency || 'AED')}
        </Text>
      </View>
    );

    const saved = savedIds.has(item.id);

    if (rank !== undefined) {
      const trustKind = sourceBadge((item as any).trust, locale)?.kind;
      const isOfficial = ['official', 'venue'].includes(trustKind || '');
      return (
        <RankedEventView key={item.id} style={styles.rankedEventCard}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={item.title}
            style={styles.rankedEventContent}
            onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
          >
            <RankedEventView style={styles.rankedEventImage}>
              {item.coverImage || item.thumbnail ? (
                <Image source={{ uri: item.coverImage || item.thumbnail }} style={styles.rankedEventCover} />
              ) : (
                <RankedEventView style={[styles.rankedEventCover, styles.placeholderImageSmall]}>
                  <Ionicons name="image-outline" size={28} color={colors.border} />
                </RankedEventView>
              )}
              <RankedEventView style={styles.rankedEventRank}>
                <RankedEventText style={styles.rankedEventRankText}>{rank}</RankedEventText>
              </RankedEventView>
            </RankedEventView>
            <RankedEventView style={styles.rankedEventDetails}>
              <RankedEventView style={styles.rankedEventEyebrow}>
                <RankedEventText style={styles.rankedEventCategory} numberOfLines={1}>{categoryLabel(item.category)}</RankedEventText>
                {isOfficial ? (
                  <RankedEventView accessible accessibilityRole="image" accessibilityLabel={t('official')} style={styles.rankedEventOfficial}>
                    <Ionicons name="shield-checkmark" size={15} color={colors.info} />
                  </RankedEventView>
                ) : null}
              </RankedEventView>
              <RankedEventText style={styles.rankedEventTitle} numberOfLines={2}>{item.title}</RankedEventText>
              <RankedEventText style={styles.rankedEventMeta} numberOfLines={1}>
                {formattedDate} · {item.venueName || item.city}
              </RankedEventText>
              <RankedEventView style={styles.rankedEventPrice}>{priceDisplay}</RankedEventView>
            </RankedEventView>
          </TouchableOpacity>
          <RankedEventView style={[styles.rankedEventActions, Platform.OS === 'web' && width < 1024 && styles.rankedEventActionsWithChatFab]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={saved ? t('remove_saved_event') : t('save_event')}
              hitSlop={4}
              style={styles.rankedEventActionButton}
              onPress={() => toggleSaved(item)}
            >
              <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={18} color={saved ? colors.primary : colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('share')}
              hitSlop={4}
              style={styles.rankedEventActionButton}
              onPress={() => handleShare(item)}
            >
              <Ionicons name="share-outline" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </RankedEventView>
        </RankedEventView>
      );
    }

    return (
      <View key={item.id} style={[styles.eventCard, isToday && styles.todayEventCard]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={item.title}
          style={styles.eventCardContent}
          onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
        >
          {rank ? <View style={styles.eventRank}><Text style={styles.eventRankText}>{rank}</Text></View> : null}
          {item.coverImage || item.thumbnail ? (
            <Image source={{ uri: item.coverImage || item.thumbnail }} style={styles.eventImage} />
          ) : (
            <View style={[styles.eventImage, styles.placeholderImageSmall]}>
              <Ionicons name="image-outline" size={32} color={colors.border} />
            </View>
          )}
          <View style={styles.eventContent}>
            <View style={styles.eventHeader}>
              <Text style={styles.eventCategory}>{categoryLabel(item.category)}</Text>
              {sourceBadge((item as any).trust, locale)?.kind && ['official', 'venue'].includes(sourceBadge((item as any).trust, locale)?.kind || '') && (
                <View style={styles.trustPill}><Ionicons name="shield-checkmark" size={11} color={colors.info} /><Text style={styles.trustPillText}>{t('official')}</Text></View>
              )}
            </View>
            <Text style={styles.eventTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.eventMeta}>
              <View style={styles.eventMetaItem}>
                <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
                <Text style={styles.eventMetaText}>{formattedDate}</Text>
              </View>
              <View style={styles.eventMetaItem}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <Text style={styles.eventMetaText}>{item.city}</Text>
              </View>
            </View>
            <View style={styles.eventFooter}>
              {priceDisplay}
              {!!item.capacity && (
                <View style={styles.eventTickets}>
                  <Ionicons name="people-outline" size={14} color={colors.success} />
                  <Text style={styles.eventTicketsText}>
                    {item.capacity} {t('capacity')}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
        <View style={styles.eventCardActions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={saved ? t('remove_saved_event') : t('save_event')}
            style={styles.eventCardActionBtn}
            onPress={() => toggleSaved(item)}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={20}
              color={saved ? colors.primary : colors.textMuted}
            />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('share')}
            style={styles.eventCardActionBtn}
            onPress={() => handleShare(item)}
          >
            <Ionicons name="share-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderInterestPills = () => {
    if (!user?.interests || user.interests.length === 0) return null;

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.interestsScroll}
        contentContainerStyle={styles.interestsContainer}
      >
        {/* "All" reset pill — always shown first */}
        <Chip label={t('all')} selected={selectedInterest === null} onPress={handleResetFilter} />

        {user.interests.map((interest) => (
          <Chip key={interest} label={interest} selected={selectedInterest === interest} onPress={() => handleInterestSelect(interest)} />
        ))}

        {/* Update interests button */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('update_interests')}
          style={styles.editInterestsButton}
          onPress={() => navigation.push('Interests')}
        >
          <Ionicons name="heart-outline" size={16} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderWeekend = () => weekendDigest ? (
    <PressableScale
      style={styles.weekendCardRing}
      onPress={() => navigationRef.current?.navigate('WeekendDigest')}
    >
      <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.weekendCard}>
        <View style={styles.weekendCardHeader}>
          <View>
            <Text style={styles.weekendTitle}>{t('this_weekend')}</Text>
            <Text style={styles.weekendSubtitle}>{weekendDigest.title}</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={32} color={colors.textInverse} />
        </View>
        <Text style={styles.weekendCount}>
          {weekendDigest.sections.reduce((count, section) => count + section.events.length, 0)} {t('events')} · {t('free')}: {weekendDigest.sections.flatMap(section => section.events).filter(event => event.isFree).length}
        </Text>
        <View style={styles.weekendPosters}>
          {weekendDigest.sections.flatMap(section => section.events).slice(0, 3).map(event => (
            event.coverImage
              ? <Image key={event.id} source={{ uri: event.coverImage }} style={styles.weekendPoster} />
              : <View key={event.id} style={[styles.weekendPoster, styles.weekendPosterPlaceholder]}><Ionicons name="calendar-outline" size={20} color={colors.textMuted} /></View>
          ))}
        </View>
      </LinearGradient>
    </PressableScale>
  ) : null;

  const renderFeatured = () => (
    <View style={styles.section}>
      <SectionHeader
        title={t('top_upcoming_events')}
        onSeeAll={navigateToEvents}
        trailingContent={isWebDesktop ? (
          <View style={styles.carouselHeaderControls}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('previous')} style={styles.carouselArrow} onPress={() => topListRef.current?.scrollToOffset({ offset: Math.max(0, activeTopIndex - 1) * (topCardWidth + 16), animated: true })}>
              <Ionicons name="arrow-back" size={18} color={colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('next')} style={styles.carouselArrow} onPress={() => topListRef.current?.scrollToOffset({ offset: Math.min(filteredTopEvents.length - 1, activeTopIndex + 1) * (topCardWidth + 16), animated: true })}>
              <Ionicons name="arrow-forward" size={18} color={colors.ink} />
            </TouchableOpacity>
          </View>
        ) : null}
      />
      <FlatList
        ref={topListRef}
        horizontal
        data={filteredTopEvents}
        renderItem={renderTopEventCard}
        keyExtractor={(item: Event) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.topEventsContainer}
        snapToInterval={topCardWidth + 16}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={(e: { nativeEvent: { contentOffset: { x: number } } }) => handleTopScroll(e.nativeEvent.contentOffset.x)}
        ListEmptyComponent={loading ? (
          <View style={styles.topEventsSkeletonRow}>
            <Skeleton style={[styles.topEventSkeleton, { width: topCardWidth }]} />
            <Skeleton style={[styles.topEventSkeleton, { width: topCardWidth }]} />
          </View>
        ) : null}
      />
      {filteredTopEvents.length > 1 && (
        <View style={styles.dots}>
          {filteredTopEvents.slice(0, 10).map((event, index) => (
            <View key={event.id} style={[styles.dot, index === Math.min(activeTopIndex, 9) && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );

  const thisWeekEvents = selectedInterest
    ? recommendedThisWeek.filter(event => event.category?.toLowerCase().includes(selectedInterest.toLowerCase()))
    : recommendedThisWeek;

  const renderThisWeek = () => (
    <View style={styles.section}>
      <SectionHeader title={t('this_week_for_you')} subtitle={t('personalised_for_you')} onSeeAll={() => {
          const { start, end } = getThisWeekRange();
          navigateToTab('Events', 'EventsMain', {
            dateFrom: toDateString(start),
            dateTo: toDateString(end),
          });
        }} />
      {thisWeekEvents.length > 0 ? (
        isWebDesktop ? (
          <View style={styles.recommendationGrid}>
            {thisWeekEvents.slice(0, 10).map((event, index) => (
              <View key={event.id} style={[styles.recommendationCell, { width: recommendationCellWidth(recommendationColumns) }]}>
                <EventCard
                  event={event}
                  rank={index + 1}
                  onPress={() => navigation.navigate('EventDetail', { eventId: event.id })}
                  onSave={() => toggleSaved(event)}
                  onShare={() => void handleShare(event)}
                  saved={savedIds.has(event.id)}
                />
              </View>
            ))}
          </View>
        ) : thisWeekEvents.slice(0, 10).map((event, index) => renderEventCard(event, false, index + 1))
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color={colors.border} />
          <Text style={styles.emptyStateText}>{t('no_events_help')}</Text>
          <TouchableOpacity style={styles.exploreButton} onPress={navigateToEvents}>
            <Text style={styles.exploreButtonText}>{t('explore_all_events')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderVenues = () => topVenues.length > 0 ? (
    <View style={styles.section}>
      <SectionHeader
        title={t('top_venues')}
        actionLabel={showAllVenues ? t('show_less') : `${t('see_all')} (${topVenues.length})`}
        actionRole="button"
        onSeeAll={() => setShowAllVenues(value => !value)}
      />
      <View style={styles.venuesGrid}>
        {(showAllVenues ? topVenues : topVenues.slice(0, isWebDesktop ? 6 : 3)).map(item => (
          <React.Fragment key={item.name}>
            {renderVenueCard(item, [
              isWebDesktop ? styles.venueGridDesktop : styles.venueGridCard,
              { width: venueCellWidth },
            ])}
          </React.Fragment>
        ))}
      </View>
    </View>
  ) : null;

  const renderFriends = () => friendsGoingEvents.length > 0 ? (
    <View style={styles.section}>
      <SectionHeader title={t('friends_are_going')} />
      <View style={isWebDesktop ? styles.friendsGrid : undefined}>
      {friendsGoingEvents.slice(0, 5).map((event) => {
        const friends = event.friendsGoing.slice(0, 3);
        const firstFriend = event.friendsGoing[0];
        const remainingCount = Math.max(0, event.friendsGoingCount - 1);
        const friendsRow = (
          <View style={[styles.friendsRow, isWebDesktop && styles.friendsRowCard]}>
            <View style={styles.friendsAvatars}>
              {friends.map((friend, index) => (
                <TouchableOpacity key={friend.id} accessibilityRole="button" accessibilityLabel={friend.name || t('profile_user')} onPress={() => navigateToTab('Profile', 'UserProfile', { userId: friend.id })}>
                  {friend.avatar ? (
                    <Image
                      source={{ uri: friend.avatar }}
                      style={[styles.friendAvatar, index > 0 && styles.friendAvatarOverlap]}
                    />
                  ) : (
                    <View style={[styles.friendAvatar, styles.friendAvatarFallback, index > 0 && styles.friendAvatarOverlap]}>
                      <Text style={styles.friendAvatarInitial}>{(friend.name || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            {firstFriend ? (
              <TouchableOpacity accessibilityRole="button" onPress={() => navigateToTab('Profile', 'UserProfile', { userId: firstFriend.id })}>
              <Text style={styles.friendsGoingText}>
                {remainingCount > 0
                  ? t('friends_going_names', { name: firstFriend.name || '', count: remainingCount })
                  : t('friend_going_single', { name: firstFriend.name || '' })}
              </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
        return (
          <View key={event.id} style={isWebDesktop ? [styles.friendsCell, { width: recommendationCellWidth(3) }] : undefined}>
            {isWebDesktop ? (
              <EventCard event={event} onPress={() => navigation.navigate('EventDetail', { eventId: event.id })} onSave={() => toggleSaved(event)} onShare={() => void handleShare(event)} saved={savedIds.has(event.id)} footerSlot={friendsRow} />
            ) : (
              <>
                {renderEventCard(event)}
                {friendsRow}
              </>
            )}
          </View>
        );
      })}
      </View>
    </View>
  ) : null;

  const renderToday = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SectionHeader title={t('todays_picks')} horizontalInset={0} />
        <View style={styles.todayBadge}>
          <Ionicons name="flash" size={12} color={colors.textInverse} />
          <Text style={styles.todayBadgeText}>{t('live')}</Text>
        </View>
      </View>
      {filteredToday.length > 0 ? (
        filteredToday.map((event) => renderEventCard(event, true))
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={48} color={colors.border} />
          <Text style={styles.emptyStateText}>{t('no_events_help')}</Text>
          <Text style={styles.emptyStateSubtext}>{t('explore_all_events')}</Text>
        </View>
      )}
    </View>
  );

  const renderTickets = () => upcomingTickets().length > 0 ? (
    <View style={styles.section}>
      <SectionHeader title={t('your_tickets')} actionLabel={t('view_wallet')} onSeeAll={() => navigateToTab('Wallet')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 0, gap: 12 }}>
        {upcomingTickets().slice(0, 5).map((ticket) => (
          <TouchableOpacity key={ticket.id} style={styles.ticketPreviewCard} onPress={() => navigateToTab('Wallet')}>
            <View style={[styles.ticketPreviewTop, { backgroundColor: ticket.category === 'Music' ? colors.primaryDark : ticket.category === 'Sports' ? colors.success : colors.primary }]}>
              <Text style={styles.ticketPreviewCategory}>{categoryLabel(ticket.category)}</Text>
              <Text style={styles.ticketPreviewTitle} numberOfLines={2}>{ticket.eventTitle}</Text>
            </View>
            <View style={styles.ticketPreviewBottom}>
              <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
              <Text style={styles.ticketPreviewDate}>{formatEventDate(ticket.eventDate)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  ) : null;

  const renderSaved = () => savedEvents.length > 0 ? (
    <View style={styles.section}>
      <SectionHeader title={t('your_saved_events')} onSeeAll={() => navigateToTab('Events')} />
      {isWebDesktop ? (
        <View style={styles.recommendationGrid}>
          {savedEvents.slice(0, 4).map(event => (
            <View key={event.id} style={[styles.recommendationCell, { width: recommendationCellWidth(4) }]}>
              <EventCard event={event} onPress={() => navigation.navigate('EventDetail', { eventId: event.id })} onSave={() => toggleSaved(event)} onShare={() => void handleShare(event)} saved={savedIds.has(event.id)} />
            </View>
          ))}
        </View>
      ) : savedEvents.slice(0, 4).map((event) => renderEventCard(event))}
    </View>
  ) : null;

  const renderAssistant = () => (
    <TouchableOpacity style={styles.aiAssistantButton} onPress={() => navigateToTab('Chat')}>
      <View style={styles.aiAssistantIcon}>
        <Ionicons name="sparkles" size={24} color={colors.textInverse} />
      </View>
      <View style={styles.aiAssistantText}>
        <Text style={styles.aiAssistantTitle}>{t('need_help')}</Text>
        <Text style={styles.aiAssistantSubtitle}>{t('chat_with_ai')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color={colors.primary} />
    </TouchableOpacity>
  );

  const sectionRenderers: Record<HomeSectionId, () => React.ReactNode> = {
    interests: renderInterestPills,
    weekend: renderWeekend,
    featured: renderFeatured,
    thisWeek: renderThisWeek,
    friends: renderFriends,
    venues: renderVenues,
    today: renderToday,
    tickets: renderTickets,
    saved: renderSaved,
    assistant: renderAssistant,
  };
  const layout = normalizeHomeLayout(user?.preferences?.homeLayout);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <Container style={styles.heroShell}>
        <LinearGradient
          colors={isWebDesktop ? [colors.ink, ...gradients.dusk] : gradients.dusk}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, Platform.OS === 'web' && !isWebDesktop && styles.mobileWebHero, isWebDesktop && styles.desktopHero]}
        >
          <View style={[styles.heroContent, isWebDesktop && styles.desktopHeroContent]}>
            <View style={[styles.heroLeft, !isWebDesktop && styles.heroLeftFull]}>
              <View style={styles.header}>
                <View style={styles.headerText}>
                  <Text style={[styles.greetingHero, isWebDesktop && styles.desktopGreetingHero]}>{isWebDesktop
                    ? t('home_desktop_headline', { city: userLocation || 'Dubai' })
                    : t('home_greeting', { name: user?.name?.split(' ')[0] || t('welcome') })}</Text>
                  <Text style={styles.subtitleHero}>{t('home_subtitle')}</Text>
                </View>
                <TouchableOpacity style={styles.locationDisplayHero} onPress={() => setShowLocationModal(true)} accessibilityRole="button" accessibilityLabel={t('select_location')}>
                  <Ionicons name="location" size={20} color={colors.textInverse} />
                  <Text style={styles.locationTextHero} numberOfLines={1}>{userLocation || 'Dubai'}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textInverse} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              </View>
              {isWebDesktop ? (
                <PressableScale style={[styles.homeSearch, styles.desktopHeroSearch]} onPress={navigateToEvents} accessibilityRole="button" scaleTo={0.98}>
                  <Ionicons name="search" size={20} color={colors.primary} />
                  <Text style={styles.homeSearchText} numberOfLines={1}>{t('search_events')}</Text>
                  <View style={styles.homeSearchAction}><Ionicons name="options-outline" size={16} color={colors.textInverse} /></View>
                </PressableScale>
              ) : null}
            </View>
            {isWebDesktop ? (
              <View style={styles.heroFan}>
                {heroFanEvents.map((event, index) => (
                  <PressableScale
                    key={event.id}
                    accessibilityRole="button"
                    accessibilityLabel={event.title}
                    onPress={() => navigation.navigate('EventDetail', { eventId: event.id })}
                    style={[styles.heroFanImage, { zIndex: index === 1 ? 3 : 1, transform: [{ translateX: (index - 1) * 40 }, { rotate: `${(index - 1) * 8}deg` }] }]}
                  >
                    <Image source={{ uri: event.coverImage || event.thumbnail }} style={styles.heroFanCover} />
                    {index === 1 ? <View style={styles.heroFanDateBadge}><DateBadge date={event.startDate} /></View> : null}
                  </PressableScale>
                ))}
              </View>
            ) : null}
          </View>
          <View pointerEvents="none" style={styles.heroOrb} />
          <View pointerEvents="none" style={styles.heroOrbSmall} />
        </LinearGradient>
        </Container>
        {!isWebDesktop ? (
          <PressableScale style={styles.homeSearch} onPress={navigateToEvents} accessibilityRole="button" scaleTo={0.98}>
            <Ionicons name="search" size={20} color={colors.primary} />
            <Text style={styles.homeSearchText} numberOfLines={1}>{t('search_events')}</Text>
            <View style={styles.homeSearchAction}><Ionicons name="options-outline" size={16} color={colors.textInverse} /></View>
          </PressableScale>
        ) : null}

        <Container style={styles.pageContent}>
          {layout.order
            .filter(id => !layout.hidden.includes(id))
            .map(id => <React.Fragment key={id}>{sectionRenderers[id]()}</React.Fragment>)}

          <PressableScale
            style={styles.customizeButton}
            onPress={() => navigationRef.current?.navigate('CustomizeHome')}
            accessibilityRole="button"
            testID="customize-home-button"
          >
            <Ionicons name="options-outline" size={18} color={colors.primary} />
            <Text style={styles.customizeButtonText}>{t('customize_home')}</Text>
          </PressableScale>
        </Container>
        {isWebDesktop ? <WebFooter /> : null}
      </ScrollView>

      {/* Location Selection Modal */}
      <Modal
        visible={showLocationModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLocationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('select_location')}</Text>
              <TouchableOpacity onPress={() => setShowLocationModal(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Choose your preferred city for event discovery
            </Text>

            <ScrollView style={styles.citiesScroll} showsVerticalScrollIndicator={false}>
              {availableCities.map((cityObj) => (
                <TouchableOpacity
                  key={cityObj.name}
                  style={[
                    styles.cityOption,
                    userLocation === cityObj.name && styles.cityOptionSelected,
                  ]}
                  onPress={async () => {
                    await setUserLocation(cityObj.name);
                    setShowLocationModal(false);
                  }}
                >
                  <View style={styles.cityOptionContent}>
                    <Ionicons
                      name="location"
                      size={24}
                      color={userLocation === cityObj.name ? colors.primary : colors.textMuted}
                    />
                    <View style={styles.cityTextContainer}>
                      <Text
                        style={[
                          styles.cityOptionText,
                          userLocation === cityObj.name && styles.cityOptionTextSelected,
                        ]}
                      >
                        {cityObj.name}
                      </Text>
                      <Text style={styles.cityEventCount}>
                        {cityObj.count} {cityObj.count === 1 ? 'event' : 'events'}
                      </Text>
                    </View>
                  </View>
                  {userLocation === cityObj.name && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}

              {availableCities.length === 0 && (
                <View style={styles.noCitiesContainer}>
                  <Ionicons name="location-outline" size={48} color={colors.border} />
                  <Text style={styles.noCitiesText}>{t('loading_cities')}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  heroShell: {},
  hero: { paddingTop: 8, paddingBottom: 28, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, overflow: 'hidden' },
  mobileWebHero: { paddingTop: 40 },
  desktopHero: { height: 440, justifyContent: 'center', borderRadius: radius.xl, paddingHorizontal: 64, paddingTop: 56, paddingBottom: 56 },
  heroContent: { width: '100%' },
  desktopHeroContent: { width: '100%', alignSelf: 'center', flex: 1, flexDirection: 'row', alignItems: 'center', gap: 36 },
  heroLeft: { flex: 1, maxWidth: 560, zIndex: 1 },
  heroLeftFull: { maxWidth: '100%', width: '100%' },
  desktopHeroSearch: { marginHorizontal: 0, marginTop: 20, maxWidth: 500 },
  heroFan: { flex: 1, minWidth: 300, height: 320, alignItems: 'center', justifyContent: 'center' },
  heroFanImage: { position: 'absolute', width: '52%', height: 270, borderRadius: radius.lg, borderWidth: 3, borderColor: colors.surface, overflow: 'hidden', ...shadow.float },
  heroFanCover: { width: '100%', height: '100%' },
  heroFanDateBadge: { position: 'absolute', top: 12, left: 12 },
  heroOrb: { position: 'absolute', right: -80, top: -120, width: 380, height: 380, borderRadius: 190, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  heroOrbSmall: { position: 'absolute', right: 120, bottom: -220, width: 320, height: 320, borderRadius: 160, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  pageContent: {},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 0,
    paddingTop: 20,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  greetingHero: { ...type.h1, color: colors.textInverse },
  desktopGreetingHero: { ...type.display, color: colors.textInverse },
  subtitleHero: { ...type.body, color: 'rgba(255,255,255,0.82)', marginTop: 4 },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  locationDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  headerText: { flex: 1, minWidth: 0, marginEnd: spacing.md },
  locationDisplayHero: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  locationTextHero: { fontSize: 14, fontWeight: '600', color: colors.textInverse, marginLeft: 4 },
  homeSearch: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: 20, marginTop: -28, paddingLeft: 18, paddingRight: 6, height: 56, borderRadius: radius.pill, backgroundColor: colors.surface, ...shadow.card },
  homeSearchText: { ...type.body, color: colors.textMuted, flex: 1 },
  homeSearchAction: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  locationText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryDark,
    marginLeft: 4,
  },
  interestsScroll: {
    paddingLeft: 0,
    marginTop: 20,
    marginBottom: 20,
  },
  interestsContainer: {
    paddingRight: 0,
    gap: 8,
  },
  interestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  interestPillActive: {
    backgroundColor: colors.primaryDark,
    borderWidth: 2,
    borderColor: colors.textInverse,
  },
  interestPillAll: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  interestPillAllActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  interestPillText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  editInterestsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  section: {
    marginBottom: 32,
  },
  recommendationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingHorizontal: 0 },
  recommendationCell: { minWidth: 0 },
  carouselHeaderControls: { flexDirection: 'row', alignItems: 'center', gap: 4, marginEnd: 4 },
  carouselArrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  friendsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingHorizontal: 0 },
  friendsCell: { width: '31%', minWidth: 0 },
  weekendCard: { padding: 18, borderRadius: radius.lg },
  weekendCardRing: { marginHorizontal: 0, marginBottom: 24, borderRadius: radius.lg, ...shadow.card },
  weekendCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekendTitle: { fontSize: 22, fontWeight: '800', color: colors.textInverse, letterSpacing: -0.3 },
  weekendSubtitle: { marginTop: 4, color: 'rgba(255,255,255,0.85)' },
  weekendCount: { marginTop: 10, color: colors.textInverse, fontWeight: '700' },
  weekendPosters: { flexDirection: 'row', gap: 8, marginTop: 14 },
  weekendPoster: { width: 72, height: 72, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  weekendPosterPlaceholder: { backgroundColor: colors.primarySoft, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
    marginBottom: 16,
  },
  sectionTitleBlock: {
    flex: 1,
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  sectionSubtitle: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 11,
  },
  friendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    marginTop: -6,
    marginBottom: 12,
  },
  friendsRowCard: { flex: 1, minWidth: 0, paddingHorizontal: 0, marginTop: 0, marginBottom: 0 },
  friendsAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  friendAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  friendAvatarOverlap: {
    marginLeft: -8,
  },
  friendAvatarFallback: {
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendAvatarInitial: {
    color: colors.primaryDark,
    fontSize: 11,
    fontWeight: '700',
  },
  friendsGoingText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  seeAll: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  topEventsContainer: {
    paddingLeft: 0,
    gap: 16,
  },
  topEventCard: {
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.card,
  },
  topEventCardContent: { flex: 1 },
  topEventsSkeletonRow: { flexDirection: 'row', gap: 16 },
  topEventSkeleton: { height: 220, borderRadius: radius.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { width: 20, backgroundColor: colors.primary },
  topEventImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImageTop: {
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topEventOverlay: {
    ...StyleSheet.absoluteFill,
    padding: 12,
    justifyContent: 'space-between',
  },
  topEventBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 12,
  },
  topEventBadgeText: {
    color: colors.textInverse,
    fontSize: 9,
    fontWeight: 'bold',
  },
  topEventTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 6,
    paddingEnd: 88,
  },
  topEventActions: {
    position: 'absolute',
    top: 12,
    end: 12,
    zIndex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  topEventActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topEventContent: {
    marginTop: 'auto',
  },
  topEventTitle: {
    color: colors.textInverse,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  topEventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  topEventMetaText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginLeft: 6,
  },
  topEventLiveWhen: {
    color: colors.ink,
    backgroundColor: colors.accent,
    overflow: 'hidden',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontWeight: '800',
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: colors.textInverse,
    marginHorizontal: 0,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  eventCardContent: { flex: 1, minWidth: 0, flexDirection: 'row' },
  rankedEventCard: { minHeight: 120, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: 12, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow.card },
  rankedEventContent: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankedEventImage: { width: 96, height: 96, borderRadius: 14, overflow: 'hidden', position: 'relative', backgroundColor: colors.surfaceAlt },
  rankedEventCover: { width: '100%', height: '100%' },
  rankedEventRank: { position: 'absolute', left: 8, bottom: 8, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink },
  rankedEventRankText: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  rankedEventDetails: { flex: 1, minWidth: 0, justifyContent: 'center' },
  rankedEventEyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  rankedEventCategory: { flex: 1, minWidth: 0, color: colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  rankedEventOfficial: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  rankedEventTitle: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 18 },
  rankedEventMeta: { marginTop: 3, color: colors.textMuted, fontSize: 11, lineHeight: 14 },
  rankedEventPrice: { marginTop: 3 },
  rankedEventActions: { flexDirection: 'column', alignItems: 'center', gap: 4 },
  rankedEventActionsWithChatFab: { marginEnd: 16 },
  rankedEventActionButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.surfaceAlt },
  eventRank: { position: 'absolute', zIndex: 2, top: 12, left: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  eventRankText: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  todayEventCard: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  eventImage: {
    width: 120,
    height: '100%',
  },
  placeholderImageSmall: {
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventContent: {
    flex: 1,
    padding: 16,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trustPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.successSoft, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  trustPillText: { color: colors.success, fontSize: 10, fontWeight: '700' },
  topTrustPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(22,101,52,0.85)', paddingHorizontal: 4, paddingVertical: 3, borderRadius: 10 },
  topTrustPillText: { color: colors.textInverse, fontSize: 9, fontWeight: '700' },
  eventCategory: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    lineHeight: 22,
  },
  eventMeta: {
    marginBottom: 12,
  },
  eventMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventMetaText: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 6,
  },
  eventFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceStarting: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '400',
  },
  eventPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  eventTickets: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  eventTicketsText: {
    fontSize: 12,
    color: colors.success,
    marginLeft: 4,
    fontWeight: '600',
  },
  eventCardActions: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.surfaceAlt,
  },
  eventCardActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  todayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  todayBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    marginHorizontal: 0,
    backgroundColor: colors.bg,
    borderRadius: 16,
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  exploreButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  exploreButtonText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  aiAssistantButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    marginHorizontal: 0,
    marginBottom: 32,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  aiAssistantIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  aiAssistantText: {
    flex: 1,
  },
  aiAssistantTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  aiAssistantSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
  customizeButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  customizeButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  // Ticket preview card
  ticketPreviewCard: {
    width: 160,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  ticketPreviewTop: {
    padding: 14,
    minHeight: 90,
    justifyContent: 'space-between',
  },
  ticketPreviewCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  ticketPreviewTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textInverse,
    marginTop: 4,
  },
  ticketPreviewBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.textInverse,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ticketPreviewDate: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  // Top Venues
  venuesContainer: {
    paddingLeft: 0,
    gap: 12,
  },
  venuesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 0,
    gap: 12,
  },
  venueGridDesktop: { height: 160 },
  venueGridCard: { height: 150 },
  venueCard: {
    width: 150,
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  venueImage: {
    width: '100%',
    height: '100%',
  },
  venuePlaceholder: {
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  venueOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: 12,
    justifyContent: 'flex-end',
  },
  venueName: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 6,
  },
  venueMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  venueMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
  },
  venueMetaText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
  },
  venueEventCount: {
    backgroundColor: 'rgba(59,130,246,0.85)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  venueEventCountText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.textInverse,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: 40,
    paddingHorizontal: 20,
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 16,
  },
  citiesScroll: {
    maxHeight: 400,
  },
  cityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cityOptionSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  cityOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cityTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  cityOptionText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  cityOptionTextSelected: {
    color: colors.primary,
  },
  cityEventCount: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  noCitiesContainer: {
    alignItems: 'center',
    padding: 32,
  },
  noCitiesText: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 12,
  },
});

export default HomeScreen;