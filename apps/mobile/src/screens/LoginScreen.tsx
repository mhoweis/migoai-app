import { colors } from '../theme';
// migo-mobile/src/screens/LoginScreen.tsx - UPDATED
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from '../store/userStore';
import { authService } from '../services/auth.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLocale, STORAGE_KEY, useLocale } from '../i18n';
import GradientButton from '../components/GradientButton';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, radius, shadow, type } from '../theme';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../components/PressableScale';
import { LanguageToggle } from '../components/LanguageToggle';
import { isProductionApp } from '../config/appEnv';

type SocialProvider = 'google' | 'apple' | 'facebook';

const SOCIAL_PROVIDERS: { id: SocialProvider; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'apple', label: 'Apple' },
  { id: 'facebook', label: 'Facebook' },
];

const GoogleMark = ({ size }: { size: number }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </Svg>
);

const SocialMark = ({ provider }: { provider: SocialProvider }) => {
  if (provider === 'google') return <GoogleMark size={20} />;
  if (provider === 'apple') return <Ionicons name="logo-apple" size={21} color={colors.ink} />;
  return <Ionicons name="logo-facebook" size={21} color="#1877F2" />;
};

const DesktopFormPanel = View as unknown as React.ComponentType<any>;
const DesktopFormText = Text as unknown as React.ComponentType<any>;

interface Props {
  navigation: any;
}

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { setUser, setFirstLogin, accountPaused, clearAccountPaused } = useUserStore();
  const { isRTL, t } = useLocale();
  const { isWebDesktop } = useBreakpoint();
  const { width } = useWindowDimensions();
  const showSocialLabels = isWebDesktop ? width >= 1200 : width >= 360;
  const [socialNotice, setSocialNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!socialNotice) return;
    const timer = setTimeout(() => setSocialNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [socialNotice]);

  useEffect(() => {
    if (!accountPaused) return;
    setErrorMessage(t('account_paused'));
    clearAccountPaused();
  }, [accountPaused, clearAccountPaused, t]);

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      const message = t('login_required');
      setErrorMessage(message);
      Alert.alert(t('login_error'), message);
      return;
    }

    setErrorMessage(null);
    setLoading(true);
    
    try {
      // Use real auth service
      const response = await authService.login({
        identifier: identifier.trim(),
        password,
      });
      
      console.log('Login successful');
      
      const storedLocale = await AsyncStorage.getItem(STORAGE_KEY);
      const serverLocale = response.user.preferences?.locale;
      if (!storedLocale && (serverLocale === 'en' || serverLocale === 'ar')) {
        await setLocale(serverLocale);
      }
      setUser(response.user);
      setFirstLogin(response.isFirstLogin);
      
      // Navigation will be handled by App.tsx based on state changes
      
    } catch (error: any) {
      console.error('Login failed:', error);
      
      let errorMessage = t('please_try_again');
      
      if (error.code === 'ACCOUNT_PAUSED') {
        errorMessage = t('account_paused');
      } else if (error.message.includes('Invalid credentials')) {
        errorMessage = t('login_invalid_credentials');
      } else if (error.message.includes('User not found')) {
        errorMessage = t('login_user_not_found');
      } else if (error.message.includes('Network error')) {
        errorMessage = t('login_network_error');
      }
      
      setErrorMessage(errorMessage);
      Alert.alert(t('login_failed'), errorMessage);
      
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = (provider: SocialProvider) => {
    const label = SOCIAL_PROVIDERS.find(item => item.id === provider)?.label ?? provider;
    setSocialNotice(t('social_login_soon', { provider: label }));
  };

  const handleForgotPassword = () => {
    Alert.alert(t('forgot_password'), t('forgot_password_help'), [{ text: t('ok') }]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={[styles.scrollContent, isWebDesktop && styles.desktopScrollContent]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient
            colors={[colors.ink, ...gradients.dusk]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.header, isWebDesktop && styles.desktopBrandPanel]}
          >
            {/* Updated: Replaced Icon with actual logo */}
            <Image 
              source={require('../../assets/logo-mark.png')}
              style={[styles.logo, isWebDesktop && styles.logoDesktop]}
              resizeMode="contain"
            />
            {!isWebDesktop ? (
              <>
                <Text style={styles.title}>{t('welcome')}</Text>
                <Text style={styles.subtitle}>{t('sign_in_continue')}</Text>
              </>
            ) : null}
            {isWebDesktop ? (
              <>
                <Text style={styles.brandStatement}>{t('login_brand_headline')}</Text>
                <View style={styles.brandBenefits}>
                  {(['login_value_1', 'login_value_2', 'login_value_3'] as const).map((key, index) => (
                    <View key={key} style={styles.brandBenefit}>
                      <Ionicons name={(['compass-outline', 'ticket-outline', 'people-outline'] as const)[index]} size={22} color={colors.accent} />
                      <Text style={styles.brandBenefitText}>{t(key)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </LinearGradient>

          <DesktopFormPanel style={isWebDesktop ? styles.desktopFormPanel : undefined}>
          <View style={[styles.form, isWebDesktop && styles.desktopForm]}>
            {isWebDesktop ? (
              <>
                <DesktopFormText style={styles.formHeading}>{t('welcome_back')}</DesktopFormText>
                <DesktopFormText style={styles.formSubtitle}>{t('sign_in_continue')}</DesktopFormText>
              </>
            ) : null}
            <View style={styles.inputContainer}>
              {/*<Icon name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />*/}
              <TextInput
                accessibilityLabel={t('email_or_phone')}
                style={[styles.input, isRTL && styles.inputRtl]}
                placeholder={t('email_or_phone')}
                value={identifier}
                onChangeText={(value: string) => {
                  setIdentifier(value);
                  setErrorMessage(null);
                }}
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                editable={!loading}
              />
            </View>

            <View style={styles.inputContainer}>
              {/*<Icon name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />*/}
              <TextInput
                accessibilityLabel={t('password')}
                style={[styles.input, isRTL && styles.inputRtl]}
                placeholder={t('password')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                editable={!loading}
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={showPassword ? t('hide_password') : t('show_password')}
                style={styles.passwordToggle}
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
              <Image
                  source={require('../../assets/icons/show-password.png')}
                  style={[styles.showPassword, { tintColor: showPassword ? colors.textMuted : colors.primary }]}
                  resizeMode="contain"
                />
               {/* <Icon
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />*/}
              </TouchableOpacity>
            </View>

            {errorMessage && (
              <Text accessibilityRole="alert" style={styles.errorMessage}>
                {errorMessage}
              </Text>
            )}

            <TouchableOpacity 
              style={styles.forgotPassword}
              onPress={handleForgotPassword}
              disabled={loading}
            >
              <Text style={styles.forgotPasswordText}>{t('forgot_password')}?</Text>
            </TouchableOpacity>

            <GradientButton label={t('sign_in')} onPress={handleLogin} loading={loading} />

            {!isProductionApp ? (
              <>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{t('or_continue_with')}</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.socialButtons}>
                  {SOCIAL_PROVIDERS.map(({ id, label }) => (
                    <PressableScale
                      key={id}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('or_continue_with')} ${label}`}
                      style={[styles.socialButton, !showSocialLabels && styles.socialButtonCompact]}
                      onPress={() => handleSocialLogin(id)}
                      disabled={loading}
                    >
                      <View style={styles.socialMark}>
                        <SocialMark provider={id} />
                      </View>
                      {showSocialLabels && <Text style={[styles.socialLabel, !isWebDesktop && styles.socialLabelCompact]}>{label}</Text>}
                    </PressableScale>
                  ))}
                </View>

                {socialNotice && (
                  <View accessibilityRole="alert" style={styles.socialNotice}>
                    <Ionicons name="information-circle" size={18} color={colors.info} />
                    <Text style={styles.socialNoticeText}>{socialNotice}</Text>
                  </View>
                )}
              </>
            ) : null}

            <View style={styles.footer}>
              <Text style={styles.footerText}>{t('no_account_yet')} </Text>
              <TouchableOpacity 
                onPress={() => navigation.navigate('Register')}
                disabled={loading}
              >
                <Text style={styles.footerLink}>{t('register')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <LanguageToggle />
          </DesktopFormPanel>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  desktopScrollContent: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'flex-start', minHeight: '100%', padding: 0, gap: 0 },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
    borderRadius: radius.xl,
    paddingVertical: 28,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  desktopBrandPanel: { width: '55%', minHeight: '100%', margin: 0, marginTop: 0, marginBottom: 0, borderRadius: 0, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 64, paddingVertical: 64 },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  logoDesktop: {
    width: 180,
    height: 180,
    marginBottom: 8,
  },
  title: {
    ...type.h1,
    color: colors.textInverse,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 8,
    textAlign: 'center',
  },
  form: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 20,
  },
  desktopFormPanel: { flex: 1, minWidth: 0, minHeight: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 64, paddingVertical: 40, backgroundColor: colors.bg },
  desktopForm: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: '100%', maxWidth: 420, alignSelf: 'center', marginHorizontal: 0, padding: 32, ...shadow.card },
  formHeading: { ...type.h2, color: colors.text, marginBottom: 4 },
  formSubtitle: { ...type.body, color: colors.textMuted, marginBottom: 24 },
  brandStatement: { ...type.display, color: colors.textInverse, maxWidth: 440, textAlign: 'left', marginTop: 44 },
  brandBenefits: { alignSelf: 'stretch', gap: 18, maxWidth: 460, marginTop: 36 },
  brandBenefit: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  brandBenefitText: { flex: 1, color: 'rgba(255,255,255,0.88)', fontSize: 16, lineHeight: 24 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    color: colors.text,
  },
  inputRtl: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  errorMessage: {
    color: colors.danger,
    fontSize: 14,
    marginBottom: 16,
  },
  loginButton: {
    backgroundColor: colors.primary,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    flexDirection: 'row',
  },
  loginButtonDisabled: {
    backgroundColor: colors.primarySoft,
  },
  showPassword: {
    width: 20,
    height: 20,
  },
  passwordToggle: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  loginIcon: {
    marginRight: 8,
  },
  loginButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: 'bold',
  },
  divider: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 16,
    color: colors.textMuted,
    fontSize: 14,
  },
  socialButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  socialButton: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  socialMark: {
    flexShrink: 0,
  },
  socialButtonCompact: {
    gap: 0,
  },
  socialLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  socialLabelCompact: {
    fontSize: 13,
  },
  socialNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  socialNoticeText: {
    flex: 1,
    color: colors.info,
    fontSize: 13,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  footerLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default LoginScreen;