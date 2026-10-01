import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateField from '../components/DateField';
import {
  ActionButton,
  AdminHeader,
  AdminShell,
  ClicksChart,
  EmptyState,
  KpiCard,
  KpiGrid,
  Panel,
  formatRevenueByCurrency,
  RangeSelector,
  SectionTitle,
  StatusPill,
  makeAdminRange,
  AdminRangeDays,
} from '../components/AdminAnalyticsUI';
import {
  adminService,
  CampaignStatus,
  SupplierCampaign,
  SupplierDetail,
  SupplierPackage,
  SupplierStatus,
} from '../services/admin.service';
import { useLocale } from '../i18n';
import { colors, radius, type } from '../theme';

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function campaignBoundary(date: string, end = false): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0).toISOString();
}

export default function AdminSupplierScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t, locale } = useLocale();
  const supplierId = route.params?.supplierId as string;
  const [rangeDays, setRangeDays] = useState<AdminRangeDays>(30);
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [campaigns, setCampaigns] = useState<SupplierCampaign[]>([]);
  const [packages, setPackages] = useState<SupplierPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<SupplierStatus>('PROSPECT');
  const [packageKey, setPackageKey] = useState('');
  const [eventId, setEventId] = useState('');
  const [campaignStart, setCampaignStart] = useState(localDateString(new Date()));
  const [campaignEnd, setCampaignEnd] = useState(localDateString(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
  const [campaignNotes, setCampaignNotes] = useState('');
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  const range = useMemo(() => makeAdminRange(rangeDays), [rangeDays]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, currentCampaigns, packageRows] = await Promise.all([
        adminService.supplier(supplierId, range),
        adminService.campaigns(supplierId),
        adminService.packages(),
      ]);
      setSupplier(detail);
      setCampaigns(currentCampaigns);
      setPackages(packageRows);
      setContactName(detail.contactName || '');
      setContactEmail(detail.contactEmail || '');
      setContactPhone(detail.contactPhone || '');
      setWebsite(detail.website || '');
      setNotes(detail.notes || '');
      setStatus(detail.status);
      setPackageKey(current => current || packageRows[0]?.key || '');
    } catch {
      Alert.alert(t('admin_error_title'), t('admin_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [range, supplierId, t]);

  useEffect(() => { void load(); }, [load]);

  const selectedPackage = packages.find(item => item.key === packageKey);
  const requiresEvent = Boolean(selectedPackage?.effect);
  const packageUnitLabel = (unit: string) => {
    const key = ({
      week: 'admin_unit_week',
      issue: 'admin_unit_issue',
      campaign: 'admin_unit_campaign',
      month: 'admin_unit_month',
      year: 'admin_unit_year',
    } as Record<string, string>)[unit];
    return key ? t(key as any) : unit;
  };
  const statusOptions: Array<{ key: SupplierStatus; label: string }> = [
    { key: 'ACTIVE', label: t('admin_status_active') },
    { key: 'PROSPECT', label: t('admin_status_prospect') },
    { key: 'PAUSED', label: t('admin_status_paused') },
  ];

  const saveSupplier = async () => {
    setSaving(true);
    try {
      const saved = await adminService.updateSupplier(supplierId, {
        contactName: contactName.trim() || null,
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        website: website.trim() || null,
        notes: notes.trim() || null,
        status,
      });
      setSupplier(current => current ? { ...current, ...saved } : current);
      Alert.alert(t('admin_saved'), t('admin_supplier_saved'));
    } catch {
      Alert.alert(t('admin_error_title'), t('admin_save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const createCampaign = async () => {
    if (!selectedPackage || !campaignStart || !campaignEnd) {
      Alert.alert(t('admin_error_title'), t('admin_campaign_fields_required'));
      return;
    }
    if (requiresEvent && !eventId) {
      Alert.alert(t('admin_error_title'), t('admin_event_required'));
      return;
    }
    setCreatingCampaign(true);
    try {
      const created = await adminService.createCampaign(supplierId, {
        packageKey,
        eventId: eventId || undefined,
        startsAt: campaignBoundary(campaignStart),
        endsAt: campaignBoundary(campaignEnd, true),
        notes: campaignNotes.trim() || null,
      });
      setCampaigns(current => [created, ...current]);
      setEventId('');
      setCampaignNotes('');
      Alert.alert(t('admin_saved'), t('admin_campaign_created'));
    } catch {
      Alert.alert(t('admin_error_title'), t('admin_campaign_failed'));
    } finally {
      setCreatingCampaign(false);
    }
  };

  const changeCampaignStatus = async (campaign: SupplierCampaign, nextStatus: CampaignStatus) => {
    try {
      const updated = await adminService.updateCampaignStatus(campaign.id, nextStatus);
      setCampaigns(current => current.map(item => item.id === updated.id ? updated : item));
      Alert.alert(t('admin_saved'), t('admin_campaign_updated'));
    } catch {
      Alert.alert(t('admin_error_title'), t('admin_campaign_failed'));
    }
  };

  const money = (value: number | string) => `AED ${Number(value || 0).toLocaleString()}`;
  const rangeLabels = {
    7: t('admin_range_7d'),
    30: t('admin_range_30d'),
    90: t('admin_range_90d'),
  };
  const downloadReport = async () => {
    if (!supplier) return;
    try {
      await adminService.downloadSupplierCsv(supplier, range);
    } catch {
      Alert.alert(t('admin_error_title'), t('admin_csv_failed'));
    }
  };

  if (loading && !supplier) {
    return <AdminShell><View style={styles.loading}><ActivityIndicator color={colors.primary} /></View></AdminShell>;
  }
  if (!supplier) {
    return <AdminShell><EmptyState label={t('admin_load_failed')} /></AdminShell>;
  }

  const campaignDate = (date: string) => new Date(date).toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-AE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const platformTotal = Object.values(supplier.clicksByPlatform).reduce((sum, count) => sum + count, 0) || 1;

  return (
    <AdminShell>
      <AdminHeader
        title={locale === 'ar' ? supplier.labelAr || supplier.name : supplier.label || supplier.name}
        subtitle={`${locale === 'ar' ? supplier.labelAr || supplier.label : supplier.label} · ${supplier.sourceKey}`}
        trailing={
          <View style={styles.headerActions}>
            <RangeSelector value={rangeDays} onChange={setRangeDays} labels={rangeLabels} />
            <ActionButton label={t('admin_export_csv')} icon="↓" secondary onPress={() => void downloadReport()} />
          </View>
        }
      />

      <KpiGrid>
        <KpiCard label={t('admin_events_listed')} value={supplier.eventsListed} icon="▦" />
        <KpiCard label={t('admin_upcoming_events')} value={supplier.upcomingEvents} icon="◷" />
        <KpiCard label={t('admin_impressions')} value={supplier.impressions.toLocaleString()} icon="◉" />
        <KpiCard label={t('admin_views')} value={supplier.views.toLocaleString()} icon="◎" />
        <KpiCard label={t('admin_clicks')} value={supplier.clicks.toLocaleString()} icon="↗" />
        <KpiCard label={t('admin_unique_clickers')} value={supplier.uniqueClickers.toLocaleString()} icon="◌" />
        <KpiCard label={t('admin_bookings')} value={supplier.bookings.toLocaleString()} icon="✓" />
        <KpiCard label={t('admin_tickets')} value={supplier.tickets.toLocaleString()} icon="▣" />
        <KpiCard label={t('admin_revenue')} value={formatRevenueByCurrency(supplier.revenueByCurrency)} icon="د.إ" />
        <KpiCard label="CTR" value={`${(supplier.ctr * 100).toFixed(1)}%`} icon="%" />
        <KpiCard label={t('admin_active_campaigns')} value={supplier.activeCampaigns} icon="✦" />
        <KpiCard label={t('admin_saves')} value={supplier.saves.toLocaleString()} icon="♡" />
      </KpiGrid>

      <ClicksChart
        data={supplier.clicksByDay}
        title={t('admin_daily_clicks')}
        labels={{ clicks: t('admin_clicks'), bookings: t('admin_daily_bookings') }}
      />

      <View style={styles.twoColumn}>
        <Panel style={styles.flexPanel}>
          <SectionTitle title={t('admin_platform_breakdown')} />
          {([
            ['app', t('admin_platform_app')],
            ['website', t('admin_platform_website')],
            ['mobile_web', t('admin_platform_mobile_web')],
          ] as const).map(([key, label]) => {
            const count = supplier.clicksByPlatform[key] || 0;
            return (
              <View key={key} style={styles.breakdownRow}>
                <View style={styles.breakdownLabel}><Text style={styles.breakdownName}>{label}</Text><Text style={styles.breakdownCount}>{count.toLocaleString()}</Text></View>
                <View style={styles.progressTrack}><View style={[styles.progressValue, { width: `${Math.min(100, (count / platformTotal) * 100)}%` }]} /></View>
              </View>
            );
          })}
          <View style={styles.placementBlock}>
            <Text style={styles.subsectionTitle}>{t('admin_placement_breakdown')}</Text>
            {supplier.clicksByPlacement.length ? supplier.clicksByPlacement.slice(0, 8).map(item => (
              <View key={item.placement} style={styles.placementRow}>
                <Text numberOfLines={1} style={styles.placementName}>{item.placement}</Text>
                <Text style={styles.breakdownCount}>{item.clicks.toLocaleString()}</Text>
              </View>
            )) : <EmptyState label={t('admin_no_placement_data')} />}
          </View>
        </Panel>

        <Panel style={styles.flexPanel}>
          <SectionTitle title={t('admin_top_searches')} />
          {supplier.topSearchTerms.length ? supplier.topSearchTerms.map((item, index) => (
            <View key={item.query} style={styles.queryRow}>
              <View style={styles.queryRank}><Text style={styles.queryRankText}>{index + 1}</Text></View>
              <Text numberOfLines={1} style={styles.queryText}>{item.query}</Text>
              <Text style={styles.queryCount}>{item.count}</Text>
            </View>
          )) : <EmptyState label={t('admin_no_searches')} />}
        </Panel>
      </View>

      <Panel>
        <SectionTitle title={t('admin_top_events')} subtitle={t('admin_top_events_subtitle')} />
        {supplier.topEvents.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.eventsTable}>
              <View style={styles.eventTableHeader}>
                <Text style={[styles.eventTitleCell, styles.tableLabel]}>{t('admin_event')}</Text>
                <Text style={styles.eventMetricHead}>{t('admin_views')}</Text>
                <Text style={styles.eventMetricHead}>{t('admin_clicks')}</Text>
                <Text style={styles.eventMetricHead}>{t('admin_saves')}</Text>
                <Text style={styles.eventMetricHead}>{t('admin_bookings')}</Text>
                <Text style={styles.eventMetricHead}>{t('admin_tickets')}</Text>
              </View>
              {supplier.topEvents.map(event => (
                <View key={event.id} style={styles.eventTableRow}>
                  <View style={styles.eventTitleCell}>
                    <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
                    <Text style={styles.eventDate}>{campaignDate(event.startDate)}</Text>
                  </View>
                  <Text style={styles.eventMetric}>{event.views}</Text>
                  <Text style={styles.eventMetric}>{event.clicks}</Text>
                  <Text style={styles.eventMetric}>{event.saves}</Text>
                  <Text style={styles.eventMetric}>{event.bookings}</Text>
                  <Text style={styles.eventMetric}>{event.tickets}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : <EmptyState label={t('admin_no_supplier_events')} />}
      </Panel>

      <Panel>
        <SectionTitle title={t('admin_supplier_profile')} subtitle={t('admin_supplier_profile_help')} />
        <View style={styles.profileForm}>
          <View style={styles.fieldColumn}>
            <Text style={styles.fieldLabel}>{t('admin_supplier_status')}</Text>
            <View style={styles.statusOptions}>
              {statusOptions.map(option => (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setStatus(option.key)}
                  style={[styles.statusOption, status === option.key && styles.statusOptionSelected]}
                >
                  <Text style={[styles.statusOptionText, status === option.key && styles.statusOptionTextSelected]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <FormField label={t('admin_contact_name')} value={contactName} onChangeText={setContactName} />
          <FormField label={t('admin_contact_email')} value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" />
          <FormField label={t('admin_contact_phone')} value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />
          <FormField label={t('admin_website')} value={website} onChangeText={setWebsite} autoCapitalize="none" />
          <View style={styles.fieldColumn}>
            <Text style={styles.fieldLabel}>{t('admin_notes')}</Text>
            <TextInput value={notes} onChangeText={setNotes} multiline numberOfLines={4} style={[styles.input, styles.notesInput]} />
          </View>
          <View style={styles.formActions}>
            <ActionButton label={saving ? t('admin_saving') : t('admin_save_changes')} icon="✓" disabled={saving} onPress={() => void saveSupplier()} />
          </View>
        </View>
      </Panel>

      <Panel>
        <SectionTitle title={t('admin_campaigns')} subtitle={t('admin_campaigns_subtitle')} />
        {campaigns.length ? campaigns.map(campaign => {
          const campaignPackage = packages.find(item => item.key === campaign.packageKey);
          return (
            <View key={campaign.id} style={styles.campaignCard}>
              <View style={styles.campaignDetails}>
                <Text style={styles.campaignName}>
                  {(locale === 'ar' ? campaignPackage?.nameAr : campaignPackage?.name) || campaign.packageKey}
                </Text>
                <Text style={styles.campaignMeta}>{campaignDate(campaign.startsAt)} — {campaignDate(campaign.endsAt)} · {money(campaign.priceAed)}</Text>
                {campaign.notes ? <Text style={styles.campaignNotes}>{campaign.notes}</Text> : null}
              </View>
              <StatusPill value={campaign.status} label={t(`admin_campaign_${campaign.status.toLowerCase()}` as any)} />
              <View style={styles.campaignActions}>
                {campaign.status === 'PROPOSED' ? (
                  <>
                    <ActionButton label={t('admin_activate')} onPress={() => void changeCampaignStatus(campaign, 'ACTIVE')} />
                    <ActionButton label={t('admin_cancel')} secondary onPress={() => void changeCampaignStatus(campaign, 'CANCELLED')} />
                  </>
                ) : null}
                {campaign.status === 'ACTIVE' ? (
                  <>
                    <ActionButton label={t('admin_end_campaign')} secondary onPress={() => void changeCampaignStatus(campaign, 'ENDED')} />
                    <ActionButton label={t('admin_cancel')} secondary onPress={() => void changeCampaignStatus(campaign, 'CANCELLED')} />
                  </>
                ) : null}
              </View>
            </View>
          );
        }) : <EmptyState label={t('admin_no_campaigns')} />}
      </Panel>

      <Panel>
        <SectionTitle title={t('admin_propose_campaign')} subtitle={t('admin_propose_campaign_subtitle')} />
        <View style={styles.campaignForm}>
          <Text style={styles.fieldLabel}>{t('admin_choose_package')}</Text>
          <View style={styles.packageChoices}>
            {packages.map(item => (
              <TouchableOpacity
                key={item.key}
                onPress={() => { setPackageKey(item.key); setEventId(''); }}
                style={[styles.packageChoice, packageKey === item.key && styles.packageChoiceSelected]}
              >
                <Text style={[styles.packageChoiceName, packageKey === item.key && styles.packageChoiceTextSelected]}>
                  {locale === 'ar' ? item.nameAr : item.name}
                </Text>
                <Text style={[styles.packageChoicePrice, packageKey === item.key && styles.packageChoiceTextSelected]}>{money(item.priceAed)} / {packageUnitLabel(item.unit)}</Text>
                {item.effect ? <Text style={styles.packageEffect}>{t('admin_event_boost')}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
          {requiresEvent ? (
            <View style={styles.fieldColumn}>
              <Text style={styles.fieldLabel}>{t('admin_campaign_event')}</Text>
              {supplier.upcomingEventOptions.length ? (
                <View style={styles.eventChoices}>
                  {supplier.upcomingEventOptions.map(event => (
                    <TouchableOpacity
                      key={event.id}
                      onPress={() => setEventId(event.id)}
                      style={[styles.eventChoice, eventId === event.id && styles.eventChoiceSelected]}
                    >
                      <Ionicons name={eventId === event.id ? 'radio-button-on' : 'radio-button-off'} size={17} color={eventId === event.id ? colors.primary : colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={styles.eventChoiceTitle}>{event.title}</Text>
                        <Text style={styles.eventDate}>{campaignDate(event.startDate)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : <EmptyState label={t('admin_no_upcoming_events')} />}
            </View>
          ) : null}
          <View style={styles.dateFields}>
            <View style={styles.fieldColumn}>
              <Text style={styles.fieldLabel}>{t('admin_campaign_start')}</Text>
              <DateField value={campaignStart} onChange={setCampaignStart} label={t('admin_campaign_start')} />
            </View>
            <View style={styles.fieldColumn}>
              <Text style={styles.fieldLabel}>{t('admin_campaign_end')}</Text>
              <DateField value={campaignEnd} onChange={setCampaignEnd} minimumDate={campaignStart} label={t('admin_campaign_end')} />
            </View>
          </View>
          {selectedPackage ? (
            <Text style={styles.priceHint}>{t('admin_catalogue_default_price', { price: money(selectedPackage.priceAed), unit: packageUnitLabel(selectedPackage.unit) })}</Text>
          ) : null}
          <View style={styles.fieldColumn}>
            <Text style={styles.fieldLabel}>{t('admin_notes_optional')}</Text>
            <TextInput value={campaignNotes} onChangeText={setCampaignNotes} multiline numberOfLines={3} style={[styles.input, styles.notesInput]} />
          </View>
          <View style={styles.formActions}>
            <ActionButton
              label={creatingCampaign ? t('admin_saving') : t('admin_create_proposal')}
              icon="+"
              disabled={creatingCampaign || !selectedPackage || (requiresEvent && !supplier.upcomingEventOptions.length)}
              onPress={() => void createCampaign()}
            />
          </View>
        </View>
      </Panel>

      <TouchableOpacity accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.backLink}>
        <Ionicons name="arrow-back" size={17} color={colors.primary} />
        <Text style={styles.backLinkText}>{t('back')}</Text>
      </TouchableOpacity>
    </AdminShell>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText(value: string): void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.fieldColumn}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  twoColumn: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  flexPanel: { flex: 1, minWidth: 300 },
  breakdownRow: { marginBottom: 14 },
  breakdownLabel: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  breakdownName: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  breakdownCount: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  progressValue: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill },
  placementBlock: { marginTop: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  subsectionTitle: { ...type.h3, fontSize: 14, marginBottom: 12 },
  placementRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 9 },
  placementName: { color: colors.textSecondary, fontSize: 12, flex: 1 },
  queryRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  queryRank: { width: 24, height: 24, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  queryRankText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  queryText: { flex: 1, color: colors.textSecondary, fontSize: 13 },
  queryCount: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  eventsTable: { minWidth: 760 },
  eventTableHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  eventTableRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  eventTitleCell: { width: 280, paddingRight: 16 },
  tableLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  eventMetricHead: { width: 92, color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  eventMetric: { width: 92, color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  eventTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  eventDate: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  profileForm: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  fieldColumn: { flex: 1, minWidth: 220, gap: 7 },
  fieldLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: colors.text, fontSize: 14 },
  notesInput: { minHeight: 100, textAlignVertical: 'top' },
  statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  statusOption: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 9 },
  statusOptionSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  statusOptionText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  statusOptionTextSelected: { color: colors.primary },
  formActions: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  campaignCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 16 },
  campaignDetails: { flex: 1, minWidth: 220 },
  campaignName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  campaignMeta: { color: colors.textMuted, fontSize: 12, marginTop: 5 },
  campaignNotes: { color: colors.textSecondary, fontSize: 12, marginTop: 5 },
  campaignActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  campaignForm: { gap: 18 },
  packageChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  packageChoice: { flexBasis: '31%', flexGrow: 1, minWidth: 205, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.bg, padding: 13 },
  packageChoiceSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  packageChoiceName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  packageChoicePrice: { color: colors.textMuted, fontSize: 11, marginTop: 5 },
  packageChoiceTextSelected: { color: colors.primary },
  packageEffect: { color: colors.info, fontSize: 10, fontWeight: '700', marginTop: 8 },
  eventChoices: { gap: 7, maxHeight: 260 },
  eventChoice: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  eventChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  eventChoiceTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  dateFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  priceHint: { color: colors.info, fontSize: 12, fontWeight: '700' },
  backLink: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  backLinkText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
});
