import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ActionButton,
  AdminHeader,
  AdminShell,
  AdminRangeDays,
  EmptyState,
  Panel,
  RangeSelector,
  SectionTitle,
  makeAdminRange,
} from '../components/AdminAnalyticsUI';
import { adminService, SearchInsights } from '../services/admin.service';
import { useLocale } from '../i18n';
import { colors, radius, type } from '../theme';

export default function AdminSearchInsightsScreen() {
  const navigation = useNavigation<any>();
  const { t } = useLocale();
  const [rangeDays, setRangeDays] = useState<AdminRangeDays>(30);
  const [insights, setInsights] = useState<SearchInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const range = useMemo(() => makeAdminRange(rangeDays), [rangeDays]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInsights(await adminService.searchInsights(range));
    } catch {
      Alert.alert(t('admin_error_title'), t('admin_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [range, t]);

  useEffect(() => { void load(); }, [load]);

  const labels = {
    7: t('admin_range_7d'),
    30: t('admin_range_30d'),
    90: t('admin_range_90d'),
  };
  const exportCsv = async () => {
    try {
      await adminService.downloadSearchInsightsCsv(range);
    } catch {
      Alert.alert(t('admin_error_title'), t('admin_csv_failed'));
    }
  };

  if (loading && !insights) {
    return <AdminShell><View style={styles.loading}><ActivityIndicator color={colors.primary} /></View></AdminShell>;
  }

  return (
    <AdminShell>
      <AdminHeader
        title={t('admin_search_insights')}
        subtitle={t('admin_search_insights_subtitle')}
        trailing={
          <View style={styles.headerActions}>
            <RangeSelector value={rangeDays} onChange={setRangeDays} labels={labels} />
            <ActionButton label={t('admin_export_csv')} icon="↓" secondary onPress={() => void exportCsv()} />
          </View>
        }
      />

      {!insights ? <EmptyState label={t('admin_load_failed')} /> : (
        <>
          <View style={styles.twoColumn}>
            <Panel style={styles.flexPanel}>
              <SectionTitle title={t('admin_top_queries')} subtitle={t('admin_top_queries_subtitle')} />
              {insights.topQueries.length ? insights.topQueries.slice(0, 15).map((item, index) => (
                <InsightRow key={item.query} index={index + 1} label={item.query} value={item.count} caption={t('admin_unique_users_count', { count: item.uniqueUsers })} />
              )) : <EmptyState label={t('admin_no_searches')} />}
            </Panel>
            <Panel style={styles.flexPanel}>
              <SectionTitle title={t('admin_trending')} subtitle={t('admin_trending_subtitle')} />
              {insights.trending.length ? insights.trending.slice(0, 15).map((item, index) => (
                <InsightRow key={item.query} index={index + 1} label={item.query} value={`+${item.growthPercent}%`} caption={t('admin_search_count', { count: item.count })} positive />
              )) : <EmptyState label={t('admin_no_trending')} />}
            </Panel>
          </View>

          <Panel>
            <SectionTitle title={t('admin_zero_result_queries')} subtitle={t('admin_zero_result_subtitle')} />
            {insights.zeroResultQueries.length ? (
              <View style={styles.zeroGrid}>
                {insights.zeroResultQueries.slice(0, 18).map(item => (
                  <View key={item.query} style={styles.zeroCard}>
                    <Text numberOfLines={1} style={styles.queryName}>{item.query}</Text>
                    <Text style={styles.zeroCount}>{t('admin_search_count', { count: item.count })}</Text>
                    <Text style={styles.rowCaption}>{t('admin_unique_users_count', { count: item.uniqueUsers })}</Text>
                  </View>
                ))}
              </View>
            ) : <EmptyState label={t('admin_no_zero_results')} />}
          </Panel>

          <View style={styles.twoColumn}>
            <Panel style={styles.flexPanel}>
              <SectionTitle title={t('admin_interest_categories')} subtitle={t('admin_interest_categories_subtitle')} />
              {insights.interestCategories.length ? insights.interestCategories.map(item => (
                <View key={item.category} style={styles.categoryRow}>
                  <View style={styles.categoryTop}>
                    <Text style={styles.queryName}>{item.category}</Text>
                    <Text style={styles.categoryScore}>{item.score}</Text>
                  </View>
                  <Text style={styles.rowCaption}>
                    {t('admin_category_metrics', {
                      views: item.views,
                      saves: item.saves,
                      clicks: item.clicks,
                      bookings: item.bookings,
                    })}
                  </Text>
                </View>
              )) : <EmptyState label={t('admin_no_interest_data')} />}
            </Panel>

            <Panel style={styles.flexPanel}>
              <SectionTitle title={t('admin_popular_interests')} subtitle={t('admin_popular_interests_subtitle')} />
              {insights.popularInterests.length ? (
                <View style={styles.interestsWrap}>
                  {insights.popularInterests.map(item => (
                    <View key={item.interest} style={styles.interestTag}>
                      <Text style={styles.interestName}>{item.interest}</Text>
                      <Text style={styles.interestCount}>{item.count}</Text>
                    </View>
                  ))}
                </View>
              ) : <EmptyState label={t('admin_no_interest_data')} />}
            </Panel>
          </View>

          <Panel>
            <SectionTitle title={t('admin_by_emirate')} subtitle={t('admin_by_emirate_subtitle')} />
            {insights.byEmirate.length ? (
              <View style={styles.emirateGrid}>
                {insights.byEmirate.map(item => {
                  const maximum = Math.max(1, ...insights.byEmirate.map(row => row.views));
                  return (
                    <View key={item.emirate} style={styles.emirateCard}>
                      <View style={styles.emirateTop}>
                        <Text style={styles.queryName}>{item.emirate}</Text>
                        <Text style={styles.emirateCount}>{item.views}</Text>
                      </View>
                      <View style={styles.emirateTrack}>
                        <View style={[styles.emirateFill, { width: `${Math.max(4, (item.views / maximum) * 100)}%` }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : <EmptyState label={t('admin_no_emirate_data')} />}
          </Panel>

          <View style={styles.footerActions}>
            <ActionButton label={t('admin_back_to_console')} secondary onPress={() => navigation.navigate('AdminConsole')} />
          </View>
        </>
      )}
    </AdminShell>
  );
}

function InsightRow({
  index,
  label,
  value,
  caption,
  positive,
}: {
  index: number;
  label: string;
  value: number | string;
  caption: string;
  positive?: boolean;
}) {
  return (
    <View style={styles.insightRow}>
      <View style={styles.rank}><Text style={styles.rankText}>{index}</Text></View>
      <View style={styles.insightCopy}>
        <Text numberOfLines={1} style={styles.queryName}>{label}</Text>
        <Text style={styles.rowCaption}>{caption}</Text>
      </View>
      <Text style={[styles.insightValue, positive && styles.positiveValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  twoColumn: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  flexPanel: { flex: 1, minWidth: 310 },
  insightRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: { width: 25, height: 25, borderRadius: 9, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  insightCopy: { flex: 1, minWidth: 0 },
  queryName: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  rowCaption: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  insightValue: { color: colors.ink, fontSize: 13, fontWeight: '800', marginLeft: 8 },
  positiveValue: { color: colors.success },
  zeroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  zeroCard: { flexBasis: '31%', flexGrow: 1, minWidth: 170, padding: 13, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  zeroCount: { color: colors.danger, fontSize: 13, fontWeight: '800', marginTop: 8 },
  categoryRow: { minHeight: 55, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  categoryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryScore: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  interestsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  interestTag: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 9 },
  interestName: { color: colors.primaryDark, fontSize: 12, fontWeight: '700' },
  interestCount: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  emirateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  emirateCard: { flexBasis: '31%', flexGrow: 1, minWidth: 200, borderRadius: radius.md, backgroundColor: colors.bg, padding: 14 },
  emirateTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  emirateCount: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  emirateTrack: { height: 7, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, overflow: 'hidden' },
  emirateFill: { height: '100%', backgroundColor: colors.info, borderRadius: radius.pill },
  footerActions: { flexDirection: 'row', justifyContent: 'flex-start' },
});
