import { colors } from '../theme';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ticketsService } from '../services/tickets.service';
import { formatEventDate, useLocale } from '../i18n';
import { navigateToTab } from '../navigation/navigationRef';

type Props = NativeStackScreenProps<any, 'ClaimTicket'>;

export default function ClaimTicketScreen({ route }: Props) {
  const { t } = useLocale();
  const code = String(route.params?.code || '');
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof ticketsService.getTransfer>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  const load = useCallback(async () => {
    try {
      setPreview(await ticketsService.getTransfer(code));
    } catch {
      Alert.alert(t('transfer_unavailable'), t('please_try_again'));
    } finally {
      setLoading(false);
    }
  }, [code, t]);

  useEffect(() => { void load(); }, [load]);

  const accept = async () => {
    setAccepting(true);
    try {
      await ticketsService.acceptTransfer(code);
      Alert.alert(t('ticket_accepted'), t('ticket_added_wallet'));
      navigateToTab('Wallet');
    } catch {
      Alert.alert(t('unable_accept_ticket'), t('please_try_again'));
    } finally {
      setAccepting(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (!preview) return <View style={styles.center}><Text>{t('transfer_unavailable')}</Text></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('claim_ticket')}</Text>
      <Text style={styles.subtitle}>{t('ticket_sent_by', { name: preview.fromName || t('a_friend') })}</Text>
      <View style={styles.card}>
        <Text style={styles.eventTitle}>{preview.eventTitle}</Text>
        <Text style={styles.meta}>{formatEventDate(preview.startDate, { withTime: true })}</Text>
        <Text style={styles.meta}>{preview.venue}</Text>
        <Text style={styles.meta}>{t('transfer_expires', { date: formatEventDate(preview.expiresAt, { withTime: true }) })}</Text>
      </View>
      <TouchableOpacity
        style={[styles.button, (!preview.canAccept || accepting) && styles.disabled]}
        disabled={!preview.canAccept || accepting}
        onPress={accept}
      >
        {accepting ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.buttonText}>{t('accept_ticket')}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  subtitle: { marginTop: 8, color: colors.textSecondary },
  card: { marginTop: 24, padding: 20, borderRadius: 16, backgroundColor: colors.textInverse, borderWidth: 1, borderColor: colors.border },
  eventTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  meta: { marginTop: 10, color: colors.textSecondary },
  button: { marginTop: 24, padding: 15, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: colors.textInverse, fontWeight: '700' },
});
