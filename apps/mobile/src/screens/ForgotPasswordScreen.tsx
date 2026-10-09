import React, { useState } from 'react';
import {
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
import { Ionicons } from '@expo/vector-icons';
import GradientButton from '../components/GradientButton';
import { LanguageToggle } from '../components/LanguageToggle';
import { authService } from '../services/auth.service';
import { useLocale } from '../i18n';
import { colors, radius, shadow, type } from '../theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  navigation: any;
}

const ForgotPasswordScreen: React.FC<Props> = ({ navigation }) => {
  const { isRTL, t } = useLocale();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSend = async () => {
    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) {
      setErrorMessage(t('email_invalid'));
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      await authService.requestPasswordReset(value);
      setSent(true);
    } catch (error: any) {
      setErrorMessage(error?.message || t('please_try_again'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={authFormStyles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={authFormStyles.flex}>
        <ScrollView contentContainerStyle={authFormStyles.scroll} keyboardShouldPersistTaps="handled">
          <View style={authFormStyles.card}>
            <Text style={authFormStyles.heading}>{t('forgot_password_title')}</Text>
            <Text style={authFormStyles.subtitle}>{t('forgot_password_subtitle')}</Text>

            {sent ? (
              <View accessibilityRole="alert" style={authFormStyles.notice}>
                <Ionicons name="mail-outline" size={20} color={colors.info} />
                <Text style={authFormStyles.noticeText}>{t('forgot_password_sent')}</Text>
              </View>
            ) : (
              <>
                <View style={authFormStyles.inputContainer}>
                  <TextInput
                    accessibilityLabel={t('tab_email')}
                    style={[authFormStyles.input, isRTL && authFormStyles.inputRtl]}
                    placeholder={t('tab_email')}
                    value={email}
                    onChangeText={value => {
                      setEmail(value);
                      setErrorMessage(null);
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="send"
                    editable={!loading}
                    onSubmitEditing={handleSend}
                  />
                </View>
                {errorMessage ? (
                  <Text accessibilityRole="alert" style={authFormStyles.error}>{errorMessage}</Text>
                ) : null}
                <GradientButton label={t('forgot_password_send')} onPress={handleSend} loading={loading} />
              </>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              style={authFormStyles.linkButton}
              onPress={() => navigation.navigate('Login')}
              disabled={loading}
            >
              <Text style={authFormStyles.link}>{t('forgot_password_back')}</Text>
            </TouchableOpacity>
          </View>
          <LanguageToggle />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export const authFormStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 28,
    ...shadow.card,
  },
  heading: { ...type.h2, color: colors.text, marginBottom: 6 },
  subtitle: { ...type.body, color: colors.textMuted, marginBottom: 24 },
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
  input: { flex: 1, minWidth: 0, fontSize: 16, color: colors.text },
  inputRtl: { textAlign: 'right', writingDirection: 'rtl' },
  error: { color: colors.danger, fontSize: 14, marginBottom: 16 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.infoSoft,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 8,
  },
  noticeText: { flex: 1, color: colors.info, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  linkButton: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 12 },
  link: { color: colors.primary, fontSize: 15, fontWeight: '600' },
});

export default ForgotPasswordScreen;
