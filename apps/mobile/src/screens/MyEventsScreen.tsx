import { colors } from '../theme';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HostedEvent, ticketsService } from '../services/tickets.service';
import { socialService } from '../services/social.service';
import type { ProfileStackParamList } from '../navigation/MainTabNavigator';
import { formatEventDate, useLocale } from '../i18n';
import { navigationRef } from '../navigation/navigationRef';

type Navigation = NativeStackNavigationProp<ProfileStackParamList, 'MyEvents'>;

export default function MyEventsScreen({ navigation }: { navigation: Navigation }) {
  const { t } = useLocale();
  const [events, setEvents] = useState<HostedEvent[]>([]);
  const [organizerVerified, setOrganizerVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ticketsService.myEvents();
      setEvents(result.events);
      setOrganizerVerified(result.organizer.isVerified);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadEvents();
  }, [loadEvents]));

  const shareEvent = async (event: HostedEvent) => {
    try {
      const invite = await socialService.invite(event.id);
      const text = `${event.title} — ${new Date(event.startDate).toLocaleString()}. Join me on Migo: ${invite.shareUrl}`;
      await Linking.openURL(invite.whatsappUrl || `https://wa.me/?text=${encodeURIComponent(text)}`);
    } catch {
      Alert.alert(t('unable_to_share'), t('please_try_again'));
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={colors.primary} style={styles.loader} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(event: HostedEvent) => event.id}
        contentContainerStyle={events.length ? styles.list : styles.emptyList}
        ListHeaderComponent={(
          <View>
            <View style={styles.headingRow}>
              <Text style={styles.heading}>{t('my_events')}</Text>
              <View style={styles.headingActions}>
                {organizerVerified ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                <TouchableOpacity
                  style={styles.dashboardButton}
                  onPress={() => navigationRef.current?.navigate('HostDashboard')}
                  accessibilityRole="button"
                >
                  <Ionicons name="stats-chart-outline" size={15} color={colors.primary} />
                  <Text style={styles.dashboardButtonText}>{t('dashboard')}</Text>
                </TouchableOpacity>
              </View>
            </View>
            {!organizerVerified ? <Text style={styles.verificationHint}>{t('verification_hint')}</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{t('no_hosted_events_help')}</Text>}
        renderItem={({ item }: { item: HostedEvent }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.date}>{formatEventDate(item.startDate, { withTime: true })} · {item.city || 'UAE'}</Text>
            <Text style={styles.attendance}>
              {item.confirmed} {t('confirmed')} · {item.checkedIn} {t('checked_in')}
              {` · ${item.invited} ${t('invited')}`}
              {item.capacity ? ` · ${item.capacity} ${t('capacity')}` : ''}
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('CheckIn', { eventId: item.id })}>
                <Ionicons name="qr-code-outline" size={17} color={colors.textInverse} />
                <Text style={styles.actionText}>{t('check_in')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareButton} onPress={() => shareEvent(item)}>
                <Ionicons name="share-outline" size={17} color={colors.primary} />
                <Text style={styles.shareText}>{t('share')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1 },
  list: { padding: 20, gap: 14 },
  emptyList: { flexGrow: 1, padding: 20 },
  heading: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 4 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  headingActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  dashboardButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: colors.primarySoft },
  dashboardButtonText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  verificationHint: { flex: 1, color: colors.textMuted, fontSize: 12 },
  empty: { marginTop: 24, color: colors.textMuted, textAlign: 'center' },
  card: { backgroundColor: colors.textInverse, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  date: { marginTop: 7, color: colors.textSecondary },
  attendance: { marginTop: 7, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: 10, marginTop: 15 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 9, backgroundColor: colors.primary },
  actionText: { color: colors.textInverse, fontWeight: '700' },
  shareButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 9, borderWidth: 1, borderColor: colors.primarySoft },
  shareText: { color: colors.primary, fontWeight: '700' },
});
