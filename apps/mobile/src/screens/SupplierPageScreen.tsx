import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { Event } from '@migo/shared';
import { useLocale } from '../i18n';
import { accountTypesService } from '../services/accountTypes.service';
import { navigateToTab } from '../navigation/navigationRef';
import EventCard from '../components/EventCard';
import {
  AdminBackButton,
  AdminHeader,
  AdminShell,
  EmptyState,
} from '../components/AdminAnalyticsUI';
import { colors, radius, type } from '../theme';

type SupplierPageData = {
  supplier: {
    name: string;
    description: string | null;
    logo: string | null;
    banner: string | null;
    website: string | null;
    slug: string | null;
    verified: boolean;
  };
  events: Event[];
};

export default function SupplierPageScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const slug = route.params?.slug as string;
  const { t, isRTL } = useLocale();
  const [page, setPage] = useState<SupplierPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setPage(await accountTypesService.publicSupplier(slug));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  return (
    <AdminShell>
      <AdminBackButton
        label={t('back')}
        rtl={isRTL}
        onPress={() => navigation.canGoBack() ? navigation.goBack() : navigateToTab('Events')}
      />
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {failed ? <EmptyState label={t('supplier_page_not_found')} /> : null}
      {page ? (
        <>
          {page.supplier.banner ? <Image source={{ uri: page.supplier.banner }} style={styles.banner} /> : null}
          <View style={styles.supplierHeader}>
            {page.supplier.logo ? <Image source={{ uri: page.supplier.logo }} style={styles.logo} /> : (
              <View style={styles.logoFallback}><Ionicons name="storefront-outline" size={28} color={colors.primary} /></View>
            )}
            <View style={styles.supplierCopy}>
              <View style={styles.nameRow}>
                <AdminHeader title={page.supplier.name} />
                {page.supplier.verified ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : null}
              </View>
              {page.supplier.description ? <Text style={styles.description}>{page.supplier.description}</Text> : null}
              {page.supplier.website ? (
                <TouchableOpacity style={styles.websiteButton} onPress={() => void Linking.openURL(page.supplier.website!)}>
                  <Ionicons name="globe-outline" size={17} color={colors.primary} />
                  <Text style={styles.websiteText}>{t('supplier_visit_website')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <AdminHeader title={t('supplier_events')} subtitle={t('supplier_events_subtitle')} />
          {page.events.length ? (
            <View style={styles.eventGrid}>
              {page.events.map(event => (
                <EventCard
                  key={event.id}
                  event={event}
                  onPress={() => navigateToTab('Events', 'EventDetail', { eventId: event.id })}
                />
              ))}
            </View>
          ) : <EmptyState label={t('supplier_no_events')} />}
        </>
      ) : null}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  banner: { width: '100%', height: 260, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt },
  supplierHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 18, marginVertical: 22 },
  logo: { width: 88, height: 88, borderRadius: radius.lg },
  logoFallback: { width: 88, height: 88, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  supplierCopy: { flex: 1, gap: 8, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  description: { ...type.body },
  websiteButton: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingVertical: 6 },
  websiteText: { color: colors.primary, fontWeight: '700' },
  eventGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
});
