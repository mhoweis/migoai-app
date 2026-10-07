import { colors } from '../theme';
// migo-mobile/src/screens/EventsScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import DateRangePickerModal from '../components/DateRangePickerModal';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { consumePendingEventsFilter } from '../navigation/pendingEventsFilter';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { Event } from '@migo/shared';
import { useUserStore } from '../store/userStore';
import { useSavedEventsStore } from '../store/savedEventsStore';
import { categoryLabel, formatEventDate, useLocale } from '../i18n';
import { radius, shadow, spacing, type } from '../theme';
import Chip from '../components/Chip';
import { EventListSkeleton } from '../components/Skeleton';
import { trackSearch } from '../services/signals.service';
import { fetchAllEvents } from '../utils/fetchAllEvents';
import { matchesEventDateRange } from '../utils/eventDateRange';
import EventCard from '../components/EventCard';
import Container from '../components/Container';
import { useBreakpoint } from '../hooks/useBreakpoint';

// Event categories for filtering
const EVENT_CATEGORIES = [
  'All',
  'Music',
  'Sports',
  'Tech',
  'Art',
  'Food',
  'Business',
  'Networking',
  'Education',
  'Health',
  'Other'
];

const EventsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { userLocation } = useUserStore();
  const { t } = useLocale();
  const { width, isWebDesktop } = useBreakpoint();
  const columnCount = width < 600 ? 1 : width < 1024 ? 2 : width < 1400 ? 3 : 4;
  const { savedIds, toggleSaved, loadSavedEvents } = useSavedEventsStore();
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedCity, setSelectedCity] = useState<string>('All Cities');
  // Track whether we've already seeded selectedCity from the user's home-screen location
  const cityInitialized = useRef(false);
  const [sortBy, setSortBy] = useState<'date' | 'price'>('date');
  const [availableCities, setAvailableCities] = useState<Array<{ name: string; count: number }>>([]);
  const [availableVenues, setAvailableVenues] = useState<Array<{ name: string; count: number }>>([]);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const listOffsetRef = useRef(0);
  const filtersOpenedAtOffsetRef = useRef(0);
  const filtersVisibleRef = useRef(false);

  useEffect(() => {
    filtersVisibleRef.current = filtersVisible;
    if (filtersVisible) filtersOpenedAtOffsetRef.current = listOffsetRef.current;
  }, [filtersVisible]);

  const closeFiltersOnScroll = (offsetY: number) => {
    listOffsetRef.current = offsetY;
    if (filtersVisibleRef.current && Math.abs(offsetY - filtersOpenedAtOffsetRef.current) > 12) {
      setFiltersVisible(false);
    }
  };
  // Dynamic filter options based on current selection
  const [dynamicCities, setDynamicCities] = useState<Array<{ name: string; count: number }>>([]);
  const [dynamicVenues, setDynamicVenues] = useState<Array<{ name: string; count: number }>>([]);
  const [dynamicCategories, setDynamicCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [dynamicSources, setDynamicSources] = useState<Array<{ id: string; label: string; count: number }>>([]);
  // venueFilter: set when navigating from Home's Top Venues section
  const [venueFilter, setVenueFilter] = useState<string>(route.params?.venueFilter || '');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  // dateFilter: set when navigating from AI Chat or via quick presets
  const [dateFrom, setDateFrom] = useState<string>(route.params?.dateFrom || '');
  const [dateTo, setDateTo] = useState<string>(route.params?.dateTo || '');
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const handleShare = async (item: Event) => {
    try {
      await Share.share({
        message: `Check out "${item.title}" on Migo!\n${item.venueName || item.city || ''} — ${formatEventDate(item.startDate)}`,
      });
    } catch {}
  };

  // Helper function to normalize venue names for comparison
  const normalizeVenueName = (venueName: string | null | undefined): string => {
    if (!venueName) return '';
    return venueName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' '); // Replace multiple spaces with single space
  };

  const getEventSource = (event: Event): { id?: string; label?: string } => {
    const eventAny = event as any;
    return eventAny.source || eventAny.trust?.source || {
      id: eventAny.externalSource,
      label: eventAny.externalSource,
    };
  };

  const matchesSearch = (event: Event, query: string): boolean => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    const eventAny = event as any;
    const tags = Array.isArray(eventAny.tags) ? eventAny.tags : [];
    return [
      event.title,
      event.description,
      event.venueName,
      event.city,
      getEventSource(event).label,
      eventAny.trust?.source?.labelAr,
      ...tags,
    ].some(value => typeof value === 'string' && value.toLowerCase().includes(normalizedQuery));
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    trackSearch(searchQuery);
  }, [searchQuery]);

  // Load available cities, venues, and saved events once on mount
  useEffect(() => {
    loadAvailableCities();
    loadAvailableVenues();
    loadSavedEvents();
  }, []);

  const loadAvailableCities = async () => {
    try {
      console.log('Fetching available cities for EventsScreen...');
      const response = await api.get('/events/filters/quick');
      console.log('Cities API response:', response.data);

      if (response.data.success && response.data.data?.cities) {
        // Add "All Cities" option at the beginning
        const cities = [{ name: 'All Cities', count: 0 }, ...response.data.data.cities];
        console.log('Setting cities:', cities);
        setAvailableCities(cities);
      } else {
        console.log('No cities in response, using fallback');
        // Fallback to default UAE cities if API returns no cities
        setAvailableCities([
          { name: 'All Cities', count: 0 },
          { name: 'Dubai', count: 0 },
          { name: 'Abu Dhabi', count: 0 },
          { name: 'Sharjah', count: 0 },
          { name: 'Ajman', count: 0 },
          { name: 'Ras Al Khaimah', count: 0 },
          { name: 'Fujairah', count: 0 },
          { name: 'Umm Al Quwain', count: 0 },
        ]);
      }
    } catch (error) {
      console.error('Error loading available cities:', error);
      // Fallback to default UAE cities if API fails
      setAvailableCities([
        { name: 'All Cities', count: 0 },
        { name: 'Dubai', count: 0 },
        { name: 'Abu Dhabi', count: 0 },
        { name: 'Sharjah', count: 0 },
        { name: 'Ajman', count: 0 },
        { name: 'Ras Al Khaimah', count: 0 },
        { name: 'Fujairah', count: 0 },
        { name: 'Umm Al Quwain', count: 0 },
      ]);
    }
  };

  const loadAvailableVenues = async () => {
    try {
      console.log('Fetching available venues for EventsScreen...');
      const response = await api.get('/events/filters/quick');
      console.log('Venues API response:', response.data);

      if (response.data.success && response.data.data?.venues) {
        // Add "All Venues" option at the beginning
        const venues = [{ name: 'All Venues', count: 0 }, ...response.data.data.venues];
        console.log('Setting venues:', venues);
        setAvailableVenues(venues);
      } else {
        console.log('No venues in response');
        setAvailableVenues([{ name: 'All Venues', count: 0 }]);
      }
    } catch (error) {
      console.error('Error loading available venues:', error);
      setAvailableVenues([{ name: 'All Venues', count: 0 }]);
    }
  };

  // Sync venueFilter from route params whenever navigation passes new params
  useEffect(() => {
    if (route.params?.venueFilter !== undefined) {
      setVenueFilter(route.params.venueFilter);
      // Show filters when navigating with venue filter
      if (route.params.venueFilter) {
        setFiltersVisible(true);
      }
    }
  }, [route.params?.venueFilter]);

  // Sync dateFrom/dateTo from route params (e.g. navigated from Chat's "View All")
  useEffect(() => {
    if (route.params?.dateFrom !== undefined) {
      setDateFrom(route.params.dateFrom);
    }
    if (route.params?.dateTo !== undefined) {
      setDateTo(route.params.dateTo);
    }
  }, [route.params?.dateFrom, route.params?.dateTo]);

  // Consume pending date filter set by ChatScreen's "View All" button.
  // useFocusEffect runs every time this screen comes into focus.
  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingEventsFilter();
      if (pending) {
        setDateFrom(pending.dateFrom);
        setDateTo(pending.dateTo);
      }
    }, [])
  );

  // Seed selectedCity from the user's home-screen location (runs once when userLocation loads)
  useEffect(() => {
    if (userLocation && !cityInitialized.current) {
      setSelectedCity(userLocation);
      cityInitialized.current = true;
    }
  }, [userLocation]);

  // Apply filters when any filter changes
  useEffect(() => {
    applyFilters();
  }, [events, searchQuery, selectedCity, selectedCategory, sortBy, venueFilter, sourceFilter, dateFrom, dateTo]);

  // Update dynamic filter options based on current filters
  useEffect(() => {
    updateDynamicFilters();
  }, [events, dateFrom, dateTo, selectedCity, selectedCategory, venueFilter, sourceFilter, searchQuery]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const allEvents = await fetchAllEvents({ limit: 200 });

      // Keep events that have not finished yet: ongoing events until their end
      // time, and events without an end time for the whole of their start day.
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const currentEvents = allEvents.filter((event: any) => {
        if (event.endDate) return new Date(event.endDate) >= now;
        return new Date(event.startDate) >= todayStart;
      });
      setEvents(currentEvents);
    } catch (error) {
      console.error('Failed to fetch events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchEvents();
    setRefreshing(false);
  };

  const updateDynamicFilters = () => {
    if (!Array.isArray(events)) return;

    let filtered = [...events];

    // Apply date range filter
    if (dateFrom || dateTo) {
      filtered = filtered.filter(event => matchesEventDateRange(event, dateFrom, dateTo));
    }

    // Apply search filter
    const query = searchQuery.trim();
    if (query) {
      filtered = filtered.filter(event => matchesSearch(event, query));
    }

    const cityOptions = filtered.filter(event => {
      if (venueFilter.trim() && normalizeVenueName(event.venueName) !== normalizeVenueName(venueFilter)) {
        return false;
      }
      if (selectedCategory !== 'All' && event.category !== selectedCategory) {
        return false;
      }
      if (sourceFilter && getEventSource(event).id !== sourceFilter) {
        return false;
      }
      return true;
    });

    // Apply city filter (for calculating dynamic venues and categories)
    if (!query && selectedCity && selectedCity !== 'All Cities') {
      filtered = filtered.filter(event => event.city === selectedCity);
    }

    // Apply venue filter (for calculating dynamic cities and categories)
    if (venueFilter.trim()) {
      const normalizedVenueFilter = normalizeVenueName(venueFilter);
      filtered = filtered.filter(event =>
        normalizeVenueName(event.venueName) === normalizedVenueFilter
      );
    }

    // Apply category filter (for calculating dynamic cities and venues)
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(event => event.category === selectedCategory);
    }

    if (sourceFilter) {
      filtered = filtered.filter(event => getEventSource(event).id === sourceFilter);
    }

    // Calculate available cities from filtered events (excluding the currently selected city)
    const cityMap = new Map<string, number>();
    cityOptions.forEach(event => {
      if (event.city && event.city !== selectedCity) {
        cityMap.set(event.city, (cityMap.get(event.city) || 0) + 1);
      }
    });
    const cities = Array.from(cityMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    setDynamicCities(cities);

    // Calculate available venues from filtered events (excluding the currently selected venue)
    const venueMap = new Map<string, number>();
    const normalizedCurrentVenue = normalizeVenueName(venueFilter);
    filtered.forEach(event => {
      if (event.venueName && normalizeVenueName(event.venueName) !== normalizedCurrentVenue) {
        venueMap.set(event.venueName, (venueMap.get(event.venueName) || 0) + 1);
      }
    });
    const venues = Array.from(venueMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    setDynamicVenues(venues);

    // Calculate available categories from filtered events (excluding the currently selected category)
    const categoryMap = new Map<string, number>();
    filtered.forEach(event => {
      if (event.category && event.category !== selectedCategory) {
        categoryMap.set(event.category, (categoryMap.get(event.category) || 0) + 1);
      }
    });
    const categories = Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    setDynamicCategories(categories);

    const sourceMap = new Map<string, { label: string; count: number }>();
    filtered.forEach(event => {
      const source = getEventSource(event);
      if (source.id && source.label) {
        const current = sourceMap.get(source.id);
        sourceMap.set(source.id, {
          label: source.label,
          count: (current?.count || 0) + 1,
        });
      }
    });
    setDynamicSources(
      Array.from(sourceMap.entries())
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => b.count - a.count)
    );
  };

  const applyFilters = () => {
    // Ensure events is an array before spreading
    if (!Array.isArray(events)) {
      console.error('Events is not an array:', events);
      setFilteredEvents([]);
      return;
    }

    let filtered = [...events];

    const query = searchQuery.trim();
    if (query) {
      filtered = filtered.filter(event => matchesSearch(event, query));
    }

    if (!query && selectedCity && selectedCity !== 'All Cities') {
      filtered = filtered.filter(event => event.city === selectedCity);
    }

    // Apply venue filter (set when navigating from Top Venues on HomeScreen)
    if (venueFilter.trim()) {
      const normalizedVenueFilter = normalizeVenueName(venueFilter);
      filtered = filtered.filter(event => {
        return normalizeVenueName(event.venueName) === normalizedVenueFilter;
      });

      // Debug logging
      console.log('Venue filter active:', venueFilter);
      console.log('Normalized venue filter:', normalizedVenueFilter);
      console.log('Events after venue filter:', filtered.length);
      if (filtered.length === 0) {
        console.log('Available venues in events:', events.map(e => e.venueName).filter(Boolean));
      }
    }

    // Apply date range filter
    if (dateFrom || dateTo) {
      filtered = filtered.filter(event => matchesEventDateRange(event, dateFrom, dateTo));
    }

    // Apply category filter
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(event =>
        event.category === selectedCategory
      );
    }

    if (sourceFilter) {
      filtered = filtered.filter(event => getEventSource(event).id === sourceFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      } else {
        return (a.priceFrom || 0) - (b.priceFrom || 0);
      }
    });

    setFilteredEvents(filtered);
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
    return 'calendar';
  };

  // ---- Date preset helpers ----
  const applyDatePreset = (preset: 'today' | 'tomorrow' | 'weekend' | 'clear') => {
    if (preset === 'clear') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const today = new Date();
    if (preset === 'today') {
      const start = new Date(today); start.setHours(0, 0, 0, 0);
      const end = new Date(today); end.setHours(23, 59, 59, 999);
      setDateFrom(start.toISOString());
      setDateTo(end.toISOString());
    } else if (preset === 'tomorrow') {
      const tom = new Date(today); tom.setDate(today.getDate() + 1);
      const start = new Date(tom); start.setHours(0, 0, 0, 0);
      const end = new Date(tom); end.setHours(23, 59, 59, 999);
      setDateFrom(start.toISOString());
      setDateTo(end.toISOString());
    } else if (preset === 'weekend') {
      const day = today.getDay(); // 0=Sun,5=Fri,6=Sat
      let daysToFri: number;
      if (day === 5) daysToFri = 0;
      else if (day === 6) daysToFri = -1;
      else if (day === 0) daysToFri = -2;
      else daysToFri = 5 - day;
      const fri = new Date(today); fri.setDate(today.getDate() + daysToFri); fri.setHours(0, 0, 0, 0);
      const sun = new Date(fri); sun.setDate(fri.getDate() + 2); sun.setHours(23, 59, 59, 999);
      setDateFrom(fri.toISOString());
      setDateTo(sun.toISOString());
    }
  };

  const isPresetActive = (preset: 'today' | 'tomorrow' | 'weekend'): boolean => {
    if (!dateFrom) return false;
    const from = new Date(dateFrom);
    const to = dateTo ? new Date(dateTo) : null;
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    if (preset === 'today') {
      return from.toDateString() === today.toDateString() &&
        (!to || to.toDateString() === today.toDateString());
    }
    if (preset === 'tomorrow') {
      return from.toDateString() === tomorrow.toDateString() &&
        (!to || to.toDateString() === tomorrow.toDateString());
    }
    if (preset === 'weekend') {
      // Active when dateFrom is a Friday
      return from.getDay() === 5;
    }
    return false;
  };

  const getActiveDateLabel = (): string => {
    if (!dateFrom && !dateTo) return '';
    const fmt = (d: string) => formatEventDate(d);
    if (dateFrom && dateTo) return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
    if (dateFrom) return `From ${fmt(dateFrom)}`;
    return `Until ${fmt(dateTo)}`;
  };

  const renderEventItem = ({ item }: { item: Event }) => (
    <View style={styles.eventCell}>
      <EventCard
        event={item}
        onPress={() => (navigation as any).navigate('EventDetail', { eventId: item.id })}
        onSave={() => toggleSaved(item)}
        onShare={() => void handleShare(item)}
        saved={savedIds.has(item.id)}
      />
    </View>
  );

  const renderCityFilter = () => {
    // Get count for each city from dynamic filters
    const getCityCount = (cityName: string) => {
      if (cityName === 'All Cities') return 0;
      const city = dynamicCities.find(c => c.name === cityName);
      return city?.count ?? availableCities.find(c => c.name === cityName)?.count ?? 0;
    };

    return (
      <View style={styles.cityFilterContainer}>
        <FlatList
          horizontal
          data={availableCities}
          keyExtractor={(item) => item.name}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cityChipsContainer}
          renderItem={({ item }) => {
            const count = getCityCount(item.name);
            const isDisabled = count === 0 && item.name !== 'All Cities' && item.name !== selectedCity;

            return (
              <Chip
                label={`${item.name}${count > 0 ? ` (${count})` : ''}`}
                selected={selectedCity === item.name}
                disabled={isDisabled}
                onPress={() => !isDisabled && setSelectedCity(item.name)}
              />
            );
          }}
        />
      </View>
    );
  };

  const renderVenueFilter = () => {
    // Get count for each venue from dynamic filters
    const getVenueCount = (venueName: string) => {
      if (venueName === 'All Venues') return 0;
      const venue = dynamicVenues.find(v => v.name === venueName);
      return venue ? venue.count : 0;
    };

    return (
      <View style={styles.venueFilterContainer}>
        <FlatList
          horizontal
          data={availableVenues}
          keyExtractor={(item) => item.name}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.venueChipsContainer}
          renderItem={({ item }) => {
            const count = getVenueCount(item.name);
            const isSelected = venueFilter === item.name || (item.name === 'All Venues' && !venueFilter);
            const isDisabled = count === 0 && item.name !== 'All Venues' && item.name !== venueFilter;

            return (
              <Chip
                label={`${item.name}${count > 0 ? ` (${count})` : ''}`}
                selected={isSelected}
                disabled={isDisabled}
                onPress={() => !isDisabled && setVenueFilter(item.name === 'All Venues' ? '' : item.name)}
              />
            );
          }}
        />
      </View>
    );
  };

  const renderCategoryFilter = () => {
    // Get count for each category from dynamic filters
    const getCategoryCount = (categoryName: string) => {
      if (categoryName === 'All') return 0;
      const category = dynamicCategories.find(c => c.name === categoryName);
      return category ? category.count : 0;
    };

    return (
      <FlatList
        horizontal
        data={EVENT_CATEGORIES}
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        style={styles.categoryFilterList}
        contentContainerStyle={styles.categoriesContainer}
        renderItem={({ item }) => {
          const count = getCategoryCount(item);
          const isSelected = selectedCategory === item;
          const isDisabled = count === 0 && item !== 'All' && item !== selectedCategory;

          return (
            <Chip
              label={`${categoryLabel(item)}${count > 0 ? ` (${count})` : ''}`}
              selected={isSelected}
              disabled={isDisabled}
              onPress={() => !isDisabled && setSelectedCategory(item)}
            />
          );
        }}
      />
    );
  };

  const renderSourceFilter = () => (
    <View style={styles.sourceFilterContainer}>
      <Text style={styles.filterLabel}>{t('source')}</Text>
      <FlatList
        horizontal
        data={dynamicSources}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sourceChipsContainer}
        renderItem={({ item }) => (
          <Chip
            label={`${item.label}${item.count > 0 ? ` (${item.count})` : ''}`}
            selected={sourceFilter === item.id}
            onPress={() => setSourceFilter(sourceFilter === item.id ? '' : item.id)}
          />
        )}
      />
    </View>
  );

  const renderDateFilter = () => {
    const isCustomActive = !!(dateFrom || dateTo) &&
      !isPresetActive('today') && !isPresetActive('tomorrow') && !isPresetActive('weekend');

    const dateOptions = [
      { key: 'today', label: t('today'), preset: 'today' as const },
      { key: 'tomorrow', label: t('tomorrow'), preset: 'tomorrow' as const },
      { key: 'weekend', label: t('this_weekend'), preset: 'weekend' as const },
      { key: 'custom', label: t('custom'), preset: null },
    ];

    return (
      <View style={styles.dateFilterContainer}>
        <FlatList
          horizontal
          data={dateOptions}
          keyExtractor={(item) => item.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateChipsContainer}
          renderItem={({ item }) => {
            const active = item.preset ? isPresetActive(item.preset) : isCustomActive;
            return (
              <Chip
                label={item.label}
                selected={active}
                onPress={() => item.preset ? applyDatePreset(active ? 'clear' : item.preset) : setDatePickerVisible(true)}
              />
            );
          }}
        />
        {!!(dateFrom || dateTo) && (
          <TouchableOpacity style={styles.dateChipClear} onPress={() => applyDatePreset('clear')}>
            <Ionicons name="close-circle" size={15} color={colors.danger} />
            <Text style={styles.dateChipClearText}>{t('clear')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderSortOptions = () => (
    <View style={styles.sortContainer}>
      <Text style={styles.sortLabel}>{t('sort_by')}</Text>
      <TouchableOpacity
        style={[
          styles.sortButton,
          sortBy === 'date' && styles.sortButtonActive
        ]}
        onPress={() => setSortBy('date')}
      >
        <Text
          style={[
            styles.sortButtonText,
            sortBy === 'date' && styles.sortButtonTextActive
          ]}
        >
          {t('sort_date')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.sortButton,
          sortBy === 'price' && styles.sortButtonActive
        ]}
        onPress={() => setSortBy('price')}
      >
        <Text
          style={[
            styles.sortButtonText,
            sortBy === 'price' && styles.sortButtonTextActive
          ]}
        >
          {t('sort_price')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <EventListSkeleton count={5} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Container style={styles.screenContent}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('discover')}</Text>
      </View>

      {/* Venue filter banner — shown when navigated from Top Venues */}
      {!!venueFilter && (
        <View style={styles.venueBanner}>
          <Ionicons name="location" size={16} color={colors.primaryDark} />
          <Text style={styles.venueBannerText} numberOfLines={1}>
            {t('showing_events_at', { venue: venueFilter })}
          </Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('clear')} onPress={() => setVenueFilter('')}>
            <Ionicons name="close-circle" size={18} color={colors.primaryDark} />
          </TouchableOpacity>
        </View>
      )}

      {/* Date filter banner — shown when a date/range filter is active */}
      {!!(dateFrom || dateTo) && (
        <View style={styles.dateBanner}>
          <Ionicons name="calendar" size={16} color={colors.primary} />
          <Text style={styles.dateBannerText} numberOfLines={1}>
            {t('events_range', { range: getActiveDateLabel() })}
          </Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('clear')} onPress={() => { setDateFrom(''); setDateTo(''); }}>
            <Ionicons name="close-circle" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            accessibilityLabel={t('search_events')}
            placeholder={t('search_events')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            textContentType="none"
            editable={true}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('clear')} onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={filtersVisible ? t('hide_filters') : t('show_filters')} accessibilityState={{ expanded: filtersVisible }} style={styles.filterButton} onPress={() => setFiltersVisible(!filtersVisible)}>
          <Ionicons name={filtersVisible ? 'options' : 'options-outline'} size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Sort Options - Outside filters */}
      {renderSortOptions()}

      {/* Filters Section - Toggle visibility */}
      {filtersVisible && (
        <View style={styles.filtersSection}>
          {/* Date Quick-Filter */}
          {renderDateFilter()}

          {/* City Filter */}
          {renderCityFilter()}

          {/* Venue Filter */}
          {renderVenueFilter()}

          {/* Source Filter */}
          {renderSourceFilter()}

          {/* Category Filters */}
          {renderCategoryFilter()}
        </View>
      )}

      {/* Events List */}
      <FlatList
        key={`events-${columnCount}`}
        data={filteredEvents}
        renderItem={renderEventItem}
        keyExtractor={(item) => item.id}
        numColumns={columnCount}
        columnWrapperStyle={columnCount > 1 ? styles.eventRow : undefined}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.eventsList}
        style={styles.list}
        onScroll={(e) => closeFiltersOnScroll(e.nativeEvent.contentOffset.y)}
        onScrollBeginDrag={() => filtersVisibleRef.current && setFiltersVisible(false)}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color={colors.border} />
            <Text style={styles.emptyTitle}>{t('no_events_found')}</Text>
            <Text style={styles.emptyText}>
              {(dateFrom || dateTo)
                ? t('no_events_help')
                : searchQuery
                ? t('no_events_help')
                : t('no_events_help')}
            </Text>
            {venueFilter || sourceFilter || selectedCategory !== 'All' || dateFrom || dateTo || searchQuery ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('clear_filters')} style={styles.clearFilters} onPress={() => {
                setVenueFilter('');
                setSourceFilter('');
                setSelectedCategory('All');
                setDateFrom('');
                setDateTo('');
                setSearchQuery('');
              }}>
                <Text style={styles.clearFiltersText}>{t('clear_filters')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />
      </Container>

      {/* Custom date range calendar picker */}
      <DateRangePickerModal
        visible={datePickerVisible}
        initialFrom={dateFrom}
        initialTo={dateTo}
        onApply={(from, to) => {
          setDateFrom(from);
          setDateTo(to);
          setDatePickerVisible(false);
        }}
        onClose={() => setDatePickerVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenContent: { flex: 1 },
  list: { flex: 1 },
  eventRow: { gap: 16, paddingHorizontal: 0 },
  eventCell: { flex: 1, minWidth: 0, marginBottom: 16 },
  clearFilters: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  clearFiltersText: { color: colors.primaryDark, fontWeight: '700' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textMuted,
  },
  venueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 0,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  venueBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.primaryDark,
  },
  venueBannerName: {
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingTop: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    ...type.h1,
  },
  filterButton: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.card,
  },
  filtersSection: {
    backgroundColor: colors.surface,
    marginHorizontal: 0,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 0,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.textInverse,
    flex: 1,
    marginBottom: 0,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
  },
  cityFilterContainer: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 0,
  },
  cityFilterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cityFilterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 6,
  },
  cityChipsContainer: {
    paddingVertical: 4,
  },
  cityChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    marginRight: 8,
  },
  cityChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cityChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  cityChipTextSelected: {
    color: colors.textInverse,
  },
  cityChipCount: {
    fontSize: 12,
    fontWeight: '400',
    opacity: 0.8,
  },
  cityChipDisabled: {
    opacity: 0.4,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  cityChipTextDisabled: {
    color: colors.textMuted,
  },
  venueFilterContainer: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    paddingTop: 0,
  },
  venueChipsContainer: {
    paddingVertical: 4,
  },
  sourceFilterContainer: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  sourceChipsContainer: {
    paddingVertical: 4,
  },
  filterLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  venueChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.warningSoft,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.warning,
    marginRight: 8,
  },
  venueChipSelected: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  venueChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.warning,
  },
  venueChipTextSelected: {
    color: colors.textInverse,
  },
  venueChipCount: {
    fontSize: 12,
    fontWeight: '400',
    opacity: 0.8,
  },
  venueChipDisabled: {
    opacity: 0.4,
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningSoft,
  },
  venueChipTextDisabled: {
    color: colors.warning,
  },
  categoryFilterList: {
    marginBottom: 4,
  },
  categoriesContainer: {
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.textInverse,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    height: 44,
    gap: 5,
  },
  categoryChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  categoryChipTextSelected: {
    color: colors.textInverse,
  },
  categoryChipDisabled: {
    opacity: 0.4,
    backgroundColor: colors.bg,
    borderColor: colors.border,
  },
  categoryChipTextDisabled: {
    color: colors.textMuted,
  },
  categoryChipCount: {
    fontSize: 11,
    fontWeight: '400',
    opacity: 0.8,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingBottom: 12,
  },
  sortLabel: {
    fontSize: 14,
    color: colors.textMuted,
    marginRight: 12,
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.textInverse,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  sortButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sortButtonTextActive: {
    color: colors.textInverse,
  },
  eventsList: {
    paddingHorizontal: 0,
    paddingBottom: 20,
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: 16,
    ...shadow.card,
    overflow: 'hidden',
  },
  eventCardImageContainer: {
    position: 'relative',
  },
  eventCardImage: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
  },
  imageOverlayButtons: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    gap: 8,
  },
  imageActionBtn: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    padding: 7,
  },
  placeholderImageList: {
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventCardContent: {
    flex: 1,
    padding: spacing.md,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 100,
    gap: 4,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  onlineBadge: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  onlineText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
  },
  trustPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.successSoft, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 10 },
  trustPillText: { color: colors.success, fontSize: 11, fontWeight: '700' },
  eventTitle: {
    ...type.h3,
    marginBottom: 8,
  },
  eventDescription: {
    ...type.caption,
    marginBottom: 16,
    lineHeight: 20,
  },
  eventDetails: {
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: colors.textMuted,
    marginLeft: 8,
  },
  eventFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceContainerList: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceStartingList: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '400',
  },
  eventPrice: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  rsvpButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  rsvpButtonText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingTop: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  // Date filter banner
  dateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 0,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  dateBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.primary,
  },
  dateBannerRange: {
    fontWeight: '700',
  },
  // Date quick-filter row
  dateFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  dateChipsContainer: {
    paddingVertical: 4,
    gap: 8,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.textInverse,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dateChipTextActive: {
    color: colors.textInverse,
  },
  dateChipClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  dateChipClearText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
  },
});

export default EventsScreen;