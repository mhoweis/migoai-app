import { colors } from '../theme';
// migo-mobile/src/screens/LoginScreen.tsx - UPDATED
import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserStore } from '../store/userStore';
import { authService } from '../services/auth.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLocale, STORAGE_KEY, useLocale } from '../i18n';
import GradientButton from '../components/GradientButton';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, radius, type } from '../theme';

interface Props {
  navigation: any;
}

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { setUser, setFirstLogin } = useUserStore();
  const { locale, t } = useLocale();

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
      
      if (error.message.includes('Invalid credentials')) {
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

  const handleSocialLogin = async (provider: 'google' | 'apple' | 'facebook') => {
    Alert.alert(t('coming_soon'), t('social_login_soon', { provider }), [{ text: t('ok') }]);
    
    // For future implementation:
    // 1. Use Firebase or other OAuth provider
    // 2. Get ID token
    // 3. Call authService.socialLogin(idToken, provider)
  };

  const handleForgotPassword = () => {
    Alert.alert(t('forgot_password'), t('forgot_password_help'), [{ text: t('ok') }]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        style={styles.languageToggle}
        onPress={() => void setLocale(locale === 'ar' ? 'en' : 'ar')}
      >
        <Text style={styles.languageToggleText}>{locale === 'ar' ? t('english') : t('arabic')}</Text>
      </TouchableOpacity>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient colors={gradients.primary} style={styles.header}>
            {/* Updated: Replaced Icon with actual logo */}
            <Image 
              source={require('../../assets/icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>{t('welcome')}</Text>
            <Text style={styles.subtitle}>{t('sign_in_continue')}</Text>
          </LinearGradient>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              {/*<Icon name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />*/}
              <TextInput
                style={styles.input}
                placeholder={t('email_or_phone')}
                value={identifier}
                onChangeText={(value) => {
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
                style={styles.input}
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

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('or_continue_with')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialButtons}>
              {/* Updated: Replaced Ionicons with actual social icons */}
              <TouchableOpacity 
                style={styles.socialButton}
                onPress={() => handleSocialLogin('google')}
                disabled={loading}
              >
                <Image 
                  source={require('../../assets/social/google.png')}
                  style={styles.socialIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.socialButton}
                onPress={() => handleSocialLogin('apple')}
                disabled={loading}
              >
                <Image 
                  source={require('../../assets/social/apple.png')}
                  style={styles.socialIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.socialButton}
                onPress={() => handleSocialLogin('facebook')}
                disabled={loading}
              >
                <Image 
                  source={require('../../assets/social/facebook.png')}
                  style={styles.socialIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </View>

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
  languageToggle: {
    position: 'absolute',
    top: 18,
    right: 20,
    zIndex: 2,
  },
  languageToggleText: {
    color: colors.primary,
    fontWeight: '700',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
    borderRadius: radius.xl,
    paddingVertical: 28,
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 16,
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
    fontSize: 16,
    color: colors.text,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
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
    justifyContent: 'center',
    gap: 20,
    marginBottom: 32,
  },
  socialButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  socialIcon: {
    width: 24,
    height: 24,
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