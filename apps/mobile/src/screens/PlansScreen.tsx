import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useLocale } from '../i18n';
import { AccountPlan, PlanKey, accountTypesService } from '../services/accountTypes.service';
import {
  ActionButton,
  AdminBackButton,
  AdminHeader,
  AdminShell,
  Panel,
  SectionTitle,
  StatusPill,
} from '../components/AdminAnalyticsUI';
import { colors, radius, type } from '../theme';
import { canPurchasePlansInApp } from '../config/appEnv';

export default function PlansScreen({ navigation }: { navigation: any }) {
  const route = useRoute<any>();
  const { t, locale, isRTL } = useLocale();
  const [plans, setPlans] = useState<AccountPlan[]>([]);
  const [state, setState] = useState<any>(null);
  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>(route.params?.selectedPlan || 'HOST');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await accountTypesService.plans();
      setPlans(result.plans);
      setState(result.state);
    } catch {
      setNotice(t('plans_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const subscription = state?.subscription;
  const currentPlan = subscription && ['ACTIVE', 'CANCELLED'].includes(subscription.status)
    ? subscription.plan as PlanKey
    : null;
  const canSubscribeSelected = !currentPlan
    || (currentPlan !== 'SUPPLIER' && selectedPlan === 'SUPPLIER')
    || (subscription?.status === 'CANCELLED' && selectedPlan === currentPlan);
  const planDetails = (key: PlanKey) => plans.find(plan => plan.key === key);
  const price = (key: PlanKey) => planDetails(key)?.priceAed ?? (key === 'HOST' ? 99 : 499);

  const subscribe = async (plan: PlanKey) => {
    if (!canPurchasePlansInApp) return;
    if (plan === 'SUPPLIER' && businessName.trim().length < 2) {
      setNotice(t('plans_business_name_required'));
      return;
    }
    if (website.trim()) {
      try {
        new URL(website.trim());
      } catch {
        setNotice(t('plans_website_invalid'));
        return;
      }
    }
    setBusy(true);
    setNotice('');
    try {
      const returnUrl = Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : 'migo://plans';
      const result = await accountTypesService.subscribe({
        plan,
        returnUrl,
        ...(plan === 'SUPPLIER'
          ? { businessName: businessName.trim(), ...(website.trim() ? { website: website.trim() } : {}) }
          : {}),
      });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.assign(result.checkoutUrl);
      } else {
        await Linking.openURL(result.checkoutUrl);
      }
    } catch (error: any) {
      setNotice(error?.response?.data?.error || t('plans_checkout_failed'));
    } finally {
      setBusy(false);
    }
  };

  const cancelPlan = async () => {
    setBusy(true);
    setNotice('');
    try {
      await accountTypesService.cancel();
      await load();
      setNotice(t('plans_cancelled'));
    } catch {
      setNotice(t('plans_cancel_failed'));
    } finally {
      setBusy(false);
    }
  };

  const renderPlan = (key: PlanKey) => {
    const selected = selectedPlan === key;
    const isCurrent = currentPlan === key;
    const features = key === 'HOST'
      ? ['plans_host_feature_1', 'plans_host_feature_2', 'plans_host_feature_3']
      : ['plans_supplier_feature_1', 'plans_supplier_feature_2', 'plans_supplier_feature_3'];
    return (
      <TouchableOpacity
        key={key}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={() => setSelectedPlan(key)}
        style={[styles.planCard, selected && styles.planCardSelected]}
      >
        <View style={styles.planTitleRow}>
          <View style={styles.planIcon}>
            <Ionicons name={key === 'HOST' ? 'calendar-outline' : 'storefront-outline'} size={22} color={colors.primary} />
          </View>
          <View style={styles.planHeading}>
            <Text style={styles.planTitle}>{t(key === 'HOST' ? 'plans_host' : 'plans_supplier')}</Text>
            {isCurrent ? <StatusPill value={subscription.status} label={t(`plans_status_${subscription.status.toLowerCase()}` as any)} /> : null}
          </View>
        </View>
        <Text style={styles.planPrice}>{t('plans_price', { price: price(key) })}</Text>
        <View style={styles.features}>
          {features.map(feature => (
            <View key={feature} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={styles.featureText}>{t(feature as any)}</Text>
            </View>
          ))}
        </View>
        {isCurrent && subscription.currentPeriodEnd ? (
          <Text style={styles.currentPlan}>{t('plans_active_until', {
            date: new Date(subscription.currentPeriodEnd).toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-AE'),
          })}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <AdminShell>
      <AdminBackButton label={t('back')} rtl={isRTL} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ProfileMain')} />
      <AdminHeader
        title={t(canPurchasePlansInApp ? 'plans_title' : 'plans_current_plan')}
        subtitle={canPurchasePlansInApp ? t('plans_subtitle') : undefined}
      />
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {canPurchasePlansInApp && !loading ? (
        <View style={styles.plansGrid}>
          {renderPlan('HOST')}
          {renderPlan('SUPPLIER')}
        </View>
      ) : null}
      {canPurchasePlansInApp && selectedPlan === 'SUPPLIER' && canSubscribeSelected ? (
        <Panel>
          <SectionTitle title={t('plans_business_details')} subtitle={t('plans_business_details_help')} />
          <TextInput
            style={styles.input}
            value={businessName}
            onChangeText={setBusinessName}
            placeholder={t('plans_business_name')}
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={styles.input}
            value={website}
            onChangeText={setWebsite}
            placeholder={t('plans_website_optional')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="url"
          />
        </Panel>
      ) : null}
      {!canPurchasePlansInApp || currentPlan ? (
        <Panel>
          {canPurchasePlansInApp ? <SectionTitle title={t('plans_current_plan')} /> : null}
          <Text style={styles.currentPlanName}>
            {currentPlan ? t(currentPlan === 'HOST' ? 'plans_host' : 'plans_supplier') : t('account_role_user')}
          </Text>
          {currentPlan && subscription.status === 'ACTIVE' ? (
            <ActionButton label={busy ? t('loading') : t('plans_cancel')} secondary disabled={busy} onPress={() => void cancelPlan()} />
          ) : null}
        </Panel>
      ) : null}
      {canPurchasePlansInApp && canSubscribeSelected ? (
        <ActionButton
          label={busy ? t('loading') : t('plans_subscribe', { plan: t(selectedPlan === 'HOST' ? 'plans_host' : 'plans_supplier') })}
          disabled={busy || loading}
          onPress={() => void subscribe(selectedPlan)}
        />
      ) : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  plansGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  planCard: { flex: 1, minWidth: 280, padding: 22, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  planCardSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  planHeading: { flex: 1, gap: 6 },
  planTitle: { ...type.h2 },
  planPrice: { ...type.h1, color: colors.primary, marginTop: 18 },
  features: { gap: 12, marginTop: 20 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  featureText: { ...type.body, flex: 1 },
  currentPlan: { ...type.caption, marginTop: 16 },
  currentPlanName: { ...type.h3, marginBottom: 14 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.bg, marginBottom: 10 },
  notice: { ...type.caption, color: colors.primary, paddingVertical: 8 },
});
