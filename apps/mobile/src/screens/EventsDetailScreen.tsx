import { colors } from '../theme';
// src/screens/EventDetailScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Share,
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import EventMap from '../components/EventMap';
import { api } from '../services/api';
import { Event } from '@migo/shared';
import { useUserStore } from '../store/userStore';
import { useSavedEventsStore } from '../store/savedEventsStore';
import { getBookingUrl, supplierLabel } from '../config/affiliates';
import { ticketsService } from '../services/tickets.service';
import { navigateToTab } from '../navigation/navigationRef';
import { socialService, EventSocial, InviteLinks } from '../services/social.service';
import { inviteRef } from '../utils/inviteRef';
import { categoryLabel, formatEventDate, formatPrice, useLocale } from '../i18n';
import { sourceBadge } from '../utils/trust';
import { LinearGradient } from 'expo-linear-gradient';
import GradientButton from '../components/GradientButton';
import { gradients, radius, shadow, spacing, type } from '../theme';
import { DetailSkeleton } from '../components/Skeleton';
import { trackSignal } from '../services/signals.service';

interface Props {
  route: any;
  navigation: any;
}

const EventDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { eventId } = route.params;
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ticketCount, setTicketCount] = useState(1);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [social, setSocial] = useState<EventSocial | null>(null);
  const [inviteLinks, setInviteLinks] = useState<InviteLinks | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const { user } = useUserStore();
  const { t, locale } = useLocale();
  const { savedIds, toggleSaved, loadSavedEvents } = useSavedEventsStore();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    fetchEvent();
    void socialService.social(eventId).then(setSocial).catch(() => setSocial(null));
    loadSavedEvents();
  }, [eventId]);

  const fetchEvent = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/events/${eventId}`);

      if (response.data.success) {
        setEvent(response.data.data);
        void trackSignal('view', { eventId });
      } else {
        setError(t('no_events_found'));
      }
    } catch (err) {
      console.error('Error fetching event:', err);
      setError(t('please_try_again'));
    } finally {
      setLoading(false);
    }
  };

  const handleBookmark = () => {
    if (event) toggleSaved(event);
  };

  const handleShare = async () => {
    if (!event) return;
    setShareOpen(true);
  };

  const ensureInvite = async () => {
    if (inviteLinks) return inviteLinks;
    const returnUrl = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : undefined;
    const links = await socialService.invite(event!.id, returnUrl);
    setInviteLinks(links);
    return links;
  };

  const shareWhatsApp = async () => {
    try {
      const links = await ensureInvite();
      await Linking.openURL(links.whatsappUrl);
      setShareOpen(false);
    } catch {
      Alert.alert(t('unable_to_share'), t('please_try_again'));
    }
  };

  const copyShareLink = async () => {
    try {
      const links = await ensureInvite();
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(links.shareUrl);
        Alert.alert(t('link_copied'), t('link_ready'));
      } else {
        Alert.alert(t('copy_link'), links.shareUrl);
      }
      setShareOpen(false);
    } catch {
      Alert.alert(t('unable_to_share'), t('please_try_again'));
    }
  };

  const shareMore = async () => {
    try {
      const links = await ensureInvite();
      await Share.share({ message: `${event!.title} — Join me on Migo: ${links.shareUrl}`, url: links.shareUrl });
      setShareOpen(false);
    } catch {
      Alert.alert(t('unable_to_share'), t('please_try_again'));
    }
  };

  const handleBookTicket = () => {
    if (!event) return;
    // Server-side redirect: resolves the supplier, wraps once, logs the click.
    const bookingUrl = getBookingUrl(event.id, 'detail');
    Linking.openURL(bookingUrl).catch(() =>
      Alert.alert(t('error'), t('unable_booking'))
    );
  };

  const handleRsvp = async () => {
    if (!event) return;
    try {
      await ticketsService.rsvp(event.id, 1, inviteRef.consume());
      await fetchEvent();
      Alert.alert(t('youre_in'), t('ticket_ready'), [
        { text: t('view_ticket'), onPress: () => navigateToTab('Wallet') },
        { text: t('invite_friends'), onPress: () => { void shareWhatsApp(); } },
      ]);
    } catch (error) {
      const responseError = error as {
        response?: { status?: number; data?: { code?: string; error?: { code?: string } } };
      };
      const code = responseError.response?.data?.code || responseError.response?.data?.error?.code;
      if (responseError.response?.status === 409 && code === 'ALREADY_BOOKED') {
        navigateToTab('Wallet');
      } else if (responseError.response?.status === 409 && code === 'SOLD_OUT') {
        Alert.alert(t('sold_out'), t('sold_out_help'));
      } else {
        Alert.alert(t('unable_rsvp'), t('please_try_again'));
      }
    }
  };

  const handleCheckout = async () => {
    if (!event) return;
    setCheckoutLoading(true);
    try {
      const returnUrl = Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.origin
        : 'migo://checkout';
      const result = await ticketsService.checkout(event.id, ticketCount, returnUrl, inviteRef.consume());
      setCheckoutOpen(false);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.assign(result.checkoutUrl);
      } else {
        await Linking.openURL(result.checkoutUrl);
      }
    } catch (checkoutError) {
      console.error('Checkout failed:', checkoutError);
      Alert.alert(t('unable_checkout'), t('please_try_again'));
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <DetailSkeleton />
      </SafeAreaView>
    );
  }

  if (error || !event) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.danger} />
          <Text style={styles.errorText}>{error || t('no_events_found')}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchEvent}
          >
            <Text style={styles.retryButtonText}>{t('please_try_again')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Event Image */}
        <View style={styles.imageContainer}>
          {event.coverImage ? (
            <Image source={{ uri: event.coverImage }} style={styles.eventImage} />
          ) : (
            <View style={[styles.eventImage, styles.placeholderImage]}>
              <Ionicons name="image-outline" size={64} color={colors.border} />
            </View>
          )}
          <LinearGradient colors={gradients.dark} style={styles.imageOverlay}>
            <TouchableOpacity
              style={[styles.actionButton, styles.backButton, { top: insets.top + spacing.md }]}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel={t('back')}
            >
              <Ionicons name="arrow-back" size={24} color={colors.textInverse} />
            </TouchableOpacity>
            <Text style={styles.imageTitle} numberOfLines={3}>{event.title}</Text>
            <View style={styles.imageActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleBookmark}
              >
                <Ionicons
                  name={event && savedIds.has(event.id) ? 'bookmark' : 'bookmark-outline'}
                  size={24}
                  color={colors.textInverse}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleShare}
              >
                <Ionicons name="share-outline" size={24} color={colors.textInverse} />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {/* Event Content */}
        <View style={styles.content}>
          {/* Event Header */}
          <View style={styles.eventHeader}>
            <View style={styles.eventCategoryContainer}>
              <Text style={styles.eventCategory}>{categoryLabel(event.category)}</Text>
              {event.locationType === 'ONLINE' && (
                <View style={styles.featuredBadge}>
                  <Text style={styles.featuredBadgeText}>{t('online')}</Text>
                </View>
              )}
            </View>
            {sourceBadge(event.trust, locale) && (
              <View style={[styles.sourceChip, { backgroundColor: sourceBadge(event.trust, locale)?.backgroundColor }]}>
                <Ionicons name="shield-checkmark" size={15} color={sourceBadge(event.trust, locale)?.color} />
                <Text style={[styles.sourceChipText, { color: sourceBadge(event.trust, locale)?.color }]}>
                  {sourceBadge(event.trust, locale)?.text}
                </Text>
              </View>
            )}
            {(event as any).trust?.organizer && ((event as any).trust.organizer.name || (event as any).trust.organizer.displayName) && (
              <View style={styles.trustOrganizer}>
                {(event as any).trust.organizer.avatar ? (
                  <Image source={{ uri: (event as any).trust.organizer.avatar }} style={styles.organizerAvatar} />
                ) : <Ionicons name="person-circle-outline" size={32} color={colors.textMuted} />}
                <Text style={styles.organizerName}>{(event as any).trust.organizer.displayName || (event as any).trust.organizer.name}</Text>
                {(event as any).trust.organizer.isVerified && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
                {((event as any).trust.organizer.eventsHosted ?? 0) > 0 ? (
                  <Text style={styles.hostedCount}>{(event as any).trust.organizer.eventsHosted} {t('events_hosted')}</Text>
                ) : null}
              </View>
            )}
            {event.organizer && (event.organizer.displayName || event.organizer.name) && (
              <View style={styles.eventOrganizer}>
                {event.organizer.avatarUrl ? (
                  <Image
                    source={{ uri: event.organizer.avatarUrl }}
                    style={styles.organizerAvatar}
                  />
                ) : (
                  <View style={styles.organizerAvatar}>
                    <Ionicons name="person-circle-outline" size={32} color={colors.textMuted} />
                  </View>
                )}
                <Text style={styles.organizerName}>
                  {event.organizer.displayName || event.organizer.name}
                </Text>
              </View>
            )}
          </View>

          {/* Event Details */}
          <View style={styles.detailsSection}>
            <Text style={styles.sectionTitle}>{t('about')}</Text>
            <Text style={styles.description}>
              {event.description || event.shortDescription || t('no_events_help')}
            </Text>

            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                <View style={styles.detailText}>
                    <Text style={styles.detailLabel}>{t('date_time')}</Text>
                  <Text style={styles.detailValue}>
                    {formatEventDate(event.startDate, { withTime: true })}
                  </Text>
                  {event.endDate && (
                    <Text style={styles.detailValueSecondary}>
                      {formatEventDate(event.endDate)}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.detailItem}>
                <Ionicons name="location-outline" size={20} color={colors.primary} />
                <View style={styles.detailText}>
                    <Text style={styles.detailLabel}>{t('venue')}</Text>
                  <Text style={styles.detailValue}>
                    {event.venueName || t('location_tba')}
                  </Text>
                  {event.city && event.country && (
                    <Text style={styles.detailValueSecondary}>
                      {event.city}, {event.country}
                    </Text>
                  )}
                </View>
              </View>

              {event.capacity ? (
                <View style={styles.detailItem}>
                  <Ionicons name="people-outline" size={20} color={colors.primary} />
                  <View style={styles.detailText}>
                    <Text style={styles.detailLabel}>{t('capacity')}</Text>
                    <Text style={styles.detailValue}>
                      {event.capacity} {t('capacity')}
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.detailItem}>
                <Ionicons name="cash-outline" size={20} color={colors.primary} />
                <View style={styles.detailText}>
                    <Text style={styles.detailLabel}>{t('sort_price')}</Text>
                  <Text style={[styles.detailValue, styles.price]}>
                    {event.isFree || !event.priceFrom
                      ? t('free')
                      : formatPrice(Number(event.priceFrom), event.currency || 'AED')}
                  </Text>
                  {event.priceTo ? (
                    event.priceFrom !== event.priceTo ? (
                      <Text style={styles.detailValueSecondary}>
                        {formatPrice(Number(event.priceTo), event.currency || 'AED')}
                      </Text>
                    ) : null
                  ) : null}
                </View>
              </View>
            </View>
            {social && social.goingCount > 0 && (
              <View style={styles.socialRow}>
                <View style={styles.socialAvatars}>
                  {social.attendeesPreview.slice(0, 4).map((person, index) => (
                    person.avatar
                      ? <Image key={person.id} source={{ uri: person.avatar }} style={[styles.socialAvatar, { marginLeft: index ? -8 : 0 }]} />
                      : <View key={person.id} style={[styles.socialAvatar, styles.socialAvatarFallback, { marginLeft: index ? -8 : 0 }]}><Text style={styles.socialInitial}>{(person.name || '?')[0]}</Text></View>
                  ))}
                </View>
                <Text style={styles.socialText}>
                  {t('going_count', { count: social.goingCount })}{social.friendsGoing.length ? ` · ${t('friends_going', { name: social.friendsGoing[0].name || t('event'), count: Math.max(1, social.friendsGoing.length - 1) })}` : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Map */}
          {(event.latitude && event.longitude) || event.venueName || event.address ? (
            <View style={styles.mapSection}>
              <Text style={styles.sectionTitle}>{t('location_on_map')}</Text>
              {event.latitude && event.longitude ? (
                <EventMap
                  latitude={event.latitude}
                  longitude={event.longitude}
                  title={event.venueName || event.title}
                  description={event.address}
                />
              ) : (
                <TouchableOpacity
                  style={styles.mapFallback}
                  activeOpacity={0.8}
                  onPress={() =>
                    Linking.openURL(
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        [event.venueName, event.address, event.city, event.country]
                          .filter(Boolean)
                          .join(', ')
                      )}`
                    )
                  }
                >
                  <Ionicons name="map-outline" size={32} color={colors.primary} />
                  <Text style={styles.mapFallbackTitle}>{event.venueName || event.address}</Text>
                  {event.city && (
                    <Text style={styles.mapFallbackSubtitle}>
                      {[event.city, event.country].filter(Boolean).join(', ')}
                    </Text>
                  )}
                  <Text style={styles.mapFallbackLink}>{t('open_google_maps')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* Address */}
          {event.address && (
            <View style={styles.addressSection}>
              <Text style={styles.sectionTitle}>{t('address')}</Text>
              <Text style={styles.addressText}>{event.address}</Text>
            </View>
          )}

          {/* External Link */}
          {event.externalUrl && (
            <TouchableOpacity
              style={styles.externalLinkButton}
              onPress={() => Linking.openURL(getBookingUrl(event.id, 'detail_link')).catch(() =>
                Alert.alert(t('error'), t('please_try_again'))
              )}
            >
              <Ionicons name="link-outline" size={20} color={colors.primary} />
              <Text style={styles.externalLinkText}>
                {t('book_on', { supplier: supplierLabel(event) })}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarInfo}>
          <Text style={styles.refundNote}>{t(`refund_${(event as any).trust?.refundKey || 'per_provider'}` as any)}</Text>
          <Text style={styles.bottomBarPrice}>
            {event.isFree || !event.priceFrom
              ? t('free')
              : formatPrice(Number(event.priceFrom), event.currency || 'AED')}
          </Text>
          {event.capacity ? (
            <Text style={styles.bottomBarTickets}>{t('capacity')}: {event.capacity}</Text>
          ) : null}
        </View>
        <GradientButton
          style={styles.bottomBarButton}
          label={
            event.myBookingId
              ? t('view_ticket')
              : event.canRsvp
                ? t('get_free_ticket')
                : event.canBuy
                ? `${t('buy_ticket')} · ${formatPrice(Number(event.priceFrom || 0), event.currency || 'AED')}`
                : event.externalUrl
                  ? t('book_on', { supplier: supplierLabel(event) })
                  : t('book_now')
          }
          onPress={
            event.myBookingId
              ? () => navigateToTab('Wallet')
              : event.canRsvp
                ? handleRsvp
                : event.canBuy
                  ? () => setCheckoutOpen(true)
                  : handleBookTicket
          }
        />
      </View>
      <Modal
        visible={shareOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setShareOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.checkoutSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('share')}</Text>
              <TouchableOpacity onPress={() => setShareOpen(false)}><Ionicons name="close" size={24} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.shareAction} onPress={shareWhatsApp}><Ionicons name="logo-whatsapp" size={22} color={colors.success} /><Text style={styles.shareActionText}>{t('share_on_whatsapp')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.shareAction} onPress={copyShareLink}><Ionicons name="copy-outline" size={22} color={colors.primary} /><Text style={styles.shareActionText}>{t('copy_link')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.shareAction} onPress={shareMore}><Ionicons name="share-social-outline" size={22} color={colors.textMuted} /><Text style={styles.shareActionText}>{t('more')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={checkoutOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCheckoutOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.checkoutSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('buy_tickets')}</Text>
              <TouchableOpacity onPress={() => setCheckoutOpen(false)} disabled={checkoutLoading}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.sheetEventTitle}>{event.title}</Text>
            <View style={styles.quantityRow}>
              <Text style={styles.quantityLabel}>{t('quantity')}</Text>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => setTicketCount(value => Math.max(1, value - 1))}
                  disabled={checkoutLoading || ticketCount === 1}
                >
                  <Ionicons name="remove" size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{ticketCount}</Text>
                <TouchableOpacity
                  style={styles.stepperButton}
                  onPress={() => setTicketCount(value => Math.min(4, value + 1))}
                  disabled={checkoutLoading || ticketCount === 4}
                >
                  <Ionicons name="add" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('total')}</Text>
              <Text style={styles.totalValue}>
                {event.currency || 'AED'} {(Number(event.priceFrom || 0) * ticketCount).toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.payButton}
              onPress={handleCheckout}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={styles.payButtonText}>{t('pay')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.textInverse,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textMuted,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.danger,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  imageContainer: {
    position: 'relative',
  },
  eventImage: {
    width: '100%',
    height: 380,
  },
  placeholderImage: {
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: spacing.lg,
    paddingBottom: spacing.lg + 24,
  },
  backButton: {
    position: 'absolute',
    left: spacing.lg,
  },
  imageTitle: {
    ...type.h1,
    color: colors.textInverse,
    marginBottom: spacing.lg,
    paddingRight: 72,
  },
  imageActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: spacing.lg,
    marginTop: -24,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
    zIndex: 1,
  },
  eventHeader: {
    marginBottom: 24,
  },
  eventCategoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventCategory: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  featuredBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  featuredBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: 'bold',
  },
  eventTitle: {
    ...type.h1,
    marginBottom: 16,
  },
  sourceChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, marginBottom: 12 },
  sourceChipText: { fontSize: 13, fontWeight: '700' },
  trustOrganizer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  hostedCount: { color: colors.textMuted, fontSize: 12 },
  eventOrganizer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  organizerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  organizerName: {
    fontSize: 16,
    color: colors.textMuted,
  },
  detailsSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: 24,
  },
  detailsGrid: {
    gap: 16,
  },
  socialRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  socialAvatars: { flexDirection: 'row', alignItems: 'center', minWidth: 48 },
  socialAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.textInverse },
  socialAvatarFallback: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  socialInitial: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  socialText: { marginLeft: 10, color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    marginLeft: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  detailValueSecondary: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  price: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  mapFallback: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    paddingHorizontal: 16,
  },
  mapFallbackTitle: {
    marginTop: 12,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  mapFallbackSubtitle: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
  },
  mapFallbackLink: {
    marginTop: 12,
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  mapSection: {
    marginBottom: 32,
  },
  map: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  addressSection: {
    marginBottom: 32,
  },
  addressText: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  externalLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoft,
    padding: 16,
    borderRadius: 12,
    marginBottom: 100,
  },
  externalLinkText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  tagsSection: {
    marginBottom: 32,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  similarEventsSection: {
    marginBottom: 100,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.float,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottomBarInfo: {
    flexShrink: 1,
    marginRight: 12,
  },
  bottomBarButton: {
    flex: 1,
    minWidth: 150,
    maxWidth: 320,
  },
  bottomBarPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
  },
  refundNote: { color: colors.textMuted, fontSize: 11, marginBottom: 4 },
  bottomBarTickets: {
    fontSize: 12,
    color: colors.textMuted,
  },
  bookButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  bookButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  checkoutSheet: {
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.textInverse,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  sheetEventTitle: {
    marginTop: 12,
    color: colors.textSecondary,
    fontSize: 15,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
  },
  quantityLabel: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
  },
  stepperValue: {
    minWidth: 18,
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 28,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  totalValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  payButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  payButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  shareAction: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.surfaceAlt },
  shareActionText: { fontSize: 16, color: colors.text, fontWeight: '600' },
});

export default EventDetailScreen;