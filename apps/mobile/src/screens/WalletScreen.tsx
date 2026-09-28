import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useFocusEffect } from '@react-navigation/native';
import { navigateToTab } from '../navigation/navigationRef';
import { Ticket, ticketsService } from '../services/tickets.service';

const categoryColors: Record<string, string> = {
  Music: '#6d28d9',
  Sports: '#065f46',
  Art: '#b45309',
  Food: '#dc2626',
  Tech: '#1d4ed8',
  Business: '#374151',
  Health: '#0f766e',
  Theater: '#7c3aed',
  Comedy: '#d97706',
  Other: '#3b82f6',
};

const ticketColor = (category?: string) => categoryColors[category || ''] || categoryColors.Other;

const formatDate = (value: string) => {
  const date = new Date(value);
  return `${date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

function TicketCard({ ticket, onCancel }: { ticket: Ticket; onCancel: (ticket: Ticket) => void }) {
  const color = ticketColor(ticket.event.category || undefined);
  return (
    <View style={styles.card}>
      {ticket.event.coverImage ? (
        <Image source={{ uri: ticket.event.coverImage }} style={styles.coverImage} />
      ) : (
        <View style={[styles.coverImage, { backgroundColor: color }]}>
          <Ionicons name="ticket-outline" size={42} color="#fff" />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardHeading}>
          <Text style={styles.category}>{ticket.event.category || 'Event'}</Text>
          <View style={[styles.statusBadge, ticket.status === 'CHECKED_IN' && styles.usedBadge]}>
            <Text style={styles.statusText}>{ticket.status === 'CHECKED_IN' ? 'Used' : 'Valid'}</Text>
          </View>
        </View>
        <Text style={styles.title}>{ticket.event.title}</Text>
        <Text style={styles.meta}>{formatDate(ticket.event.startDate)}</Text>
        <Text style={styles.meta}>
          {ticket.event.venueName || 'Venue TBA'}{ticket.event.city ? ` · ${ticket.event.city}` : ''}
        </Text>
        <Text style={styles.quantity}>{ticket.ticketCount} × General admission</Text>
        {ticket.qrCode ? (
          <View style={styles.qrSection}>
            <QRCode value={ticket.qrCode} size={160} />
            <Text style={styles.code}>{ticket.qrCode}</Text>
          </View>
        ) : null}
        {ticket.status === 'CONFIRMED' && (
          <TouchableOpacity style={styles.cancelButton} onPress={() => onCancel(ticket)}>
            <Ionicons name="close-circle-outline" size={16} color="#dc2626" />
            <Text style={styles.cancelText}>Cancel ticket</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function WalletScreen() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTickets = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    try {
      setTickets(await ticketsService.myTickets());
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadTickets();
  }, [loadTickets]));

  const cancelTicket = (ticket: Ticket) => {
    Alert.alert('Cancel ticket', `Cancel your ticket for ${ticket.event.title}?`, [
      { text: 'Keep ticket', style: 'cancel' },
      {
        text: 'Cancel ticket',
        style: 'destructive',
        onPress: async () => {
          try {
            await ticketsService.cancelTicket(ticket.id);
            await loadTickets();
          } catch {
            Alert.alert('Unable to cancel', 'Please try again.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#2563eb" style={styles.loader} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wallet</Text>
        <Ionicons name="wallet-outline" size={25} color="#2563eb" />
      </View>
      <FlatList<Ticket>
        data={tickets}
        keyExtractor={(ticket: Ticket) => ticket.id}
        renderItem={({ item }: { item: Ticket }) => <TicketCard ticket={item} onCancel={cancelTicket} />}
        contentContainerStyle={tickets.length ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadTickets(true)} />}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Ionicons name="ticket-outline" size={58} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No tickets yet</Text>
            <Text style={styles.emptyText}>RSVP to an event to see it here</Text>
            <TouchableOpacity style={styles.eventsButton} onPress={() => navigateToTab('Events')}>
              <Text style={styles.eventsButtonText}>Browse events</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loader: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#111827' },
  list: { padding: 16, gap: 16 },
  emptyList: { flexGrow: 1, padding: 24 },
  card: {
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  coverImage: {
    width: '100%',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { padding: 16 },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { color: '#2563eb', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#dcfce7' },
  usedBadge: { backgroundColor: '#e5e7eb' },
  statusText: { color: '#166534', fontSize: 12, fontWeight: '700' },
  title: { marginTop: 8, fontSize: 20, fontWeight: '700', color: '#111827' },
  meta: { marginTop: 5, color: '#4b5563', fontSize: 14 },
  quantity: { marginTop: 12, color: '#111827', fontSize: 14, fontWeight: '600' },
  qrSection: { alignItems: 'center', gap: 8, paddingVertical: 18, borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 16 },
  code: { maxWidth: '100%', color: '#6b7280', fontSize: 11, textAlign: 'center' },
  cancelButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 14 },
  cancelText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 },
  emptyTitle: { marginTop: 16, fontSize: 20, fontWeight: '700', color: '#374151' },
  emptyText: { marginTop: 6, color: '#6b7280', textAlign: 'center' },
  eventsButton: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2563eb' },
  eventsButtonText: { color: '#fff', fontWeight: '700' },
});
