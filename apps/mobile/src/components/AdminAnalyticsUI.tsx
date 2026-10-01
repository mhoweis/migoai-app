import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import Container from './Container';
import { AnalyticsRange, DailyClicks } from '../services/admin.service';
import { colors, radius, shadow, spacing, type } from '../theme';

export const ADMIN_RANGES = [7, 30, 90] as const;
export type AdminRangeDays = typeof ADMIN_RANGES[number];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <Container style={styles.container}>{children}</Container>
    </ScrollView>
  );
}

export function AdminHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

export function RangeSelector({
  value,
  onChange,
  labels,
}: {
  value: AdminRangeDays;
  onChange(value: AdminRangeDays): void;
  labels: Record<AdminRangeDays, string>;
}) {
  return (
    <View style={styles.rangeRow}>
      {ADMIN_RANGES.map(days => (
        <TouchableOpacity
          key={days}
          accessibilityRole="button"
          accessibilityState={{ selected: value === days }}
          onPress={() => onChange(days)}
          style={[styles.rangeChip, value === days && styles.rangeChipSelected]}
        >
          <Text style={[styles.rangeText, value === days && styles.rangeTextSelected]}>{labels[days]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function SectionTitle({
  title,
  subtitle,
  trailing,
}: {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

export function Panel({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.kpiGrid}>{children}</View>;
}

export function KpiCard({
  label,
  value,
  footnote,
  icon,
}: {
  label: string;
  value: string | number;
  footnote?: string;
  icon: string;
}) {
  const { width } = useWindowDimensions();
  const large = width >= 1024;
  return (
    <View style={[styles.kpiCard, { width: large ? '24%' : '48%' }]}>
      <View style={styles.kpiIcon}><Text style={styles.kpiIconText}>{icon}</Text></View>
      <Text numberOfLines={1} style={styles.kpiLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.kpiValue}>{value}</Text>
      {footnote ? <Text numberOfLines={1} style={styles.kpiFootnote}>{footnote}</Text> : null}
    </View>
  );
}

export function ClicksChart({
  data,
  title,
  labels,
}: {
  data: DailyClicks[];
  title: string;
  labels: { clicks: string; bookings: string };
}) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(Math.max(180, width - 112), 1080);
  const chartHeight = 168;
  const graphHeight = 120;
  const maxValue = Math.max(1, ...data.flatMap(row => [row.clicks, row.bookings]));
  const slot = chartWidth / Math.max(data.length, 1);
  const barWidth = Math.max(1, Math.min(7, slot * 0.3));
  const labelStep = Math.max(1, Math.ceil(data.length / 6));
  return (
    <Panel>
      <SectionTitle title={title} />
      <View style={styles.chartLegendRow}>
        <View style={[styles.chartLegendDot, { backgroundColor: colors.primary }]} />
        <Text style={styles.chartLegend}>{labels.clicks}</Text>
        <View style={[styles.chartLegendDot, { backgroundColor: colors.info }]} />
        <Text style={styles.chartLegend}>{labels.bookings}</Text>
      </View>
      <Svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        <Rect x={0} y={graphHeight + 7} width={chartWidth} height={1} fill={colors.border} />
        {data.map((row, index) => {
          const clicksHeight = row.clicks ? Math.max(3, (row.clicks / maxValue) * graphHeight) : 0;
          const bookingsHeight = row.bookings ? Math.max(3, (row.bookings / maxValue) * graphHeight) : 0;
          const x = index * slot + slot / 2 - barWidth - 1;
          const bookingsX = index * slot + slot / 2 + 1;
          const clicksY = graphHeight + 5 - clicksHeight;
          const bookingsY = graphHeight + 5 - bookingsHeight;
          return (
            <React.Fragment key={row.date}>
              <Rect x={x} y={clicksY} width={barWidth} height={clicksHeight} rx={Math.min(3, barWidth / 2)} fill={colors.primary} opacity={0.88} />
              <Rect x={bookingsX} y={bookingsY} width={barWidth} height={bookingsHeight} rx={Math.min(3, barWidth / 2)} fill={colors.info} opacity={0.88} />
              {index % labelStep === 0 || index === data.length - 1 ? (
                <SvgText x={x + barWidth / 2} y={chartHeight - 8} fill={colors.textMuted} fontSize={9} textAnchor="middle">
                  {row.date.slice(5)}
                </SvgText>
              ) : null}
            </React.Fragment>
          );
        })}
      </Svg>
    </Panel>
  );
}

export function ActionButton({
  label,
  onPress,
  icon,
  secondary,
  disabled,
}: {
  label: string;
  onPress(): void;
  icon?: string;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionButton, secondary && styles.actionButtonSecondary, disabled && styles.disabledButton]}
    >
      {icon ? <Text style={[styles.actionIcon, secondary && styles.actionTextSecondary]}>{icon}</Text> : null}
      <Text style={[styles.actionText, secondary && styles.actionTextSecondary]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function StatusPill({ value, label }: { value: string; label?: string }) {
  const active = value === 'ACTIVE';
  const paused = value === 'PAUSED' || value === 'CANCELLED' || value === 'ENDED';
  return (
    <View style={[styles.statusPill, active ? styles.statusActive : paused ? styles.statusPaused : styles.statusProspect]}>
      <Text style={[styles.statusText, active ? styles.statusActiveText : paused ? styles.statusPausedText : styles.statusProspectText]}>
        {label || value}
      </Text>
    </View>
  );
}

export function EmptyState({ label }: { label: string }) {
  return <Text style={styles.emptyState}>{label}</Text>;
}

export function makeAdminRange(days: AdminRangeDays): AnalyticsRange {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1, paddingBottom: 48 },
  container: { paddingTop: 30, paddingBottom: 24, gap: 22 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 },
  headerCopy: { flex: 1, minWidth: 220 },
  title: { ...type.h1, fontSize: 32, lineHeight: 38 },
  subtitle: { ...type.body, marginTop: 6 },
  rangeRow: { flexDirection: 'row', gap: 6, padding: 4, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, alignSelf: 'flex-start' },
  rangeChip: { borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 8 },
  rangeChipSelected: { backgroundColor: colors.surface, ...shadow.card },
  rangeText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  rangeTextSelected: { color: colors.primary },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  sectionTitle: { ...type.h2, fontSize: 19, lineHeight: 25 },
  sectionSubtitle: { ...type.caption, marginTop: 3 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, ...shadow.card },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  kpiCard: { minHeight: 130, borderRadius: radius.lg, padding: 16, backgroundColor: colors.surface, ...shadow.card },
  kpiIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.primarySoft, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  kpiIconText: { fontSize: 14, color: colors.primary, fontWeight: '800' },
  kpiLabel: { ...type.caption, marginBottom: 4 },
  kpiValue: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  kpiFootnote: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  chartLegendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chartLegend: { fontSize: 11, color: colors.textMuted, fontWeight: '700' },
  chartLegendDot: { width: 7, height: 7, borderRadius: 4 },
  actionButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionButtonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actionText: { color: colors.textInverse, fontWeight: '700', fontSize: 13 },
  actionTextSecondary: { color: colors.textSecondary },
  actionIcon: { color: colors.textInverse, fontSize: 14, fontWeight: '700' },
  disabledButton: { opacity: 0.55 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, alignSelf: 'flex-start' },
  statusActive: { backgroundColor: colors.successSoft },
  statusPaused: { backgroundColor: colors.surfaceAlt },
  statusProspect: { backgroundColor: colors.warningSoft },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  statusActiveText: { color: '#087443' },
  statusPausedText: { color: colors.textMuted },
  statusProspectText: { color: '#9C5A00' },
  emptyState: { ...type.caption, paddingVertical: 18, textAlign: 'center' },
});
