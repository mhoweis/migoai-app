import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, LayoutChangeEvent, Platform, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/auth.service';
import { useUserStore } from '../store/userStore';
import { setLocale, STORAGE_KEY, useLocale } from '../i18n';
import { colors } from '../theme';

declare global {
  interface Window {
    google?: any;
  }
}

let gisScript: Promise<void> | null = null;

const loadGoogleIdentityServices = (): Promise<void> => {
  if (window.google?.accounts?.id) return Promise.resolve();
  gisScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisScript = null;
      reject(new Error('Could not load Google sign-in'));
    };
    document.head.appendChild(script);
  });
  return gisScript;
};

interface Props {
  /** Google's button wording: "Sign in with Google" or "Sign up with Google". */
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  onError: (message: string) => void;
}

/**
 * Google's official sign-in button (Google Identity Services). Web only:
 * renders nothing on iOS/Android, or when the API has no GOOGLE_CLIENT_ID.
 */
export default function GoogleSignInButton({ text = 'continue_with', onError }: Props) {
  const { locale, t } = useLocale();
  const { setUser, setFirstLogin } = useUserStore();
  const container = useRef<View>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [clientId, setClientId] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let active = true;
    void authService.getGoogleClientId().then(id => {
      if (active) setClientId(id);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!clientId || !width || !container.current) return;
    let cancelled = false;

    const handleCredential = async (response: { credential?: string }) => {
      if (!response.credential) return;
      setBusy(true);
      try {
        const result = await authService.loginWithGoogle(response.credential);
        const storedLocale = await AsyncStorage.getItem(STORAGE_KEY);
        const serverLocale = result.user.preferences?.locale;
        if (!storedLocale && (serverLocale === 'en' || serverLocale === 'ar')) {
          await setLocale(serverLocale);
        }
        setUser(result.user);
        setFirstLogin(result.isFirstLogin);
      } catch (error: any) {
        onErrorRef.current(error?.code === 'ACCOUNT_PAUSED' ? t('account_paused') : error?.message || t('please_try_again'));
        setBusy(false);
      }
    };

    loadGoogleIdentityServices()
      .then(() => {
        if (cancelled || !container.current) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
        window.google.accounts.id.renderButton(container.current as unknown as HTMLElement, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text,
          logo_alignment: 'center',
          width: Math.min(400, Math.floor(width)),
          locale,
        });
      })
      .catch(error => onErrorRef.current(error.message));

    return () => {
      cancelled = true;
    };
  }, [clientId, width, text, locale]);

  if (Platform.OS !== 'web' || !clientId) return null;

  return (
    <View onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>{t('or_continue_with')}</Text>
        <View style={styles.line} />
      </View>
      {/* Kept mounted while busy so Google's rendered button survives a failed attempt. */}
      {busy ? <ActivityIndicator style={styles.button} color={colors.primary} /> : null}
      <View ref={container} style={[styles.button, busy && styles.hidden]} />
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 16 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: 16, color: colors.textMuted, fontSize: 14 },
  button: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  hidden: { display: 'none' },
});
