import { colors, radius } from '../theme';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '../services/auth.service';
import { useUserStore } from '../store/userStore';
import { useLocale } from '../i18n';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, shadow, type } from '../theme';
import { Ionicons } from '@expo/vector-icons';

const DesktopFormPanel = View as unknown as React.ComponentType<any>;
const DesktopFormText = Text as unknown as React.ComponentType<any>;

type SignupMode = 'phone' | 'email';

const RegisterScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [mode, setMode] = useState<SignupMode>('phone');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { setUser, setFirstLogin } = useUserStore();
  const { t } = useLocale();
  const { isWebDesktop } = useBreakpoint();

  const showError = (message: string) => {
    setErrorMessage(message);
    Alert.alert(t('signup_failed'), message);
  };

  const finishSignup = (response: Awaited<ReturnType<typeof authService.register>>) => {
    setUser(response.user);
    setFirstLogin(response.isFirstLogin);
  };

  const switchMode = (nextMode: SignupMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setOtp('');
    setOtpSent(false);
  };

  const sendOtp = async () => {
    if (!name.trim()) return showError(t('full_name'));
    if (!/^\+[1-9]\d{6,14}$/.test(phone.replace(/[\s()-]/g, ''))) {
      return showError(t('phone_number'));
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      await authService.sendPhoneSignupOtp({ phone, name: name.trim() });
      setOtpSent(true);
      Alert.alert(t('code_sent'), t('code_sent_help'));
    } catch (error: any) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp.trim())) return showError(t('verification_code'));

    setLoading(true);
    setErrorMessage(null);
    try {
      finishSignup(await authService.verifyPhoneSignupOtp({
        phone,
        code: otp.trim(),
        name: name.trim(),
      }));
    } catch (error: any) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const registerWithEmail = async () => {
    if (!name.trim()) return showError(t('full_name'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return showError(t('email_address'));
    }
    if (password.length < 6) return showError(t('password_too_short'));
    if (password !== confirmPassword) return showError(t('password_mismatch'));

    setLoading(true);
    setErrorMessage(null);
    try {
      finishSignup(await authService.register({
        email: email.trim(),
        password,
        name: name.trim(),
      }));
    } catch (error: any) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isWebDesktop && styles.desktopScrollContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={[colors.ink, ...gradients.dusk]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.header, isWebDesktop && styles.desktopBrandPanel]}
          >
            <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
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
            ) : (
              <>
                <Text style={styles.title}>{t('create_account')}</Text>
                <Text style={styles.subtitle}>{t('register_subtitle')}</Text>
              </>
            )}
          </LinearGradient>

          <DesktopFormPanel style={isWebDesktop ? styles.desktopFormPanel : undefined}>
          <View style={isWebDesktop ? styles.desktopForm : undefined}>
          {isWebDesktop ? (
            <>
              <DesktopFormText style={styles.formHeading}>{t('create_account')}</DesktopFormText>
              <DesktopFormText style={styles.formSubtitle}>{t('register_subtitle')}</DesktopFormText>
            </>
          ) : null}
          <View style={styles.modeSelector}>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'phone' && styles.modeButtonActive]}
              onPress={() => switchMode('phone')}
            >
              <Text style={[styles.modeText, mode === 'phone' && styles.modeTextActive]}>
                {t('tab_phone')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'email' && styles.modeButtonActive]}
              onPress={() => switchMode('email')}
            >
              <Text style={[styles.modeText, mode === 'email' && styles.modeTextActive]}>
                {t('tab_email')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
              <TextInput
                accessibilityLabel={t('full_name')}
              style={styles.input}
              placeholder={t('full_name')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="name"
            />
          </View>

          {mode === 'phone' ? (
            <>
              <View style={styles.inputContainer}>
                <TextInput
                  accessibilityLabel={t('phone_number')}
                  style={styles.input}
                  placeholder={t('phone_number')}
                  value={phone}
                  onChangeText={(value: string) => {
                    setPhone(value);
                    if (otpSent) {
                      setOtpSent(false);
                      setOtp('');
                    }
                  }}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  editable={!loading}
                />
              </View>
              {otpSent && (
                <View style={styles.inputContainer}>
                  <TextInput
                    accessibilityLabel={t('verification_code')}
                    style={styles.input}
                    placeholder={t('verification_code')}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoComplete="sms-otp"
                    textContentType="oneTimeCode"
                  />
                </View>
              )}
              <Text style={styles.hint}>
                {otpSent
                  ? t('code_sent_help')
                  : t('otp_hint')}
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={otpSent ? verifyOtp : sendOtp}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {otpSent ? t('create_account') : t('send_code')}
                  </Text>
                )}
              </TouchableOpacity>
              {otpSent && (
                <TouchableOpacity onPress={sendOtp} disabled={loading}>
                  <Text style={styles.resendText}>{t('send_code')}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <View style={styles.inputContainer}>
                <TextInput
                  accessibilityLabel={t('email_address')}
                  style={styles.input}
                  placeholder={t('email_address')}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  accessibilityLabel={t('password')}
                  style={styles.input}
                  placeholder={t('password')}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password-new"
                />
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={showPassword ? t('hide_password') : t('show_password')} style={styles.passwordToggle} onPress={() => setShowPassword(value => !value)}>
                  <Image
                    source={require('../../assets/icons/show-password.png')}
                    style={styles.showPassword}
                  />
                </TouchableOpacity>
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  accessibilityLabel={t('confirm_password')}
                  style={styles.input}
                  placeholder={t('confirm_password')}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password-new"
                />
              </View>
              <Text style={styles.hint}>{t('password_requirements')}</Text>
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.buttonDisabled]}
                onPress={registerWithEmail}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                    <Text style={styles.primaryButtonText}>{t('create_account')}</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {errorMessage && <Text style={styles.errorMessage}>{errorMessage}</Text>}

          <Text style={styles.termsText}>
            {t('terms_note')}
          </Text>
          <View style={styles.loginRow}>
            <Text style={styles.secondaryText}>{t('already_have_account')} </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.link}>{t('sign_in')}</Text>
            </TouchableOpacity>
          </View>
          </View>
          </DesktopFormPanel>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.textInverse },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 24, paddingBottom: 36 },
  desktopScrollContent: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'flex-start', minHeight: '100%', padding: 0, paddingBottom: 0, gap: 0 },
  header: { marginTop: 24, marginBottom: 28, alignItems: 'center', borderRadius: radius.xl, padding: 24 },
  desktopBrandPanel: { width: '55%', minHeight: '100%', margin: 0, marginTop: 0, marginBottom: 0, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 64, paddingVertical: 64, borderRadius: 0 },
  desktopFormPanel: { flex: 1, minWidth: 0, minHeight: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 64, paddingVertical: 40, backgroundColor: colors.bg },
  desktopForm: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: '100%', maxWidth: 420, alignSelf: 'center', padding: 32, backgroundColor: colors.surface, borderRadius: radius.xl, ...shadow.card },
  formHeading: { ...type.h2, color: colors.text, marginBottom: 4 },
  formSubtitle: { ...type.body, color: colors.textMuted, marginBottom: 24 },
  brandStatement: { ...type.display, color: colors.textInverse, maxWidth: 440, textAlign: 'left', marginTop: 44 },
  brandBenefits: { alignSelf: 'stretch', gap: 18, maxWidth: 460, marginTop: 36 },
  brandBenefit: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  brandBenefitText: { flex: 1, color: 'rgba(255,255,255,0.88)', fontSize: 16, lineHeight: 24 },
  logo: { width: 64, height: 64, marginBottom: 14 },
  title: { fontSize: 30, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
  subtitle: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  modeSelector: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  modeButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 9 },
  modeButtonActive: { backgroundColor: colors.textInverse },
  modeText: { color: colors.textMuted, fontWeight: '600' },
  modeTextActive: { color: colors.primary },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, height: 56, fontSize: 16, color: colors.text },
  showPassword: { width: 20, height: 20 },
  passwordToggle: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: 18 },
  primaryButton: {
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  buttonDisabled: { backgroundColor: colors.primarySoft },
  primaryButtonText: { color: colors.textInverse, fontSize: 16, fontWeight: 'bold' },
  resendText: { color: colors.primary, textAlign: 'center', fontWeight: '600', marginBottom: 18 },
  errorMessage: { color: colors.danger, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  termsText: { color: colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  link: { color: colors.primary, fontWeight: '600' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  secondaryText: { color: colors.textMuted, fontSize: 14 },
});

export default RegisterScreen;