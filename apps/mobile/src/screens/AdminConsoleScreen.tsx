import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useLocale } from '../i18n';
import { navigateToTab } from '../navigation/navigationRef';
import {
  AdminHeader,
  AdminBackButton,
  AdminShell,
  ActionButton,
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
  SupplierOverview,
  SupplierPackage,
  SupplierStatus,
  SupplierSummary,
} from '../services/admin.service';
import { colors, radius, type } from '../theme';

type StatusFilter = 'ALL' | SupplierStatus;

export default function AdminConsoleScreen() {
  const navigation = useNavigation<any>();
  const { t, locale, isRTL } = useLocale();
  const { width } = useWindowDimensions();
  const desktop = width >= 960;
  const [rangeDays, setRangeDays] = useState<AdminRangeDays>(30);
  const [overview, setOverview] = useState<SupplierOverview | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([]);
  const [packages, setPackages] = useState<SupplierPackage[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const range = makeAdminRange(rangeDays);
      const [summary, supplierRows, packageRows] = await Promise.all([
        adminService.overview(range),
        adminService.suppliers(range),
        adminService.packages(),
      ]);
      setOverview(summary);
      setSuppliers(supplierRows);
      setPackages(packageRows);
    } catch {
      Alert.alert(t('admin_error_title'), t('admin_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [rangeDays, t]);

  useEffect(() => { void load(); }, [load]);

  const filteredSuppliers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return suppliers.filter(supplier => {
      const matchesText = !query || `${supplier.name} ${supplier.label} ${supplier.labelAr} ${supplier.sourceKey}`.toLowerCase().includes(query);
      return matchesText && (statusFilter === 'ALL' || supplier.status === statusFilter);
    });
  }, [search, statusFilter, suppliers]);

  const rangeLabels = {
    7: t('admin_range_7d'),
    30: t('admin_range_30d'),
    90: t('admin_range_90d'),
  };
  const statusOptions: Array<{ key: StatusFilter; label: string }> = [
    { key: 'ALL', label: t('admin_status_all') },
    { key: 'ACTIVE', label: t('admin_status_active') },
    { key: 'PROSPECT', label: t('admin_status_prospect') },
    { key: 'PAUSED', label: t('admin_status_paused') },
  ];

  const money = (value: number | string) => `AED ${Number(value || 0).toLocaleString()}`;
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
  const statusLabel = (status: SupplierStatus) => ({
    ACTIVE: t('admin_status_active'),
    PROSPECT: t('admin_status_prospect'),
    PAUSED: t('admin_status_paused'),
  }[status]);
  const displaySupplierName = (supplier: SupplierSummary) =>
    locale === 'ar' ? supplier.labelAr || supplier.name : supplier.label || supplier.name;

  const openSupplier = (supplier: SupplierSummary) => {
    navigation.navigate('AdminSupplier', { supplierId: supplier.id });
  };

  const renderSupplier = (supplier: SupplierSummary) => {
    if (desktop) {
      return (
        <TouchableOpacity
          key={supplier.id}
          accessibilityRole="button"
          onPress={() => openSupplier(supplier)}
          style={styles.tableRow}
        >
          <View style={styles.supplierCell}>
            <Text numberOfLines={1} style={styles.supplierName}>{displaySupplierName(supplier)}</Text>
            <Text numberOfLines={1} style={styles.supplierKey}>{supplier.sourceKey}</Text>
          </View>
          <View style={styles.statusCell}><StatusPill value={supplier.status} label={statusLabel(supplier.status)} /></View>
          <Text style={styles.tableNumber}>{supplier.eventsListed}</Text>
          <Text style={styles.tableNumber}>{supplier.upcomingEvents}</Text>
          <Text style={styles.tableNumber}>{supplier.clicks.toLocaleString()}</Text>
          <Text style={styles.tableNumber}>{(supplier.ctr * 100).toFixed(1)}%</Text>
          <Text style={[styles.tableNumber, { flex: 1.2 }]}>{formatRevenueByCurrency(supplier.revenueByCurrency)}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        key={supplier.id}
        accessibilityRole="button"
        onPress={() => openSupplier(supplier)}
        style={styles.supplierCard}
      >
        <View style={styles.supplierCardTop}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.supplierName}>{displaySupplierName(supplier)}</Text>
            <Text numberOfLines={1} style={styles.supplierKey}>{supplier.sourceKey}</Text>
          </View>
          <StatusPill value={supplier.status} label={statusLabel(supplier.status)} />
        </View>
        <View style={styles.supplierStats}>
          <Text style={styles.supplierStat}>{supplier.clicks.toLocaleString()} <Text style={styles.statLabel}>{t('admin_clicks')}</Text></Text>
          <Text style={styles.supplierStat}>{supplier.upcomingEvents} <Text style={styles.statLabel}>{t('admin_upcoming')}</Text></Text>
          <Text style={styles.supplierStat}>{(supplier.ctr * 100).toFixed(1)}% <Text style={styles.statLabel}>CTR</Text></Text>
        </View>
        <View style={styles.supplierCardBottom}>
          <Text style={styles.supplierRevenue}>{formatRevenueByCurrency(supplier.revenueByCurrency)}</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.primary} />
        </View>
      </TouchableOpacity>
    );
  };

  const overviewTotals = overview?.totals;

  return (
    <AdminShell>
      <AdminBackButton
        label={t('back')}
        rtl={isRTL}
        onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigateToTab('Profile', 'ProfileMain'))}
      />
      <AdminHeader
        title={t('admin_console')}
        subtitle={t('admin_console_subtitle')}
        trailing={
          <RangeSelector value={rangeDays} onChange={setRangeDays} labels={rangeLabels} />
        }
      />

      {loading && !overview ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <>
          <KpiGrid>
            <KpiCard label={t('admin_clicks')} value={overviewTotals?.clicks.toLocaleString() || '0'} icon="↗" />
            <KpiCard label={t('admin_unique_clickers')} value={overviewTotals?.uniqueClickers.toLocaleString() || '0'} icon="◎" />
            <KpiCard label={t('admin_impressions')} value={overviewTotals?.impressions.toLocaleString() || '0'} icon="◉" />
            <KpiCard label={t('admin_views')} value={overviewTotals?.views.toLocaleString() || '0'} icon="◎" />
            <KpiCard label={t('admin_bookings')} value={overviewTotals?.bookings.toLocaleString() || '0'} icon="✓" />
            <KpiCard label={t('admin_tickets')} value={overviewTotals?.tickets.toLocaleString() || '0'} icon="▣" />
            <KpiCard label={t('admin_revenue')} value={formatRevenueByCurrency(overviewTotals?.revenueByCurrency)} icon="د.إ" />
            <KpiCard label={t('admin_active_campaigns')} value={overviewTotals?.activeCampaigns || 0} icon="✦" />
            <KpiCard label={t('admin_campaign_revenue')} value={money(overviewTotals?.activeCampaignRevenue || 0)} icon="AED" />
          </KpiGrid>

          <ClicksChart
            data={overview?.clicksByDay || []}
            title={t('admin_daily_clicks')}
            labels={{ clicks: t('admin_clicks'), bookings: t('admin_daily_bookings') }}
          />

          <Panel>
            <SectionTitle
              title={t('admin_suppliers')}
              subtitle={t('admin_supplier_count', { count: filteredSuppliers.length })}
              trailing={
                <ActionButton
                  label={t('admin_search_insights')}
                  icon="⌕"
                  secondary
                  onPress={() => navigation.navigate('AdminSearchInsights')}
                />
              }
            />
            <View style={styles.filtersRow}>
              <View style={styles.searchBox}>
                <Ionicons name="search-outline" size={18} color={colors.textMuted} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('admin_search_suppliers')}
                  placeholderTextColor={colors.textMuted}
                  style={styles.searchInput}
                  accessibilityLabel={t('admin_search_suppliers')}
                />
              </View>
              <View style={styles.statusFilters}>
                {statusOptions.map(option => (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => setStatusFilter(option.key)}
                    style={[styles.filterChip, statusFilter === option.key && styles.filterChipSelected]}
                  >
                    <Text style={[styles.filterText, statusFilter === option.key && styles.filterTextSelected]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {desktop ? (
              <View style={styles.table}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeading, { flex: 2.6 }]}>{t('admin_supplier')}</Text>
                  <Text style={[styles.tableHeading, { flex: 1.3 }]}>{t('admin_status')}</Text>
                  <Text style={styles.tableHeading}>{t('admin_events')}</Text>
                  <Text style={styles.tableHeading}>{t('admin_upcoming')}</Text>
                  <Text style={styles.tableHeading}>{t('admin_clicks')}</Text>
                  <Text style={styles.tableHeading}>CTR</Text>
                  <Text style={[styles.tableHeading, { flex: 1.2 }]}>{t('admin_revenue')}</Text>
                  <View style={{ width: 18 }} />
                </View>
                {filteredSuppliers.map(renderSupplier)}
                {!filteredSuppliers.length ? <EmptyState label={t('admin_no_suppliers')} /> : null}
              </View>
            ) : (
              <View style={styles.mobileSupplierList}>
                {filteredSuppliers.map(renderSupplier)}
                {!filteredSuppliers.length ? <EmptyState label={t('admin_no_suppliers')} /> : null}
              </View>
            )}
          </Panel>

          <Panel>
            <SectionTitle title={t('admin_packages')} subtitle={t('admin_packages_subtitle')} />
            <View style={styles.packageGrid}>
              {packages.map(item => (
                <View key={item.key} style={styles.packageCard}>
                  <View style={styles.packageTop}>
                    <Text style={styles.packageName}>{locale === 'ar' ? item.nameAr : item.name}</Text>
                    <Text style={styles.packagePrice}>{money(item.priceAed)}</Text>
                  </View>
                  <Text style={styles.packageUnit}>{packageUnitLabel(item.unit)}</Text>
                  <Text style={styles.packageDescription}>{locale === 'ar' ? item.descriptionAr : item.description}</Text>
                  {item.effect ? <Text style={styles.packageTag}>{t('admin_event_boost')}</Text> : null}
                </View>
              ))}
            </View>
          </Panel>

          <Panel style={styles.bottomPanel}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bottomTitle}>{t('admin_top_searches')}</Text>
              <Text style={styles.sectionSubtitle}>{t('admin_top_searches_subtitle')}</Text>
              <View style={styles.searchPills}>
                {overview?.topSearches.slice(0, 5).map(item => (
                  <View key={item.query} style={styles.searchPill}>
                    <Text style={styles.searchPillText}>{item.query}</Text>
                    <Text style={styles.searchPillCount}>{item.count}</Text>
                  </View>
                ))}
              </View>
            </View>
            <ActionButton label={t('admin_open_insights')} onPress={() => navigation.navigate('AdminSearchInsights')} />
          </Panel>
        </>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 280, alignItems: 'center', justifyContent: 'center' },
  filtersRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 },
  searchBox: { minHeight: 44, maxWidth: 380, flex: 1, minWidth: 220, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.bg, paddingHorizontal: 12 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, color: colors.text, paddingVertical: 10, outlineStyle: 'none' as any },
  statusFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  filterChipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  filterText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  filterTextSelected: { color: colors.primary },
  table: { width: '100%' },
  tableHeader: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHeading: { flex: 1, fontSize: 11, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  tableRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  supplierCell: { flex: 2.6, minWidth: 0 },
  supplierName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  supplierKey: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  statusCell: { flex: 1.3 },
  tableNumber: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  mobileSupplierList: { gap: 10 },
  supplierCard: { padding: 15, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  supplierCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  supplierStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, paddingVertical: 14, marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, borderBottomWidth: 1, borderBottomColor: colors.border },
  supplierStat: { fontSize: 14, fontWeight: '800', color: colors.ink },
  statLabel: { fontSize: 11, fontWeight: '500', color: colors.textMuted },
  supplierCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 },
  supplierRevenue: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  packageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  packageCard: { flexBasis: '32%', flexGrow: 1, minWidth: 220, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 16 },
  packageTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  packageName: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '800' },
  packagePrice: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  packageUnit: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  packageDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 12 },
  packageTag: { alignSelf: 'flex-start', marginTop: 12, color: colors.info, backgroundColor: colors.infoSoft, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '800' },
  bottomPanel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 18 },
  bottomTitle: { ...type.h3, marginBottom: 4 },
  sectionSubtitle: { ...type.caption },
  searchPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  searchPill: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.bg, paddingHorizontal: 12, paddingVertical: 8 },
  searchPillText: { color: colors.textSecondary, fontSize: 12 },
  searchPillCount: { color: colors.primary, fontSize: 11, fontWeight: '800' },
});
