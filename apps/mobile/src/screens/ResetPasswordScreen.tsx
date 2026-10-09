import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import GradientButton from '../components/GradientButton';
import { LanguageToggle } from '../components/LanguageToggle';
import { authService } from '../services/auth.service';
import { useLocale } from '../i18n';
import { colors } from '../theme';
import { authFormStyles as styles } from './ForgotPasswordScreen';

interface Props {
  navigation: any;
  route: { params?: { token?: string } };
}

const ResetPasswordScreen: React.FC<Props> = ({ navigation, route }) => {
  const { isRTL, t } = useLocale();
  const token = route.params?.token || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(token ? null : t('reset_password_invalid_link'));

  const handleSubmit = async () => {
    if (!token) {
      setErrorMessage(t('reset_password_invalid_link'));
      return;
    }
    if (password.length < 8) {
      setErrorMessage(t('reset_password_too_short'));
      return;
    }
    if (password !== confirm) {
      setErrorMessage(t('password_mismatch'));
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      setDone(true);
    } catch (error: any) {
      const message: string = error?.message || '';
      setErrorMessage(message.includes('invalid or has expired') ? t('reset_password_invalid_link') : message || t('please_try_again'));
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] });

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.heading}>{t('reset_password_title')}</Text>
            <Text style={styles.subtitle}>{t('reset_password_subtitle')}</Text>

            {done ? (
              <>
                <View accessibilityRole="alert" style={styles.notice}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.info} />
                  <Text style={styles.noticeText}>{t('reset_password_done')}</Text>
                </View>
                <View style={{ marginTop: 16 }}>
                  <GradientButton label={t('sign_in')} onPress={goToLogin} />
                </View>
              </>
            ) : (
              <>
                <View style={styles.inputContainer}>
                  <TextInput
                    accessibilityLabel={t('reset_password_new')}
                    style={[styles.input, isRTL && styles.inputRtl]}
                    placeholder={t('reset_password_new')}
                    value={password}
                    onChangeText={value => {
                      setPassword(value);
                      setErrorMessage(null);
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password-new"
                    textContentType="newPassword"
                    editable={!loading}
                  />
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? t('hide_password') : t('show_password')}
                    style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.inputContainer}>
                  <TextInput
                    accessibilityLabel={t('confirm_password')}
                    style={[styles.input, isRTL && styles.inputRtl]}
                    placeholder={t('confirm_password')}
                    value={confirm}
                    onChangeText={value => {
                      setConfirm(value);
                      setErrorMessage(null);
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password-new"
                    textContentType="newPassword"
                    returnKeyType="done"
                    editable={!loading}
                    onSubmitEditing={handleSubmit}
                  />
                </View>
                {errorMessage ? (
                  <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text>
                ) : null}
                <GradientButton label={t('reset_password_submit')} onPress={handleSubmit} loading={loading} />
              </>
            )}

            {!done ? (
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.linkButton}
                onPress={() => navigation.navigate(errorMessage === t('reset_password_invalid_link') ? 'ForgotPassword' : 'Login')}
                disabled={loading}
              >
                <Text style={styles.link}>
                  {errorMessage === t('reset_password_invalid_link') ? t('forgot_password_send') : t('forgot_password_back')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <LanguageToggle />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default ResetPasswordScreen;
