import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocale } from '../i18n';
import { useUserStore } from '../store/userStore';
import { isAdmin } from '../services/auth.service';
import {
  accountTypesService,
  SupplierProfile,
} from '../services/accountTypes.service';
import { SupplierPackage } from '../services/admin.service';
import { uploadService } from '../services/upload.service';
import {
  ActionButton,
  AdminBackButton,
  AdminHeader,
  AdminShell,
  EmptyState,
  KpiCard,
  KpiGrid,
  Panel,
  RangeSelector,
  SectionTitle,
  StatusPill,
  AdminRangeDays,
} from '../components/AdminAnalyticsUI';
import { colors, radius, type } from '../theme';

type SupplierEvent = {
  id: string;
  title: string;
  startDate: string;
  coverImage?: string | null;
  status: string;
  supplierRank?: number | null;
  bannedReason?: string | null;
};

export default function SupplierPortalScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t, locale, isRTL } = useLocale();
  const { user } = useUserStore();
  const canSelectSupplier = isAdmin(user);
  const routeSupplierId = route.params?.supplierId as string | undefined;
  const [supplierIdInput, setSupplierIdInput] = useState(routeSupplierId || '');
  const supplierId = routeSupplierId || (canSelectSupplier ? supplierIdInput.trim() || undefined : undefined);
  const [profile, setProfile] = useState<SupplierProfile | null>(null);
  const [events, setEvents] = useState<SupplierEvent[]>([]);
  const [report, setReport] = useState<any>(null);
  const [packages, setPackages] = useState<SupplierPackage[]>([]);
  const [feedFormat, setFeedFormat] = useState<any>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logo, setLogo] = useState('');
  const [banner, setBanner] = useState('');
  const [website, setWebsite] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [rangeDays, setRangeDays] = useState<AdminRangeDays>(30);
  const [selectedPackage, setSelectedPackage] = useState('');
  const [formatOpen, setFormatOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [noSupplier, setNoSupplier] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNoSupplier(false);
    try {
      const [supplier, supplierEvents, supplierReport, supplierPackages, format] = await Promise.all([
        accountTypesService.supplierProfile(supplierId),
        accountTypesService.supplierEvents(supplierId),
        accountTypesService.supplierReport(rangeDays, supplierId),
        accountTypesService.supplierPackages(supplierId),
        accountTypesService.feedFormat(supplierId),
      ]);
      setProfile(supplier);
      setEvents(supplierEvents);
      setReport(supplierReport);
      setPackages(supplierPackages);
      setFeedFormat(format);
      setName(supplier.name || '');
      setDescription(supplier.description || '');
      setLogo(supplier.logo || '');
      setBanner(supplier.banner || '');
      setWebsite(supplier.website || '');
      setContactName(supplier.contactName || '');
      setContactEmail(supplier.contactEmail || '');
      setContactPhone(supplier.contactPhone || '');
      setFeedUrl(supplier.feedUrl || '');
      setSelectedPackage(current => current || supplierPackages[0]?.key || '');
    } catch (loadError: any) {
      if (loadError?.response?.data?.code === 'NO_SUPPLIER') {
        setNoSupplier(true);
      } else {
        setError(loadError?.response?.data?.error || t('supplier_load_failed'));
      }
    } finally {
      setLoading(false);
    }
  }, [rangeDays, supplierId, t]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const saveProfile = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await accountTypesService.updateSupplierProfile({
        name: name.trim(),
        description: description.trim() || null,
        logo: logo || null,
        banner: banner || null,
        website: website.trim() || null,
        contactName: contactName.trim() || null,
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
      }, supplierId);
      setProfile(updated);
      setError(t('supplier_profile_saved'));
    } catch (saveError: any) {
      setError(saveError?.response?.data?.error || t('supplier_save_failed'));
    } finally {
      setBusy(false);
    }
  };

  const saveFeed = async () => {
    setBusy(true);
    setError('');
    try {
      await accountTypesService.setFeedUrl(feedUrl.trim() || null, supplierId);
      await load();
      setError(t('supplier_feed_saved'));
    } catch (saveError: any) {
      setError(saveError?.response?.data?.error || t('supplier_feed_save_failed'));
    } finally {
      setBusy(false);
    }
  };

  const syncFeed = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await accountTypesService.syncFeed(supplierId);
      await load();
      setError(t('supplier_sync_result', result));
    } catch (syncError: any) {
      setError(syncError?.response?.data?.error || t('supplier_sync_failed'));
    } finally {
      setBusy(false);
    }
  };

  const moveEvent = (index: number, destination: number) => {
    setEvents(current => {
      if (index === destination || destination < 0 || destination >= current.length) return current;
      const next = [...current];
      const [event] = next.splice(index, 1);
      next.splice(destination, 0, event);
      return next;
    });
  };

  const saveOrder = async () => {
    setBusy(true);
    try {
      await accountTypesService.saveEventOrder(events.map(event => event.id), supplierId);
      await load();
      setError(t('supplier_order_saved'));
    } catch (orderError: any) {
      setError(orderError?.response?.data?.error || t('supplier_order_failed'));
    } finally {
      setBusy(false);
    }
  };

  const pickImage = async (target: 'logo' | 'banner') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: target === 'logo' ? [1, 1] : [16, 9],
    });
    if (result.canceled || !result.assets[0]) return;
    try {
      const asset = result.assets[0];
      const uploaded = await uploadService.uploadImage(asset.uri, {
        name: asset.fileName || `${target}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      if (target === 'logo') setLogo(uploaded);
      else setBanner(uploaded);
    } catch {
      Alert.alert(t('supplier_upload_failed'), t('please_try_again'));
    }
  };

  const requestCampaign = async (packageKey: string) => {
    setBusy(true);
    try {
      const item = packages.find(entry => entry.key === packageKey);
      await accountTypesService.requestCampaign({
        packageKey,
        startsAt: new Date().toISOString(),
        ...(item?.effect && events[0]?.id ? { eventId: events[0].id } : {}),
      }, supplierId);
      setError(t('supplier_boost_requested'));
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || t('supplier_boost_failed'));
    } finally {
      setBusy(false);
    }
  };

  const metrics = report || {};
  const rangeLabels = {
    7: t('admin_range_7d'),
    30: t('admin_range_30d'),
    90: t('admin_range_90d'),
  };
  const selectedPackageItem = useMemo(
    () => packages.find(item => item.key === selectedPackage),
    [packages, selectedPackage],
  );

  if (loading && !profile && !noSupplier) {
    return <AdminShell><View style={styles.loading}><ActivityIndicator color={colors.primary} /></View></AdminShell>;
  }

  return (
    <AdminShell>
      <AdminBackButton label={t('back')} rtl={isRTL} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ProfileMain')} />
      <AdminHeader title={t('supplier_portal')} subtitle={t('supplier_portal_subtitle')} />
      {canSelectSupplier ? (
        <Panel>
          <SectionTitle title={t('supplier_select_profile')} subtitle={t('supplier_select_profile_help')} />
          <View style={styles.inlineForm}>
            <TextInput style={[styles.input, styles.flexInput]} value={supplierIdInput} onChangeText={setSupplierIdInput} placeholder={t('supplier_id')} placeholderTextColor={colors.textMuted} />
            <ActionButton label={t('supplier_load')} onPress={() => void load()} />
          </View>
        </Panel>
      ) : null}
      {noSupplier ? <EmptyState label={t('supplier_no_profile')} /> : null}
      {profile ? (
        <>
          <Panel>
            <SectionTitle title={t('supplier_profile')} subtitle={t('supplier_profile_help')} />
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t('supplier_name')} placeholderTextColor={colors.textMuted} />
            <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder={t('supplier_description')} placeholderTextColor={colors.textMuted} multiline />
            <View style={styles.imageRow}>
              <TouchableOpacity style={styles.imagePicker} onPress={() => void pickImage('logo')}>
                {logo ? <Image source={{ uri: logo }} style={styles.logoPreview} /> : <Ionicons name="image-outline" size={22} color={colors.primary} />}
                <Text style={styles.imagePickerText}>{t('supplier_logo')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.imagePicker, styles.bannerPicker]} onPress={() => void pickImage('banner')}>
                {banner ? <Image source={{ uri: banner }} style={styles.bannerPreview} /> : <Ionicons name="image-outline" size={22} color={colors.primary} />}
                <Text style={styles.imagePickerText}>{t('supplier_banner')}</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.input} value={website} onChangeText={setWebsite} placeholder={t('supplier_website')} placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="url" />
            <TextInput style={styles.input} value={contactName} onChangeText={setContactName} placeholder={t('supplier_contact_name')} placeholderTextColor={colors.textMuted} />
            <TextInput style={styles.input} value={contactEmail} onChangeText={setContactEmail} placeholder={t('supplier_contact_email')} placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" />
            <TextInput style={styles.input} value={contactPhone} onChangeText={setContactPhone} placeholder={t('supplier_contact_phone')} placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />
            <ActionButton label={busy ? t('loading') : t('save')} disabled={busy} onPress={() => void saveProfile()} />
          </Panel>

          <Panel>
            <SectionTitle title={t('supplier_feed')} subtitle={t('supplier_feed_help')} />
            <TextInput style={styles.input} value={feedUrl} onChangeText={setFeedUrl} placeholder="https://example.com/events.json" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="url" />
            <View style={styles.actionRow}>
              <ActionButton label={t('save')} disabled={busy} onPress={() => void saveFeed()} />
              <ActionButton label={t('supplier_sync_now')} icon="↻" secondary disabled={busy || !profile.feedUrl} onPress={() => void syncFeed()} />
              <TouchableOpacity style={styles.formatToggle} onPress={() => setFormatOpen(value => !value)}>
                <Text style={styles.formatToggleText}>{t('supplier_feed_format')}</Text>
                <Ionicons name={formatOpen ? 'chevron-up' : 'chevron-down'} size={17} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.feedStatus}>{profile.feedLastSyncAt ? t('supplier_last_sync', { date: new Date(profile.feedLastSyncAt).toLocaleString(locale === 'ar' ? 'ar-AE' : 'en-AE') }) : t('supplier_never_synced')}</Text>
            {profile.feedLastStatus ? <Text style={styles.feedStatus}>{profile.feedLastStatus}</Text> : null}
            {formatOpen ? <Text style={styles.codeBlock}>{JSON.stringify(feedFormat?.example || {}, null, 2)}</Text> : null}
          </Panel>

          <Panel>
            <SectionTitle title={t('supplier_event_order')} subtitle={t('supplier_event_order_help')} />
            {events.length ? events.map((event, index) => (
              <View key={event.id} style={styles.eventRow}>
                {event.coverImage ? <Image source={{ uri: event.coverImage }} style={styles.eventImage} /> : null}
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
                  <Text style={styles.eventDate}>{new Date(event.startDate).toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-AE')}</Text>
                  {event.status === 'BANNED' ? <Text style={styles.bannedText}>{t('supplier_event_banned')}{event.bannedReason ? ` · ${event.bannedReason}` : ''}</Text> : null}
                </View>
                <View style={styles.orderButtons}>
                  <TouchableOpacity accessibilityLabel={t('supplier_move_to_top')} onPress={() => moveEvent(index, 0)}><Ionicons name="chevron-up-circle" size={22} color={colors.primary} /></TouchableOpacity>
                  <TouchableOpacity accessibilityLabel={t('supplier_move_up')} onPress={() => moveEvent(index, index - 1)}><Ionicons name={isRTL ? 'arrow-forward-circle' : 'arrow-up-circle'} size={22} color={colors.textSecondary} /></TouchableOpacity>
                  <TouchableOpacity accessibilityLabel={t('supplier_move_down')} onPress={() => moveEvent(index, index + 1)}><Ionicons name={isRTL ? 'arrow-back-circle' : 'arrow-down-circle'} size={22} color={colors.textSecondary} /></TouchableOpacity>
                </View>
              </View>
            )) : <EmptyState label={t('supplier_no_events')} />}
            <ActionButton label={busy ? t('loading') : t('supplier_save_order')} disabled={busy} onPress={() => void saveOrder()} />
          </Panel>

          <Panel>
            <SectionTitle
              title={t('supplier_reports')}
              trailing={<RangeSelector value={rangeDays} onChange={setRangeDays} labels={rangeLabels} />}
            />
            <KpiGrid>
              <KpiCard label={t('admin_clicks')} value={metrics.clicks ?? 0} icon="↗" />
              <KpiCard label={t('admin_views')} value={metrics.views ?? 0} icon="◉" />
              <KpiCard label="CTR" value={`${(Number(metrics.ctr || 0) * 100).toFixed(1)}%`} icon="%" />
              <KpiCard label={t('admin_bookings')} value={metrics.bookings ?? 0} icon="▣" />
              <KpiCard label={t('admin_tickets')} value={metrics.tickets ?? 0} icon="▤" />
            </KpiGrid>
            <View style={styles.actionRow}>
              <ActionButton label={t('admin_export_csv')} icon="↓" secondary onPress={() => void accountTypesService.downloadSupplierReport(rangeDays, `supplier-report-${profile.slug || profile.id}-${rangeDays}d.csv`, supplierId)} />
              {profile.slug ? <ActionButton label={t('supplier_view_public_page')} onPress={() => navigation.navigate('SupplierPage', { slug: profile.slug })} /> : null}
            </View>
          </Panel>

          <Panel>
            <SectionTitle title={t('supplier_boosts')} subtitle={t('supplier_boosts_help')} />
            <View style={styles.packageList}>
              {packages.map(item => {
                const packageName = locale === 'ar' ? item.nameAr : item.name;
                return (
                  <TouchableOpacity key={item.key} onPress={() => setSelectedPackage(item.key)} style={[styles.packageCard, selectedPackage === item.key && styles.packageCardSelected]}>
                    <Text style={styles.packageName}>{packageName}</Text>
                    <Text style={styles.packageDescription}>{locale === 'ar' ? item.descriptionAr : item.description}</Text>
                    <Text style={styles.packagePrice}>{t('plans_price', { price: item.priceAed })}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {selectedPackageItem ? <ActionButton label={busy ? t('loading') : t('supplier_request_boost')} disabled={busy} onPress={() => void requestCampaign(selectedPackageItem.key)} /> : null}
          </Panel>
        </>
      ) : null}
      {error ? <Text style={styles.notice}>{error}</Text> : null}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 320, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 13, color: colors.ink, backgroundColor: colors.bg, marginBottom: 10 },
  flexInput: { flex: 1 },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
  inlineForm: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  imageRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  imagePicker: { minHeight: 88, minWidth: 100, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  bannerPicker: { flex: 1 },
  logoPreview: { width: 44, height: 44, borderRadius: 22 },
  bannerPreview: { width: 72, height: 44, borderRadius: radius.sm },
  imagePickerText: { ...type.label },
  actionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  formatToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 },
  formatToggleText: { color: colors.primary, fontWeight: '700' },
  feedStatus: { ...type.caption, marginTop: 8 },
  codeBlock: { fontFamily: 'monospace', fontSize: 12, color: colors.textSecondary, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 14, marginTop: 12 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  eventImage: { width: 58, height: 52, borderRadius: radius.sm },
  eventInfo: { flex: 1, minWidth: 0 },
  eventTitle: { ...type.label, color: colors.ink },
  eventDate: { ...type.caption, marginTop: 4 },
  bannedText: { color: colors.danger, fontSize: 12, marginTop: 4 },
  orderButtons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  packageList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  packageCard: { flex: 1, minWidth: 220, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.bg },
  packageCardSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  packageName: { ...type.h3 },
  packageDescription: { ...type.caption, marginTop: 6 },
  packagePrice: { color: colors.primary, fontWeight: '800', marginTop: 10 },
  notice: { ...type.caption, color: colors.primary, paddingVertical: 10 },
});
