import { colors } from '../theme';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useFocusEffect } from '@react-navigation/native';
import { navigateToTab } from '../navigation/navigationRef';
import { Ticket, ticketsService } from '../services/tickets.service';
import { socialService } from '../services/social.service';
import { formatEventDate, useLocale, categoryLabel } from '../i18n';
import { radius, shadow, spacing, type } from '../theme';
import GradientButton from '../components/GradientButton';

const categoryColors: Record<string, string> = {
  Music: colors.primaryDark,
  Sports: colors.success,
  Art: colors.warning,
  Food: colors.danger,
  Tech: colors.primaryDark,
  Business: colors.textSecondary,
  Health: colors.success,
  Theater: colors.primary,
  Comedy: colors.warning,
  Other: colors.primary,
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

function TicketCard({
  ticket,
  onCancel,
  onTransfer,
  onCancelTransfer,
  onApple,
  onGoogle,
  capabilities,
  t,
}: {
  ticket: Ticket;
  onCancel: (ticket: Ticket) => void;
  onTransfer: (ticket: Ticket) => void;
  onCancelTransfer: (ticket: Ticket) => void;
  onApple: (ticket: Ticket) => void;
  onGoogle: (ticket: Ticket) => void;
  capabilities: { apple: boolean; google: boolean };
  t: ReturnType<typeof useLocale>['t'];
}) {
  const color = ticketColor(ticket.event.category || undefined);
  const sendToWhatsApp = async () => {
    try {
      const invite = await socialService.invite(ticket.event.id);
      const text = `My ticket for ${ticket.event.title} — ${formatDate(ticket.event.startDate)}. Get yours: ${invite.shareUrl}`;
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
    } catch {
      Alert.alert(t('unable_to_share'), t('please_try_again'));
    }
  };
  return (
    <View style={styles.card}>
      {ticket.event.coverImage ? (
        <Image source={{ uri: ticket.event.coverImage }} style={styles.coverImage} />
      ) : (
        <View style={[styles.coverImage, { backgroundColor: color }]}>
          <Ionicons name="ticket-outline" size={42} color={colors.textInverse} />
        </View>
      )}
        <View style={styles.cardBody}>
        <View style={styles.cardHeading}>
          <Text style={styles.category}>{categoryLabel(ticket.event.category)}</Text>
          <View style={[styles.statusBadge, ticket.status === 'CHECKED_IN' && styles.usedBadge]}>
            <Text style={styles.statusText}>{ticket.status === 'CHECKED_IN' ? t('checked_in') : t('confirmed')}</Text>
          </View>
        </View>
        <Text style={styles.title}>{ticket.event.title}</Text>
        <Text style={styles.meta}>{formatEventDate(ticket.event.startDate, { withTime: true })}</Text>
        <Text style={styles.meta}>
          {ticket.event.venueName || t('location_tba')}{ticket.event.city ? ` · ${ticket.event.city}` : ''}
        </Text>
        <Text style={styles.quantity}>{ticket.ticketCount} × {t('event')}</Text>
        <Text style={styles.price}>
          {Number(ticket.totalAmount || 0) > 0
            ? `${ticket.currency || ticket.event.currency || 'AED'} ${Number(ticket.totalAmount).toFixed(2)} paid`
            : t('free')}
        </Text>
        <View style={styles.perforation}>
          <View style={styles.perforationCircleLeft} />
          <View style={styles.perforationLine} />
          <View style={styles.perforationCircleRight} />
        </View>
        {ticket.qrCode ? (
          <View style={styles.qrSection}>
            <View style={styles.qrFrame}><QRCode value={ticket.qrCode} size={160} /></View>
            <Text style={styles.code}>{ticket.qrCode}</Text>
          </View>
        ) : null}
        {ticket.status === 'CONFIRMED' && (
          <View style={styles.actions}>
            {capabilities.apple && Platform.OS === 'web' ? (
              <TouchableOpacity style={styles.actionButton} onPress={() => onApple(ticket)}>
                <Text style={styles.actionText}>{t('add_apple_wallet')}</Text>
              </TouchableOpacity>
            ) : null}
            {capabilities.google ? (
              <TouchableOpacity style={styles.actionButton} onPress={() => onGoogle(ticket)}>
                <Text style={styles.actionText}>{t('save_google_wallet')}</Text>
              </TouchableOpacity>
            ) : null}
            {ticket.pendingTransfer ? (
              <>
                <Text style={styles.pendingText}>{t('transfer_sent', { email: ticket.pendingTransfer.toEmail })}</Text>
                <TouchableOpacity style={styles.cancelTransferButton} onPress={() => onCancelTransfer(ticket)}>
                  <Text style={styles.cancelText}>{t('cancel_transfer')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.actionButton} onPress={() => onTransfer(ticket)}>
                <Text style={styles.actionText}>{t('transfer_ticket')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {ticket.status === 'CONFIRMED' && (
          <TouchableOpacity style={styles.shareTicketButton} onPress={sendToWhatsApp}>
            <Ionicons name="logo-whatsapp" size={16} color={colors.success} />
            <Text style={styles.shareTicketText}>{t('send_to_whatsapp')}</Text>
          </TouchableOpacity>
        )}
        {ticket.status === 'CONFIRMED' && (
          <TouchableOpacity style={styles.cancelButton} onPress={() => onCancel(ticket)}>
            <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.cancelText}>{t('cancel_ticket')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function WalletScreen() {
  const { t } = useLocale();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [capabilities, setCapabilities] = useState({ apple: false, google: false });
  const [recipientTicket, setRecipientTicket] = useState<Ticket | null>(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const cacheKey = 'migo.wallet.cache';

  const loadTickets = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    if (!pull) {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        try {
          setTickets(JSON.parse(cached));
          setLoading(false);
        } catch {
          await AsyncStorage.removeItem(cacheKey);
        }
      }
    }
    try {
      const nextTickets = await ticketsService.myTickets();
      setTickets(nextTickets);
      setOffline(false);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(nextTickets));
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadTickets();
    void ticketsService.passesConfig().then(setCapabilities).catch(() => undefined);
  }, [loadTickets]));

  const transferTicket = (ticket: Ticket) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(t('recipient_email'), undefined, async value => {
        if (value) {
          try {
            const result = await ticketsService.transfer(ticket.id, value);
            await Linking.openURL(result.whatsappUrl);
            await loadTickets();
          } catch {
            Alert.alert(t('transfer_unavailable'), t('please_try_again'));
          }
        }
      }, 'plain-text');
      return;
    }
    setRecipientTicket(ticket);
  };

  const submitTransfer = async () => {
    if (!recipientTicket || !recipientEmail.trim()) return;
    try {
      const result = await ticketsService.transfer(recipientTicket.id, recipientEmail.trim());
      setRecipientTicket(null);
      setRecipientEmail('');
      await loadTickets();
      await Linking.openURL(result.whatsappUrl);
    } catch {
      Alert.alert(t('transfer_unavailable'), t('please_try_again'));
    }
  };

  const cancelTransfer = (ticket: Ticket) => {
    if (!ticket.pendingTransfer) return;
    Alert.alert(t('cancel_transfer'), t('transfer_sent', { email: ticket.pendingTransfer.toEmail }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('cancel_transfer'),
        style: 'destructive',
        onPress: async () => {
          try {
            await ticketsService.cancelTransfer(ticket.pendingTransfer!.id);
            await loadTickets();
          } catch {
            Alert.alert(t('transfer_unavailable'), t('please_try_again'));
          }
        },
      },
    ]);
  };

  const openApple = async (ticket: Ticket) => {
    if (Platform.OS !== 'web') return;
    const response = await fetch(ticketsService.applePassUrl(ticket.id));
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `migo-${ticket.id}.pkpass`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openGoogle = async (ticket: Ticket) => {
    try {
      await Linking.openURL(await ticketsService.googlePassUrl(ticket.id));
    } catch {
      Alert.alert(t('transfer_unavailable'), t('please_try_again'));
    }
  };

  const cancelTicket = (ticket: Ticket) => {
    Alert.alert(t('cancel_ticket'), t('cancel_ticket_help', { title: ticket.event.title }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('cancel_ticket'),
        style: 'destructive',
        onPress: async () => {
          try {
            await ticketsService.cancelTicket(ticket.id);
            await loadTickets();
          } catch {
            Alert.alert(t('unable_cancel'), t('please_try_again'));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('wallet')}</Text>
        <Ionicons name="wallet-outline" size={25} color={colors.primary} />
      </View>
      {offline ? <Text style={styles.offline}>{t('offline_saved_tickets')}</Text> : null}
      <FlatList<Ticket>
        data={tickets}
        keyExtractor={(ticket: Ticket) => ticket.id}
        renderItem={({ item }: { item: Ticket }) => (
          <TicketCard
            ticket={item}
            onCancel={cancelTicket}
            onTransfer={transferTicket}
            onCancelTransfer={cancelTransfer}
            onApple={openApple}
            onGoogle={openGoogle}
            capabilities={capabilities}
            t={t}
          />
        )}
        contentContainerStyle={tickets.length ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadTickets(true)} />}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="ticket-outline" size={48} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{t('no_tickets')}</Text>
            <Text style={styles.emptyText}>{t('no_tickets_help')}</Text>
            <GradientButton label={t('browse_events')} onPress={() => navigateToTab('Events')} />
          </View>
        )}
      />
      <Modal visible={Boolean(recipientTicket)} transparent animationType="fade" onRequestClose={() => setRecipientTicket(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('transfer_ticket')}</Text>
            <TextInput
              style={styles.input}
              value={recipientEmail}
              onChangeText={setRecipientEmail}
              placeholder={t('recipient_email')}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setRecipientTicket(null)}><Text>{t('cancel')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => void submitTransfer()}><Text style={styles.actionText}>{t('send_to_whatsapp')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: colors.surface,
  },
  headerTitle: { ...type.h1 },
  list: { padding: 16, gap: 16 },
  emptyList: { flexGrow: 1, padding: 24 },
  card: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  coverImage: {
    width: '100%',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { padding: spacing.lg },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { color: colors.primary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.successSoft },
  usedBadge: { backgroundColor: colors.border },
  statusText: { color: colors.success, fontSize: 12, fontWeight: '700' },
  title: { marginTop: 8, ...type.h2 },
  meta: { marginTop: 5, color: colors.textSecondary, fontSize: 14 },
  quantity: { marginTop: 12, color: colors.text, fontSize: 14, fontWeight: '600' },
  price: { marginTop: 6, color: colors.primary, fontSize: 14, fontWeight: '700' },
  perforation: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -spacing.lg, marginTop: spacing.lg },
  perforationCircleLeft: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.bg, marginLeft: -9 },
  perforationCircleRight: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.bg, marginRight: -9 },
  perforationLine: { flex: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
  qrSection: { alignItems: 'center', gap: 8, paddingVertical: 18, marginTop: 0 },
  qrFrame: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  code: { maxWidth: '100%', color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  cancelButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 14 },
  cancelText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  shareTicketButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 14 },
  shareTicketText: { color: colors.success, fontSize: 14, fontWeight: '600' },
  actions: { gap: 10, marginTop: 14 },
  actionButton: { paddingVertical: 10, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: 'center' },
  actionText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  pendingText: { color: colors.warning, fontSize: 13, textAlign: 'center' },
  cancelTransferButton: { alignItems: 'center' },
  offline: { paddingHorizontal: 16, paddingVertical: 8, color: colors.warning, backgroundColor: colors.warningSoft, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: { padding: 20, borderRadius: 16, backgroundColor: colors.textInverse },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  input: { marginTop: 16, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 },
  emptyTitle: { marginTop: 16, fontSize: 20, fontWeight: '700', color: colors.textSecondary },
  emptyText: { marginTop: 6, color: colors.textMuted, textAlign: 'center' },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
