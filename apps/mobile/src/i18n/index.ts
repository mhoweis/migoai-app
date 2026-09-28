import React, { useEffect, useSyncExternalStore } from 'react';
import { Alert, I18nManager, NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './en';
import ar from './ar';

export type Locale = 'en' | 'ar';
export type TranslationKey = keyof typeof en;

const STORAGE_KEY = 'migo.locale';
let locale: Locale = detectDeviceLocale();
const listeners = new Set<() => void>();

function detectDeviceLocale(): Locale {
  const language = Platform.OS === 'web'
    ? (typeof navigator !== 'undefined' ? navigator.language : '')
    : String(NativeModules?.SettingsManager?.settings?.AppleLocale
      || NativeModules?.I18nManager?.localeIdentifier
      || '');
  return language.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function applyDirection(next: Locale, reload: boolean): void {
  const rtl = next === 'ar';
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(rtl);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = next;
  } else if (reload && I18nManager.isRTL !== rtl) {
    try {
      const updates = require('expo-updates') as { reloadAsync?: () => Promise<void> };
      if (updates.reloadAsync) {
        void updates.reloadAsync();
        return;
      }
    } catch {
      // expo-updates is optional in this preview.
    }
    Alert.alert('Restart required', 'Restart the app to apply layout direction.');
  }
}

applyDirection(locale, false);
void AsyncStorage.getItem(STORAGE_KEY).then(stored => {
  if (stored === 'en' || stored === 'ar') {
    locale = stored;
    applyDirection(locale, false);
    listeners.forEach(listener => listener());
  }
});

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  let selectedKey = key;
  if (vars?.count !== undefined) {
    const pluralKey = `${String(key)}_${Number(vars.count) === 1 ? 'one' : 'other'}` as TranslationKey;
    if (pluralKey in en) selectedKey = pluralKey;
  }
  const source = locale === 'ar' ? ar : en;
  let value = source[selectedKey] || en[selectedKey] || String(key);
  Object.entries(vars || {}).forEach(([name, replacement]) => {
    value = value.replace(new RegExp(`{{${name}}}`, 'g'), String(replacement));
  });
  return value;
}

export function getLocale(): Locale {
  return locale;
}

export async function setLocale(next: Locale): Promise<void> {
  locale = next;
  await AsyncStorage.setItem(STORAGE_KEY, next);
  applyDirection(next, true);
  listeners.forEach(listener => listener());
}

export function useLocale(): {
  locale: Locale;
  isRTL: boolean;
  t: typeof t;
  setLocale: typeof setLocale;
} {
  const current = useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLocale,
    getLocale,
  );
  return { locale: current, isRTL: current === 'ar', t, setLocale };
}

export function formatEventDate(
  date: Date | string,
  opts: { withTime?: boolean } = {},
): string {
  const current = locale === 'ar' ? 'ar-AE-u-nu-latn' : 'en-AE';
  return new Intl.DateTimeFormat(current, {
    timeZone: 'Asia/Dubai',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(opts.withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(date));
}

export function formatPrice(amount: number, currency = 'AED'): string {
  if (amount === 0) return t('free');
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-AE-u-nu-latn' : 'en-AE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function categoryLabel(category?: string | null): string {
  const normalized = category?.toLowerCase().replace(/[\s&]+/g, '_');
  const key = normalized ? `categories_${normalized}` as TranslationKey : 'event';
  return key in en ? t(key) : (category || t('event'));
}

export async function persistLocalePreference(
  apiPut: (path: string, body: unknown) => Promise<unknown>,
  userId: string | undefined,
  next: Locale,
): Promise<void> {
  if (!userId) return;
  try {
    await apiPut('/users/me', { preferences: { locale: next } });
  } catch {
    // Local preference remains authoritative when the API is unavailable.
  }
}

export { STORAGE_KEY };
