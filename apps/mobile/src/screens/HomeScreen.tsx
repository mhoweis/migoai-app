import { colors } from '../theme';
// src/screens/HomeScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
  RefreshControl,
  Dimensions,
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
import { navigateToTab, navigationRef } from '../navigation/navigationRef';
import { categoryLabel, formatEventDate, formatPrice, useLocale } from '../i18n';
import { sourceBadge } from '../utils/trust';
import { LinearGradient } from 'expo-linear-gradient';
import Chip from '../components/Chip';
import { gradients, radius, shadow, spacing, type } from '../theme';

type WeekendDigestPreview = {
  title: string;
  sections: Array<{ events: Array<{ id: string; title: string; coverImage?: string | null; isFree: boolean }> }>;
};

const { width } = Dimensions.get('window');

interface Props {
  navigation: any;
}

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { user, userLocation, setUserLocation } = useUserStore();
  const { t, locale } = useLocale();
  const { savedEvents, savedIds, loadSavedEvents, toggleSaved } = useSavedEventsStore();
  const { upcomingTickets, loadTickets } = useWalletStore();
  const [refreshing, setRefreshing] = useState(false);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [filteredTopEvents, setFilteredTopEvents] = useState<Event[]>([]);
  const [filteredThisWeek, setFilteredThisWeek] = useState<Event[]>([]);
  const [filteredToday, setFilteredToday] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showAllVenues, setShowAllVenues] = useState(false);
  const [availableCities, setAvailableCities] = useState<Array<{ name: string; count: number }>>([]);
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [weekendDigest, setWeekendDigest] = useState<WeekendDigestPreview | null>(null);

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
    const today = new Date();
    return events.filter((event: Event) => {
      const d = new Date(event.startDate);
      return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
      );
    });
  };

  // Filter events from today to end of current week (Sunday).
  // If today IS Sunday, the range extends to next Sunday.
  const getThisWeekEvents = (events: Event[]): Event[] => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const dayOfWeek = start.getDay(); // 0 = Sun, 1 = Mon … 6 = Sat
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;

    const end = new Date(start);
    end.setDate(start.getDate() + daysUntilSunday);
    end.setHours(23, 59, 59, 999);

    return events.filter((event: Event) => {
      const d = new Date(event.startDate);
      return d >= start && d <= end;
    });
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

      // Fetch events filtered by user's location (default: Dubai)
      const response = await api.get('/events', {
        params: {
          city: userLocation || 'Dubai',
          limit: 200,
        },
      });

      if (response.data.success) {
        const fetchedEvents = response.data.data?.events || [];

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
      }
    } catch (error) {
      console.error('Error loading events:', error);
      setFilteredEvents([]);
      setFilteredTopEvents([]);
      setFilteredThisWeek([]);
      setFilteredToday([]);
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

  // Function to navigate to Events with filter
  const navigateToEventsWithFilter = (filter: string) => {
    navigateToTab('Events', 'EventsMain', { filter });
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

  // Derive top venues from allEvents (sorted by event count)
  const topVenues = React.useMemo(() => {
    interface VenueInfo { name: string; image?: string; city: string; count: number }
    const map = new Map<string, VenueInfo>();
    allEvents.forEach((event: Event) => {
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
  }, [allEvents]);

  const renderVenueCard = (item: { name: string; image?: string; city: string; count: number }, style?: object) => (
    <TouchableOpacity
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
            <Text style={styles.venueEventCountText}>{item.count} event{item.count !== 1 ? 's' : ''}</Text>
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
    const formattedDate = formatEventDate(item.startDate, { withTime: true });

    const saved = savedIds.has(item.id);

    return (
      <TouchableOpacity
        style={styles.topEventCard}
        onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
      >
        {item.coverImage ? (
          <Image source={{ uri: item.coverImage }} style={styles.topEventImage} />
        ) : (
          <View style={[styles.topEventImage, styles.placeholderImageTop]}>
            <Ionicons name="image-outline" size={48} color={colors.border} />
          </View>
        )}
        <View style={styles.topEventOverlay}>
          {/* Top row: badge + action buttons */}
          <View style={styles.topEventTopRow}>
            <View style={styles.topEventBadge}>
              <Text style={styles.topEventBadgeText}>{t('featured')}</Text>
            </View>
            {sourceBadge((item as any).trust, locale)?.kind && ['official', 'venue'].includes(sourceBadge((item as any).trust, locale)?.kind || '') && (
              <View style={styles.topTrustPill}><Ionicons name="shield-checkmark" size={11} color={colors.textInverse} /><Text style={styles.topTrustPillText}>{t('official')}</Text></View>
            )}
            <View style={styles.topEventActions}>
              <TouchableOpacity
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
                style={styles.topEventActionBtn}
                onPress={() => handleShare(item)}
              >
                <Ionicons name="share-outline" size={18} color={colors.textInverse} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.topEventContent}>
            <Text style={styles.topEventTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={styles.topEventMeta}>
              <Ionicons name="calendar-outline" size={12} color={colors.textInverse} />
              <Text style={styles.topEventMetaText}>
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
        </View>
      </TouchableOpacity>
    );
  };

  const renderEventCard = (item: Event, isToday = false) => {
    const formattedDate = formatEventDate(item.startDate);

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

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.eventCard, isToday && styles.todayEventCard]}
        onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
      >
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
            <View style={styles.trustPill}><Ionicons name="shield-checkmark" size={11} color={colors.success} /><Text style={styles.trustPillText}>{t('official')}</Text></View>
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

        {/* Save & Share buttons — right side column */}
        <View style={styles.eventCardActions}>
          <TouchableOpacity
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
            style={styles.eventCardActionBtn}
            onPress={() => handleShare(item)}
          >
            <Ionicons name="share-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
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
          style={styles.editInterestsButton}
          onPress={() => navigation.push('Interests')}
        >
          <Ionicons name="heart-outline" size={16} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <LinearGradient colors={gradients.primary} style={styles.hero}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingHero}>
              {t('home_greeting', { name: user?.name?.split(' ')[0] || t('welcome') })}
            </Text>
            <Text style={styles.subtitleHero}>
              {t('home_subtitle')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.locationDisplayHero}
            onPress={() => setShowLocationModal(true)}
          >
            <Ionicons name="location" size={20} color={colors.textInverse} />
            <Text style={styles.locationTextHero}>
              {userLocation || 'Dubai'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textInverse} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.homeSearch} onPress={navigateToEvents} accessibilityRole="button">
          <Ionicons name="search" size={20} color={colors.textMuted} />
          <Text style={styles.homeSearchText}>{t('search_events')}</Text>
        </TouchableOpacity>
        </LinearGradient>

        {/* User Interests */}
        {renderInterestPills()}

        {weekendDigest && (
          <TouchableOpacity
            style={styles.weekendCardRing}
            onPress={() => navigationRef.current?.navigate('WeekendDigest')}
          >
          <View style={styles.weekendCard}>
            <View style={styles.weekendCardHeader}>
              <View>
                <Text style={styles.weekendTitle}>{t('this_weekend')}</Text>
                <Text style={styles.weekendSubtitle}>{weekendDigest.title}</Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={28} color={colors.primary} />
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
          </View>
          </TouchableOpacity>
        )}

        {/* Top 10 Upcoming Events - Horizontal Scroll */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('top_upcoming_events')}</Text>
            <TouchableOpacity onPress={navigateToEvents}>
              <Text style={styles.seeAll}>{t('see_all')}</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            horizontal
            data={filteredTopEvents}
            renderItem={renderTopEventCard}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topEventsContainer}
          />
        </View>

        {/* This Week's Events */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('this_week_for_you')}</Text>
            <TouchableOpacity onPress={() => navigateToEventsWithFilter('this-week')}>
              <Text style={styles.seeAll}>{t('see_all')}</Text>
            </TouchableOpacity>
          </View>
          {filteredThisWeek.length > 0 ? (
            filteredThisWeek.map((event) => renderEventCard(event))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={colors.border} />
              <Text style={styles.emptyStateText}>
                {t('no_events_help')}
              </Text>
              <TouchableOpacity 
                style={styles.exploreButton}
                onPress={navigateToEvents}
              >
                <Text style={styles.exploreButtonText}>{t('explore_all_events')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Top Venues */}
        {topVenues.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('top_venues')}</Text>
              <TouchableOpacity onPress={() => setShowAllVenues((v) => !v)}>
                <Text style={styles.seeAll}>
                  {showAllVenues ? t('show_less') : `${t('see_all')} (${topVenues.length})`}
                </Text>
              </TouchableOpacity>
            </View>
            {showAllVenues ? (
              <View style={styles.venuesGrid}>
                {topVenues.map((item) => (
                  <React.Fragment key={item.name}>
                    {renderVenueCard(item, styles.venueGridCard)}
                  </React.Fragment>
                ))}
              </View>
            ) : (
              <FlatList
                horizontal
                data={topVenues.slice(0, 15)}
                keyExtractor={(item) => item.name}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.venuesContainer}
                renderItem={({ item }) => renderVenueCard(item)}
              />
            )}
          </View>
        )}

        {/* Today's Events */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('todays_picks')}</Text>
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
              <Text style={styles.emptyStateText}>
                {t('no_events_help')}
              </Text>
              <Text style={styles.emptyStateSubtext}>
                {t('explore_all_events')}
              </Text>
            </View>
          )}
        </View>

        {/* Your Tickets section — only shown if user has upcoming tickets */}
        {upcomingTickets().length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('your_tickets')}</Text>
              <TouchableOpacity onPress={() => navigateToTab('Wallet')}>
                <Text style={styles.seeAll}>{t('view_wallet')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {upcomingTickets().slice(0, 5).map((ticket) => (
                <TouchableOpacity
                  key={ticket.id}
                  style={styles.ticketPreviewCard}
                  onPress={() => navigateToTab('Wallet')}
                >
                  <View style={[styles.ticketPreviewTop, { backgroundColor: ticket.category === 'Music' ? colors.primaryDark : ticket.category === 'Sports' ? colors.success : colors.primary }]}>
                    <Text style={styles.ticketPreviewCategory}>{categoryLabel(ticket.category)}</Text>
                    <Text style={styles.ticketPreviewTitle} numberOfLines={2}>{ticket.eventTitle}</Text>
                  </View>
                  <View style={styles.ticketPreviewBottom}>
                    <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                    <Text style={styles.ticketPreviewDate}>
                      {formatEventDate(ticket.eventDate)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Your Saved Events section */}
        {savedEvents.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('your_saved_events')}</Text>
              <TouchableOpacity onPress={() => navigateToTab('Events')}>
                <Text style={styles.seeAll}>{t('see_all')}</Text>
              </TouchableOpacity>
            </View>
            {savedEvents.slice(0, 4).map((event) => renderEventCard(event))}
          </View>
        )}

        {/* AI Assistant Button */}
        <TouchableOpacity
          style={styles.aiAssistantButton}
          onPress={() => navigateToTab('Chat')}
        >
          <View style={styles.aiAssistantIcon}>
            <Ionicons name="sparkles" size={24} color={colors.textInverse} />
          </View>
          <View style={styles.aiAssistantText}>
            <Text style={styles.aiAssistantTitle}>{t('need_help')}</Text>
            <Text style={styles.aiAssistantSubtitle}>{t('chat_with_ai')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.primary} />
        </TouchableOpacity>
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
  hero: { paddingTop: 8, paddingBottom: 28, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  greetingHero: { ...type.h1, color: colors.textInverse },
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
  locationDisplayHero: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  locationTextHero: { fontSize: 14, fontWeight: '600', color: colors.textInverse, marginLeft: 4 },
  homeSearch: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: 20, marginBottom: -48, paddingHorizontal: 16, height: 52, borderRadius: radius.pill, backgroundColor: colors.surface, ...shadow.card },
  homeSearchText: { ...type.body, color: colors.textMuted },
  locationText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryDark,
    marginLeft: 4,
  },
  interestsScroll: {
    paddingLeft: 20,
    marginTop: 60,
    marginBottom: 20,
  },
  interestsContainer: {
    paddingRight: 20,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  section: {
    marginBottom: 32,
  },
  weekendCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 16,
    borderRadius: radius.lg - 1,
    backgroundColor: colors.surface,
  },
  weekendCardRing: { marginHorizontal: 20, marginBottom: 24, padding: 1, borderRadius: radius.lg, backgroundColor: colors.primary, ...shadow.card },
  weekendCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weekendTitle: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
  weekendSubtitle: { marginTop: 4, color: colors.primaryDark },
  weekendCount: { marginTop: 10, color: colors.textSecondary, fontWeight: '600' },
  weekendPosters: { flexDirection: 'row', gap: 8, marginTop: 12 },
  weekendPoster: { width: 72, height: 72, borderRadius: 10 },
  weekendPosterPlaceholder: { backgroundColor: colors.primarySoft, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  seeAll: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  topEventsContainer: {
    paddingLeft: 20,
    gap: 16,
  },
  topEventCard: {
    width: width * 0.75,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 16,
    justifyContent: 'space-between',
  },
  topEventBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  topEventBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: 'bold',
  },
  topEventTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topEventActions: {
    flexDirection: 'row',
    gap: 8,
  },
  topEventActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
  eventCard: {
    flexDirection: 'row',
    backgroundColor: colors.textInverse,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
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
  topTrustPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(22,101,52,0.85)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  topTrustPillText: { color: colors.textInverse, fontSize: 10, fontWeight: '700' },
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
    marginHorizontal: 20,
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
    marginHorizontal: 20,
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
    paddingLeft: 20,
    gap: 12,
  },
  venuesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
  },
  venueGridCard: {
    width: '47%',
    flexGrow: 1,
    maxWidth: 220,
  },
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
    ...StyleSheet.absoluteFillObject,
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