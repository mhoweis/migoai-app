import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Container from '../components/Container';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { formatEventDate, useLocale } from '../i18n';
import { navigateToTab } from '../navigation/navigationRef';
import { dashboardService, HostDashboardData, HostDashboardEvent } from '../services/dashboard.service';
import { isHost } from '../services/auth.service';
import { useUserStore } from '../store/userStore';
import { colors, radius, shadow, type } from '../theme';

type Kpi = { label: string; value: string; detail?: string; icon: keyof typeof Ionicons.glyphMap };

function Avatar({ name, uri, size = 40 }: { name: string; uri: string | null; size?: number }) {
  return uri
    ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : (
      <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={styles.avatarInitial}>{name.slice(0, 1).toUpperCase()}</Text>
      </View>
    );
}

function MetricCard({ label, value, detail, icon, wide }: Kpi & { wide?: boolean }) {
  return (
    <View style={[styles.metricCard, wide && styles.metricCardWide]}>
      <View style={styles.metricIcon}><Ionicons name={icon} size={18} color={colors.primary} /></View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

function EventRow({ event, onOpen, onCheckIn, t }: {
  event: HostDashboardEvent;
  onOpen(): void;
  onCheckIn(): void;
  t: ReturnType<typeof useLocale>['t'];
}) {
  const capacity = event.capacity && event.capacity > 0 ? event.capacity : 0;
  const capacityProgress = capacity ? Math.min(1, event.registered / capacity) : 0;
  return (
    <View style={styles.eventCard}>
      <TouchableOpacity style={styles.eventMain} onPress={onOpen} accessibilityRole="button">
        {event.coverImage ? <Image source={{ uri: event.coverImage }} style={styles.eventCover} /> : null}
        <View style={styles.eventCopy}>
          <Text style={styles.eventDate}>{formatEventDate(event.startDate, { withTime: true })}</Text>
          <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.eventVenue} numberOfLines={1}>{event.venueName || t('location_tba')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {capacity > 0 ? (
        <View style={styles.capacityBlock}>
          <View style={styles.capacityLabels}>
        <Text style={styles.eventStatLabel}>{t('dashboard_registered')}</Text>
            <Text style={styles.eventStatValue}>{event.registered} / {capacity}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${capacityProgress * 100}%` }]} />
          </View>
        </View>
      ) : null}
      <View style={styles.eventMetrics}>
        <Text style={styles.eventStatValue}>{event.checkedIn} {t('dashboard_checked_in')}</Text>
        <Text style={styles.eventStatValue}>{Math.round(event.checkInRate * 100)}% {t('dashboard_check_in_rate')}</Text>
        <Text style={styles.eventStatLabel}>{event.saves} {t('dashboard_saves')}</Text>
        <Text style={styles.eventStatLabel}>{event.views} {t('dashboard_views')}</Text>
      </View>
      {!event.isPast ? (
        <TouchableOpacity style={styles.checkInButton} onPress={onCheckIn} accessibilityRole="button">
          <Ionicons name="qr-code-outline" size={17} color={colors.textInverse} />
          <Text style={styles.checkInButtonText}>{t('check_in')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function HostDashboardScreen() {
  const { t, locale, isRTL } = useLocale();
  const navigation = useNavigation<any>();
  const { user } = useUserStore();
  const { width, isWebDesktop } = useBreakpoint();
  const [dashboard, setDashboard] = useState<HostDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvents, setSelectedEvents] = useState<'upcoming' | 'past'>('upcoming');
  const [error, setError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!isHost(user)) {
      setLoading(false);
      return () => undefined;
    }
    let mounted = true;
    setLoading(true);
    setError(false);
    dashboardService.getHostDashboard()
      .then(result => { if (mounted) setDashboard(result); })
      .catch(() => { if (mounted) setError(true); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [refreshVersion, user?.role]));

  const openEvent = (eventId: string) => navigateToTab('Events', 'EventDetail', { eventId });
  const openCheckIn = (eventId: string) => navigateToTab('Profile', 'CheckIn', { eventId });
  const createEvent = () => navigateToTab('Profile', 'CreateEvent');
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigateToTab('Profile', 'ProfileMain'));

  const kpis: Kpi[] = dashboard ? [
    {
      label: t('dashboard_followers'),
      value: String(dashboard.community.followers),
      detail: t('dashboard_new_followers_30d', { count: dashboard.community.newFollowers30d }),
      icon: 'people-outline',
    },
    {
      label: t('dashboard_events_hosted'),
      value: String(dashboard.totals.hosted),
      detail: `${dashboard.totals.upcoming} ${t('dashboard_upcoming_events')} · ${dashboard.totals.past} ${t('dashboard_past_events')}`,
      icon: 'calendar-outline',
    },
    { label: t('dashboard_registered'), value: String(dashboard.totals.registered), icon: 'ticket-outline' },
    { label: t('dashboard_checked_in'), value: String(dashboard.totals.checkedIn), icon: 'checkmark-circle-outline' },
    {
      label: t('dashboard_check_in_rate'),
      value: dashboard.totals.checkInRate === null
        ? '—'
        : `${Math.round(dashboard.totals.checkInRate * 100)}%`,
      detail: dashboard.totals.checkInRate === null ? t('dashboard_check_in_after_start') : undefined,
      icon: 'stats-chart-outline',
    },
  ] : [];

  const visibleEvents = dashboard?.events.filter(event => event.isPast === (selectedEvents === 'past')) || [];
  const maxNewFollowers = Math.max(1, ...(dashboard?.community.followerGrowth.map(week => week.newFollowers) || []));
  const chartLocale = locale === 'ar' ? 'ar-AE' : 'en-AE';

  if (!isHost(user)) {
    return (
      <View style={styles.screen}>
        <Container style={styles.upgradeContainer}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.primary} />
          <Text style={styles.upgradeTitle}>{t('upgrade_host_title')}</Text>
          <Text style={styles.upgradeText}>{t('upgrade_host_help')}</Text>
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={() => navigation.navigate('Main', { screen: 'ProfileTab', params: { screen: 'Plans', params: { selectedPlan: 'HOST' } } })}
          >
            <Text style={styles.upgradeButtonText}>{t('upgrade_to_host')}</Text>
          </TouchableOpacity>
        </Container>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Container style={styles.content}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('back')}
            onPress={goBack}
            style={styles.backButton}
          >
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={18} color={colors.primary} />
            <Text style={styles.backText}>{t('back')}</Text>
          </TouchableOpacity>
          <View style={styles.heading}>
            <View>
              <Text style={styles.eyebrow}>{t('host')}</Text>
              <Text style={styles.title}>{t('host_dashboard')}</Text>
              {error ? <Text style={styles.errorText}>{t('dashboard_load_failed')}</Text> : null}
            </View>
            <TouchableOpacity style={styles.refreshButton} onPress={() => setRefreshVersion(version => version + 1)}>
              <Ionicons name="refresh-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {dashboard ? (
            <>
              <View style={[styles.kpiGrid, width >= 768 && styles.kpiGridWide]}>
                {kpis.map(kpi => <MetricCard key={kpi.label} {...kpi} wide={width >= 768} />)}
              </View>
              <View style={[styles.columns, isWebDesktop && styles.columnsWide]}>
                <View style={[styles.communityColumn, isWebDesktop && styles.wideColumn]}>
                  <View style={styles.panel}>
                    <View style={styles.panelHeading}>
                      <View>
                        <Text style={styles.panelTitle}>{t('dashboard_community')}</Text>
                        <Text style={styles.panelSubtitle}>
                          {dashboard.community.followers} {t('dashboard_followers')} · {dashboard.community.following} {t('dashboard_following')}
                        </Text>
                      </View>
                      <View style={styles.followersCallout}>
                        <Text style={styles.followersCalloutValue}>{dashboard.community.followersAttending}</Text>
                        <Text style={styles.followersCalloutText}>{t('dashboard_followers_attending_events')}</Text>
                      </View>
                    </View>

                    <Text style={styles.subsectionTitle}>{t('dashboard_follower_growth')}</Text>
                    <View style={styles.chart}>
                      {dashboard.community.followerGrowth.map(week => {
                        const barHeight = Math.max(4, (week.newFollowers / maxNewFollowers) * 54);
                        const label = new Intl.DateTimeFormat(chartLocale, { month: 'short', day: 'numeric', timeZone: 'UTC' })
                          .format(new Date(`${week.weekStart}T00:00:00Z`));
                        return (
                          <View key={week.weekStart} style={styles.chartColumn}>
                            <Text style={styles.chartCount}>{week.newFollowers}</Text>
                            <View style={styles.chartTrack}>
                              <View style={[styles.chartBar, { height: barHeight }]} />
                            </View>
                            <Text style={styles.chartLabel}>{label}</Text>
                          </View>
                        );
                      })}
                    </View>

                    <Text style={styles.subsectionTitle}>{t('dashboard_recent_followers')}</Text>
                    {dashboard.community.recentFollowers.length ? dashboard.community.recentFollowers.map(follower => (
                      <View key={follower.id} style={styles.personRow}>
                        <Avatar name={follower.name} uri={follower.avatar} />
                        <View style={styles.personCopy}>
                          <Text style={styles.personName} numberOfLines={1}>{follower.name}</Text>
                          <Text style={styles.personMeta}>{formatEventDate(follower.followedAt)}</Text>
                        </View>
                        {follower.followsBack ? <Text style={styles.followBack}>{t('dashboard_follows_you_back')}</Text> : null}
                      </View>
                    )) : <Text style={styles.mutedText}>{t('dashboard_no_followers')}</Text>}

                    <Text style={styles.subsectionTitle}>{t('dashboard_repeat_attendees')}</Text>
                    {dashboard.community.repeatAttendees.length ? dashboard.community.repeatAttendees.map(person => (
                      <View key={person.id} style={styles.personRow}>
                        <Avatar name={person.name} uri={person.avatar} />
                        <View style={styles.personCopy}>
                          <Text style={styles.personName} numberOfLines={1}>{person.name}</Text>
                        </View>
                        <Text style={styles.attendedCount}>{person.eventsAttended} {t('dashboard_events_attended')}</Text>
                      </View>
                    )) : <Text style={styles.mutedText}>{t('dashboard_no_repeat_attendees')}</Text>}
                  </View>
                </View>

                <View style={[styles.eventsColumn, isWebDesktop && styles.wideColumn]}>
                  <View style={styles.eventsHeading}>
                    <Text style={styles.panelTitle}>{t('dashboard_hosted_events')}</Text>
                    <View style={styles.segments}>
                      {(['upcoming', 'past'] as const).map(tab => (
                        <TouchableOpacity
                          key={tab}
                          style={[styles.segment, selectedEvents === tab && styles.segmentActive]}
                          onPress={() => setSelectedEvents(tab)}
                        >
                          <Text style={[styles.segmentText, selectedEvents === tab && styles.segmentTextActive]}>
                            {t(tab === 'upcoming' ? 'dashboard_upcoming_events' : 'dashboard_past_events')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  {visibleEvents.length ? visibleEvents.map(event => (
                    <EventRow
                      key={event.id}
                      event={event}
                      onOpen={() => openEvent(event.id)}
                      onCheckIn={() => openCheckIn(event.id)}
                      t={t}
                    />
                  )) : dashboard.events.length === 0 ? (
                    <View style={styles.emptyPanel}>
                      <Ionicons name="calendar-outline" size={32} color={colors.primary} />
                      <Text style={styles.emptyTitle}>{t('dashboard_no_hosted_events')}</Text>
                      <Text style={styles.mutedText}>{t('dashboard_create_first_event_help')}</Text>
                      <TouchableOpacity style={styles.primaryButton} onPress={createEvent}>
                        <Ionicons name="add" size={18} color={colors.textInverse} />
                        <Text style={styles.primaryButtonText}>{t('create_event')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : <Text style={styles.mutedText}>{t('dashboard_no_events_in_segment')}</Text>}
                </View>
              </View>
            </>
          ) : (
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>{t('dashboard_load_failed')}</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setRefreshVersion(version => version + 1)}>
                <Text style={styles.primaryButtonText}>{t('dashboard_try_again')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Container>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1, paddingBottom: 28 },
  content: { paddingTop: 28 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  upgradeContainer: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 40 },
  upgradeTitle: { ...type.h2, textAlign: 'center' },
  upgradeText: { ...type.body, textAlign: 'center', maxWidth: 520 },
  upgradeButton: { paddingHorizontal: 22, paddingVertical: 13, borderRadius: radius.pill, backgroundColor: colors.primary, marginTop: 6 },
  upgradeButtonText: { color: colors.textInverse, fontWeight: '800' },
  backButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 14, borderRadius: radius.pill, backgroundColor: colors.surface, ...shadow.card },
  backText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  eyebrow: { ...type.label, color: colors.primary, textTransform: 'uppercase', letterSpacing: 1 },
  title: { ...type.h1, marginTop: 4 },
  errorText: { color: colors.danger, marginTop: 6, fontSize: 13 },
  refreshButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 22 },
  kpiGridWide: { flexWrap: 'nowrap' },
  metricCard: { flexBasis: '48%', flexGrow: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  metricCardWide: { flexBasis: 0 },
  metricIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  metricValue: { marginTop: 12, color: colors.text, fontSize: 25, fontWeight: '800' },
  metricLabel: { marginTop: 2, color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  metricDetail: { marginTop: 5, color: colors.textMuted, fontSize: 11 },
  columns: { gap: 18 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  communityColumn: { width: '100%' },
  eventsColumn: { width: '100%', gap: 12 },
  wideColumn: { flex: 1, minWidth: 0 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 18, ...shadow.card },
  panelHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  panelTitle: { ...type.h2 },
  panelSubtitle: { marginTop: 5, color: colors.textMuted, fontSize: 12 },
  followersCallout: { maxWidth: 110, alignItems: 'flex-end', backgroundColor: colors.infoSoft, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
  followersCalloutValue: { fontSize: 18, fontWeight: '800', color: colors.info },
  followersCalloutText: { fontSize: 10, lineHeight: 14, color: colors.info, textAlign: 'right' },
  subsectionTitle: { marginTop: 22, marginBottom: 10, color: colors.text, fontSize: 14, fontWeight: '700' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, minHeight: 92 },
  chartColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  chartCount: { fontSize: 10, color: colors.textMuted, marginBottom: 4 },
  chartTrack: { height: 56, width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  chartBar: { width: '68%', backgroundColor: colors.primary, borderRadius: 5 },
  chartLabel: { color: colors.textMuted, fontSize: 9, marginTop: 5 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  avatarInitial: { color: colors.primary, fontWeight: '700' },
  personCopy: { flex: 1, minWidth: 0 },
  personName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  personMeta: { marginTop: 2, color: colors.textMuted, fontSize: 11 },
  followBack: { color: colors.info, fontSize: 10, fontWeight: '700', maxWidth: 105, textAlign: 'right' },
  attendedCount: { color: colors.textMuted, fontSize: 11 },
  mutedText: { color: colors.textMuted, fontSize: 13, paddingVertical: 10 },
  eventsHeading: { gap: 13, marginBottom: 2 },
  segments: { flexDirection: 'row', gap: 5, padding: 4, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.surface, ...shadow.card },
  segmentText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  segmentTextActive: { color: colors.primary },
  eventCard: { backgroundColor: colors.surface, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  eventMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eventCover: { width: 60, height: 60, borderRadius: 11, backgroundColor: colors.surfaceAlt },
  eventCopy: { flex: 1, minWidth: 0 },
  eventDate: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  eventTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 3 },
  eventVenue: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  capacityBlock: { marginTop: 13 },
  capacityLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  eventMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  eventStatLabel: { color: colors.textMuted, fontSize: 11 },
  eventStatValue: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
  checkInButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 12, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 10 },
  checkInButtonText: { color: colors.textInverse, fontSize: 12, fontWeight: '700' },
  emptyPanel: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 28, ...shadow.card },
  emptyTitle: { marginTop: 12, color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 16, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: colors.primary, borderRadius: 11 },
  primaryButtonText: { color: colors.textInverse, fontSize: 13, fontWeight: '700' },
});
