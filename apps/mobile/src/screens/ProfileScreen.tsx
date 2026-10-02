import { colors } from '../theme';
// src/screens/ProfileScreen.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUserStore } from '../store/userStore';
import { ProfileStackParamList } from '../navigation/MainTabNavigator';
import { navigationRef } from '../navigation/navigationRef';
import { authService, isAdmin, isHost, isSupplier } from '../services/auth.service';
import { uploadService } from '../services/upload.service';
import { setLocale, useLocale } from '../i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, radius, shadow, type } from '../theme';
import { useBreakpoint } from '../hooks/useBreakpoint';
import Container from '../components/Container';
import { AdminBackButton } from '../components/AdminAnalyticsUI';
import { canPurchasePlansInApp, isProductionApp } from '../config/appEnv';
import { API_BASE_URL } from '../services/api';

type ProfileScreenNavigationProp = NavigationProp<ProfileStackParamList, 'ProfileMain'>;
const e164PhonePattern = /^\+[1-9]\d{7,14}$/;

const ProfileScreen = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { user, logout, updateProfile, updateReminders, setUser } = useUserStore();
  const { locale, isRTL, t } = useLocale();
  const { isWebDesktop } = useBreakpoint();

  const [showNameModal, setShowNameModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [showBioModal, setShowBioModal] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reminderSettings, setReminderSettings] = useState({
    email: user?.preferences?.reminders?.email ?? true,
    whatsapp: user?.preferences?.reminders?.whatsapp ?? true,
    saved: user?.preferences?.reminders?.saved ?? true,
  });
  const [reminderPhone, setReminderPhone] = useState(user?.phone ?? '');
  const [isSavingReminders, setIsSavingReminders] = useState(false);
  const [remindersSaved, setRemindersSaved] = useState(false);
  const [remindersError, setRemindersError] = useState('');
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);
  const phoneIsInvalid = reminderPhone.trim().length > 0 && !e164PhonePattern.test(reminderPhone.trim());

  useEffect(() => {
    setReminderSettings({
      email: user?.preferences?.reminders?.email ?? true,
      whatsapp: user?.preferences?.reminders?.whatsapp ?? true,
      saved: user?.preferences?.reminders?.saved ?? true,
    });
    setReminderPhone(user?.phone ?? '');
  }, [
    user?.id,
    user?.phone,
    user?.preferences?.reminders?.email,
    user?.preferences?.reminders?.whatsapp,
    user?.preferences?.reminders?.saved,
  ]);

  // ── Avatar ────────────────────────────────────────────────────────────────
  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to update your profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setIsSaving(true);
      try {
        const avatar = await uploadService.uploadImage(asset.uri, {
          name: asset.fileName || 'avatar.jpg',
          type: asset.mimeType || 'image/jpeg',
        });
        const updated = await authService.updateProfile({ avatar });
        await setUser(updated);
      } catch {
        Alert.alert(t('error'), t('profile_image_upload_failed'));
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handlePickCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('profile_photo_permission'), t('profile_photo_permission_help'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setIsSaving(true);
    try {
      const coverImage = await uploadService.uploadImage(asset.uri, {
        name: asset.fileName || 'profile-cover.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
      const updated = await authService.updateProfile({ coverImage });
      await setUser(updated);
    } catch {
      Alert.alert(t('error'), t('profile_image_upload_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Name edit ─────────────────────────────────────────────────────────────
  const openNameModal = () => {
    setEditName(user?.name || '');
    setShowNameModal(true);
  };

  const openBioModal = () => {
    setEditBio(user?.bio || '');
    setShowBioModal(true);
  };

  const handleSaveBio = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const updated = await authService.updateProfile({ bio: editBio.trim() || null });
      await setUser(updated);
      setShowBioModal(false);
    } catch {
      Alert.alert(t('error'), t('profile_save_failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    if (trimmed === user?.name) {
      setShowNameModal(false);
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({ name: trimmed });
      // Always persist locally so the name survives logout/re-login
      // (updateProfile handles API fallback internally and never throws)
      await AsyncStorage.setItem('localProfileName', trimmed);
    } finally {
      setIsSaving(false);
      setShowNameModal(false);
    }
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleNavigateToWallet = () => {
    // Use the root navigationRef with the full nested path — bypasses all
    // routing ambiguity and works reliably across Fast Refresh.
    (navigationRef.current as any)?.navigate('Main', {
      screen: 'Tabs',
      params: { screen: 'Wallet' },
    });
  };

  const handleNavigateToInterests = () => {
    navigation.navigate('Interests');
  };

  const handleNavigateToConnectionTest = () => {
    navigation.navigate('ConnectionTest');
  };

  const handleNavigateToCreateEvent = () => {
    navigation.navigate('CreateEvent');
  };

  const handleNavigateToPlans = (selectedPlan: 'HOST' | 'SUPPLIER') => {
    navigation.navigate('Plans', { selectedPlan });
  };

  const handleNavigateToSupplierPortal = () => {
    navigation.navigate('SupplierPortal');
  };

  const handleNavigateToMyEvents = () => {
    navigation.navigate('MyEvents');
  };

  const handleNavigateToHostDashboard = () => {
    navigationRef.current?.navigate('HostDashboard');
  };

  const handleNavigateToFindFriends = () => {
    navigation.navigate('FindFriends');
  };

  const handleNavigateToCustomizeHome = () => {
    navigationRef.current?.navigate('CustomizeHome');
  };

  const handleNavigateToVerifyOrganizers = () => {
    (navigation as any).navigate('VerifyOrganizers');
  };

  const handleNavigateToAdminConsole = () => {
    navigationRef.current?.navigate('AdminConsole' as never);
  };

  const handleNavigateToAdminModeration = () => {
    navigationRef.current?.navigate('AdminModeration' as never);
  };

  const handleLocaleChange = async (next: 'en' | 'ar') => {
    await setLocale(next);
    if (user) {
      void authService.updateLocale(next).then(updated => setUser(updated)).catch(() => undefined);
    }
  };

  const openLegalPage = (page: 'privacy' | 'terms' | 'delete-account') => {
    const origin = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : API_BASE_URL;
    void Linking.openURL(`${origin}/${page}`);
  };

  const handlePrivacyChange = async (isPrivate: boolean) => {
    if (isSavingPrivacy) return;
    setIsSavingPrivacy(true);
    try {
      const updated = await authService.updateProfile({ isPrivate });
      await setUser(updated);
    } catch {
      Alert.alert(t('error'), t('profile_save_failed'));
    } finally {
      setIsSavingPrivacy(false);
    }
  };

  const handleSaveReminders = async () => {
    if (phoneIsInvalid) return;
    setIsSavingReminders(true);
    setRemindersSaved(false);
    setRemindersError('');
    try {
      await updateReminders(reminderPhone.trim() || null, reminderSettings);
      setRemindersSaved(true);
    } catch (error: any) {
      setRemindersError(error?.response?.data?.error || error?.message || t('reminders_save_failed'));
    } finally {
      setIsSavingReminders(false);
    }
  };

  const accountRole = user?.role || 'USER';
  const accountPlan = (() => {
    switch (accountRole) {
      case 'USER':
        return { help: 'account_plan_help_user', button: 'account_plan_upgrade', plan: 'HOST' } as const;
      case 'ORGANIZER':
        return { help: 'account_plan_help_organizer', button: 'account_plan_upgrade_supplier', plan: 'SUPPLIER' } as const;
      case 'SUPPLIER':
        return { help: 'account_plan_help_supplier', button: 'account_plan_manage', plan: 'SUPPLIER' } as const;
      default:
        return { help: 'account_plan_help_admin', button: 'account_plan_view', plan: 'HOST' } as const;
    }
  })();
  const accountPlanButtonText = t(accountPlan.button);
  const deleteAccountNeedsPassword = !user?.authMethod
    || ['email', 'email_password', 'email/password'].includes(user.authMethod);

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;
    setIsDeletingAccount(true);
    try {
      await authService.deleteAccount(deleteAccountNeedsPassword ? deleteAccountPassword : undefined);
      setShowDeleteAccountModal(false);
      await logout();
    } catch (error: any) {
      const code = error?.code;
      const message = code === 'INVALID_PASSWORD'
        ? t('account_delete_wrong_password')
        : code === 'UPCOMING_PAID_BOOKINGS'
          ? t('account_delete_upcoming_paid')
          : code === 'UPCOMING_HOSTED_EVENTS'
            ? t('account_delete_upcoming_hosted')
            : t('account_delete_failed');
      Alert.alert(t('account_delete_title'), message);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Container style={[styles.desktopPage, !isWebDesktop && styles.mobileProfileContainer]}>
          <View style={[styles.header, isWebDesktop && styles.desktopHeader]}>
            {navigation.canGoBack() ? <AdminBackButton label={t('back')} rtl={isRTL} onPress={() => navigation.goBack()} /> : null}
            <Text style={styles.title}>{t('account_settings')}</Text>
          </View>
          <View style={[styles.profileColumns, isWebDesktop && styles.desktopProfileColumns]}>
            <View style={isWebDesktop ? styles.desktopSummary : undefined}>

        {/* ── User Info ── */}
        <View style={[styles.section, isWebDesktop && styles.desktopSection]}>
          <TouchableOpacity accessibilityRole="button" onPress={handlePickCover} style={styles.profileCover}>
            {user?.coverImage ? <Image source={{ uri: user.coverImage }} style={styles.profileCoverImage} /> : (
              <LinearGradient colors={gradients.primary} style={styles.profileCoverImage} />
            )}
            <View style={[styles.coverAction, isRTL && styles.coverActionRtl]}>
              <Ionicons name="camera-outline" size={16} color={colors.textInverse} />
              <Text style={styles.coverActionText}>{t('profile_change_cover')}</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.userInfo}>

            {/* Tappable avatar */}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('profile')} onPress={handlePickAvatar} style={styles.avatarWrapper}>
              <LinearGradient colors={gradients.primary} style={styles.avatarRing}>
              {user?.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={44} color={colors.textMuted} />
                </View>
              )}
              </LinearGradient>
              <View style={styles.cameraOverlay}>
                <Ionicons name="camera" size={14} color={colors.textInverse} />
              </View>
            </TouchableOpacity>

            <View style={styles.userDetails}>
              {/* Tappable name */}
              <TouchableOpacity onPress={openNameModal} style={styles.nameRow}>
                <Text style={styles.userName}>{user?.name || 'User'}</Text>
                <Ionicons name="pencil" size={14} color={colors.textMuted} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
              <Text style={styles.userEmail} numberOfLines={1} ellipsizeMode="middle">{user?.email || 'user@example.com'}</Text>
              <TouchableOpacity accessibilityRole="button" onPress={openBioModal} style={styles.bioEditRow}>
                <Text numberOfLines={2} style={styles.profileBio}>{user?.bio || t('profile_add_bio')}</Text>
                <Ionicons name="pencil-outline" size={14} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={styles.accountBadge}>
                <Text style={styles.accountBadgeText}>{t(`account_role_${(user?.role || 'USER').toLowerCase()}` as any)}</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!user?.id}
                onPress={() => user?.id && navigation.navigate('MyProfile')}
                style={[styles.publicProfileLink, isRTL && styles.rowRtl]}
              >
                <Ionicons name="person-circle-outline" size={16} color={colors.primary} />
                <Text style={styles.publicProfileLinkText}>{t('profile_view_my_profile')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
            {isWebDesktop ? (
              <View style={[styles.profileStats, isWebDesktop && styles.desktopProfileStats]}>
                <View style={styles.profileStat}>
                  <Text style={styles.profileStatValue}>{user?.interests?.length || 0}</Text>
                  <Text style={styles.profileStatLabel}>{t('your_interests')}</Text>
                </View>
                <View style={styles.profileStat}>
                  <Text style={styles.profileStatValue}>{user?.preferences?.homeLayout?.order?.length || 0}</Text>
                  <Text style={styles.profileStatLabel}>{t('home_sections')}</Text>
                </View>
              </View>
            ) : null}
            </View>
            <View style={isWebDesktop ? styles.desktopSettings : undefined}>

        <View style={[styles.section, isWebDesktop && styles.desktopSection]}>
          <Text style={styles.sectionTitle}>{t('account_plan_title')}</Text>
          <View style={[styles.accountPlanRow, isRTL && styles.rowRtl]}>
            <View style={styles.accountPlanIcon}>
              <Ionicons name="diamond-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.accountPlanCopy}>
              <Text style={[styles.accountPlanName, isRTL && styles.reminderLabelRtl]}>
                {t(`account_role_${accountRole.toLowerCase()}` as any)}
              </Text>
              <Text style={[styles.accountPlanHelp, isRTL && styles.reminderLabelRtl]}>{t(accountPlan.help)}</Text>
            </View>
            {canPurchasePlansInApp ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={accountPlanButtonText}
                style={styles.accountPlanButton}
                onPress={() => handleNavigateToPlans(accountPlan.plan)}
              >
                <Text style={styles.accountPlanButtonText}>{accountPlanButtonText}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={[styles.section, isWebDesktop && styles.desktopSection]}>
          <View style={styles.remindersContent}>
            <View style={[styles.reminderRow, isRTL && styles.rowRtl]}>
              <View style={styles.privacySettingCopy}>
                <Text style={styles.menuItemText}>{t('profile_private_label')}</Text>
                <Text style={[styles.remindersHelp, locale === 'ar' && styles.reminderLabelRtl]}>{t('profile_private_explanation')}</Text>
              </View>
              <Switch
                accessibilityLabel={t('profile_private_label')}
                value={Boolean(user?.isPrivate)}
                disabled={isSavingPrivacy}
                onValueChange={(value: boolean) => void handlePrivacyChange(value)}
                trackColor={{ false: colors.borderStrong, true: colors.primarySoft }}
                thumbColor={user?.isPrivate ? colors.primary : colors.surface}
              />
            </View>
          </View>
        </View>

        {/* ── Menu ── */}
        <View style={[styles.section, isWebDesktop && styles.desktopSection]}>
          <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToWallet}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="wallet-outline" size={24} color={colors.primary} />
              <Text style={styles.menuItemText}>{t('my_wallet')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToInterests}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="heart-outline" size={24} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>{t('update_interests')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToCustomizeHome}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="grid-outline" size={24} color={colors.primary} />
              <Text style={styles.menuItemText}>{t('customize_home')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {!isProductionApp ? (
            <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToConnectionTest}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="wifi-outline" size={24} color={colors.textSecondary} />
                <Text style={styles.menuItemText}>{t('connection_test')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.section, styles.remindersCard, isWebDesktop && styles.desktopSection]}>
          <Text style={styles.sectionTitle}>{t('reminders')}</Text>
          <View style={styles.remindersContent}>
            {([
              { key: 'email', label: t('email_reminders') },
              { key: 'whatsapp', label: t('whatsapp_reminders') },
              { key: 'saved', label: t('saved_event_reminders') },
            ] as const).map(({ key, label }, index) => (
              <View
                key={key}
                style={[
                  styles.reminderRow,
                  locale === 'ar' && styles.reminderRowRtl,
                  index === 2 && styles.reminderRowLast,
                ]}
              >
                <Text style={[styles.reminderLabel, locale === 'ar' && styles.reminderLabelRtl]}>{label}</Text>
                <Switch
                  accessibilityLabel={label}
                  value={reminderSettings[key]}
                  onValueChange={(value: boolean) => {
                    setReminderSettings(current => ({ ...current, [key]: value }));
                    setRemindersSaved(false);
                  }}
                  trackColor={{ false: colors.borderStrong, true: colors.primarySoft }}
                  thumbColor={reminderSettings[key] ? colors.primary : colors.surface}
                  ios_backgroundColor={colors.borderStrong}
                />
              </View>
            ))}
            <Text style={[styles.remindersPhoneLabel, locale === 'ar' && styles.reminderLabelRtl]}>
              {t('whatsapp_number')}
            </Text>
            <TextInput
              accessibilityLabel={t('whatsapp_number')}
              style={[
                styles.remindersPhoneInput,
                locale === 'ar' && styles.remindersPhoneInputRtl,
                phoneIsInvalid && styles.remindersPhoneInputInvalid,
              ]}
              value={reminderPhone}
              onChangeText={(value: string) => {
                setReminderPhone(value);
                setRemindersSaved(false);
              }}
              placeholder="+9715XXXXXXXX"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              autoCapitalize="none"
              textAlign={locale === 'ar' ? 'right' : 'left'}
            />
            {phoneIsInvalid ? (
              <Text style={[styles.remindersError, locale === 'ar' && styles.reminderLabelRtl]}>
                {t('invalid_whatsapp_number')}
              </Text>
            ) : null}
            <Text style={[styles.remindersHelp, locale === 'ar' && styles.reminderLabelRtl]}>
              {t('reminders_helper')}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('save')}
              style={[
                styles.remindersSaveButton,
                locale === 'ar' && styles.remindersSaveButtonRtl,
                (isSavingReminders || phoneIsInvalid) && styles.remindersSaveButtonDisabled,
              ]}
              onPress={() => void handleSaveReminders()}
              disabled={isSavingReminders || phoneIsInvalid}
            >
              {isSavingReminders ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.remindersSaveText}>{t('save')}</Text>
              )}
            </TouchableOpacity>
            {remindersSaved ? (
              <Text style={[styles.remindersSuccess, locale === 'ar' && styles.reminderLabelRtl]}>
                {t('reminders_saved_success')}
              </Text>
            ) : null}
            {remindersError ? (
              <Text style={[styles.remindersError, locale === 'ar' && styles.reminderLabelRtl]}>
                {remindersError}
              </Text>
            ) : null}
          </View>
        </View>

        {canPurchasePlansInApp || isHost(user) ? (
        <View style={[styles.section, isWebDesktop && styles.desktopSection]}>
          <Text style={styles.sectionTitle}>{t('host')}</Text>
          {!isHost(user) ? (
            canPurchasePlansInApp ? (
            <>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigateToPlans('HOST')}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="rocket-outline" size={24} color={colors.primary} />
                  <Text style={styles.menuItemText}>{t('upgrade_to_host')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigateToPlans('SUPPLIER')}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="storefront-outline" size={24} color={colors.primary} />
                  <Text style={styles.menuItemText}>{t('become_supplier')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </>
            ) : null
          ) : (
            <>
              <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToCreateEvent}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                  <Text style={styles.menuItemText}>{t('create_event')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToHostDashboard}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="stats-chart-outline" size={24} color={colors.primary} />
                  <Text style={styles.menuItemText}>{t('host_dashboard')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToMyEvents}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="calendar-outline" size={24} color={colors.primary} />
                  <Text style={styles.menuItemText}>{t('my_events')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
              {canPurchasePlansInApp && user?.role === 'ORGANIZER' ? (
                <TouchableOpacity style={styles.menuItem} onPress={() => handleNavigateToPlans('SUPPLIER')}>
                  <View style={styles.menuItemLeft}>
                    <Ionicons name="storefront-outline" size={24} color={colors.primary} />
                    <Text style={styles.menuItemText}>{t('become_supplier')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </>
          )}
          <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToFindFriends}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="people-outline" size={24} color={colors.primary} />
              <Text style={styles.menuItemText}>{t('find_friends')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          {isSupplier(user) || isAdmin(user) ? (
            <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToSupplierPortal}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="storefront-outline" size={24} color={colors.primary} />
                <Text style={styles.menuItemText}>{t('supplier_portal')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
          {isAdmin(user) ? (
            <>
              <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToVerifyOrganizers}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="shield-checkmark-outline" size={24} color={colors.primary} />
                  <Text style={styles.menuItemText}>{t('verify_organizers')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToAdminConsole}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="briefcase-outline" size={24} color={colors.primary} />
                  <Text style={styles.menuItemText}>{t('admin_console')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToAdminModeration}>
                <View style={styles.menuItemLeft}>
                  <Ionicons name="people-circle-outline" size={24} color={colors.primary} />
                  <Text style={styles.menuItemText}>{t('moderation_title')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
        ) : (
          <View style={[styles.section, isWebDesktop && styles.desktopSection]}>
            <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToFindFriends}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="people-outline" size={24} color={colors.primary} />
                <Text style={styles.menuItemText}>{t('find_friends')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.section, isWebDesktop && styles.desktopSection]}>
          <TouchableOpacity
            style={styles.menuItem}
            accessibilityRole="button"
            onPress={() => openLegalPage('privacy')}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="document-text-outline" size={24} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>{t('privacy_policy')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            accessibilityRole="button"
            onPress={() => openLegalPage('terms')}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="document-outline" size={24} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>{t('terms_of_service')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuItem}
            accessibilityRole="button"
            onPress={() => {
              setDeleteAccountPassword('');
              setShowDeleteAccountModal(true);
            }}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name="trash-outline" size={24} color={colors.danger} />
              <Text style={[styles.menuItemText, { color: colors.danger }]}>{t('delete_account')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={[styles.section, isWebDesktop && styles.desktopSection]}>
          <TouchableOpacity style={styles.menuItem} onPress={logout}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="log-out-outline" size={24} color={colors.danger} />
              <Text style={[styles.menuItemText, { color: colors.danger }]}>{t('log_out')}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, isWebDesktop && styles.desktopSection]}>
          <Text style={styles.sectionTitle}>{t('language')}</Text>
          <View style={styles.languageToggle}>
            <TouchableOpacity
              style={[styles.languageOption, locale === 'en' && styles.languageOptionActive]}
              onPress={() => void handleLocaleChange('en')}
            >
              <Text style={[styles.languageOptionText, locale === 'en' && styles.languageOptionTextActive]}>{t('english')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.languageOption, locale === 'ar' && styles.languageOptionActive]}
              onPress={() => void handleLocaleChange('ar')}
            >
              <Text style={[styles.languageOptionText, locale === 'ar' && styles.languageOptionTextActive]}>{t('arabic')}</Text>
            </TouchableOpacity>
          </View>
        </View>
            </View>
          </View>
        </Container>
      </ScrollView>

      {/* ── Edit Name Modal ── */}
      <Modal
        visible={showNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('edit_name')}</Text>
            <TextInput
              style={styles.nameInput}
              value={editName}
              onChangeText={setEditName}
              placeholder={t('enter_name')}
              placeholderTextColor={colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowNameModal(false)}
              >
                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveName}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.saveBtnText}>{t('save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={showBioModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBioModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('profile_bio')}</Text>
            <TextInput
              style={[styles.nameInput, styles.bioInput]}
              value={editBio}
              onChangeText={setEditBio}
              placeholder={t('profile_bio_placeholder')}
              placeholderTextColor={colors.textMuted}
              maxLength={500}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowBioModal(false)}>
                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveBio} disabled={isSaving}>
                {isSaving ? <ActivityIndicator size="small" color={colors.textInverse} /> : <Text style={styles.saveBtnText}>{t('save')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={showDeleteAccountModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteAccountModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, isRTL && styles.deleteModalRtl]}>{t('account_delete_title')}</Text>
            <Text style={[styles.deleteModalBody, isRTL && styles.deleteModalRtl]}>{t('account_delete_body')}</Text>
            {deleteAccountNeedsPassword ? (
              <TextInput
                accessibilityLabel={t('password')}
                style={[styles.nameInput, isRTL && styles.deleteModalRtl]}
                value={deleteAccountPassword}
                onChangeText={setDeleteAccountPassword}
                placeholder={t('password')}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
              />
            ) : null}
            <View style={[styles.modalButtons, isRTL && styles.rowRtl]}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowDeleteAccountModal(false)}
                disabled={isDeletingAccount}
              >
                <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteAccountButton}
                onPress={() => void handleDeleteAccount()}
                disabled={isDeletingAccount}
                accessibilityRole="button"
                accessibilityLabel={t('delete_account')}
              >
                {isDeletingAccount
                  ? <ActivityIndicator size="small" color={colors.textInverse} />
                  : <Text style={styles.saveBtnText}>{t('delete_account')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  desktopPage: { flex: 1, width: '100%', maxWidth: 1240, alignSelf: 'center' },
  mobileProfileContainer: { paddingHorizontal: 0 },
  profileColumns: { width: '100%' },
  desktopProfileColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  desktopHeader: { paddingHorizontal: 0 },
  desktopSummary: { width: '34%' },
  desktopSettings: { flex: 1, minWidth: 0 },
  desktopSection: { marginHorizontal: 0 },
  desktopProfileStats: { marginHorizontal: 0 },
  accountPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  accountPlanIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  accountPlanCopy: { flex: 1, minWidth: 0 },
  accountPlanName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  accountPlanHelp: { ...type.caption, color: colors.textMuted, marginTop: 4, flexShrink: 1, flexWrap: 'wrap' },
  accountPlanButton: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    flexShrink: 0,
  },
  accountPlanButtonText: { color: colors.textInverse, fontSize: 13, fontWeight: '700' },
  profileStats: { flexDirection: 'row', gap: 12, marginHorizontal: 20, marginTop: 16 },
  profileStat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, ...shadow.card },
  profileStatValue: { ...type.h2, color: colors.primary },
  profileStatLabel: { ...type.caption, marginTop: 4 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    ...type.h1,
  },
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: radius.lg,
    paddingVertical: 10,
    ...shadow.card,
  },
  remindersCard: {
    paddingBottom: 20,
  },
  remindersContent: {
    paddingHorizontal: 20,
  },
  privacySettingCopy: { flex: 1, paddingVertical: 10, paddingEnd: 14 },
  reminderRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  reminderRowRtl: {
    flexDirection: 'row',
  },
  reminderRowLast: {
    borderBottomWidth: 0,
  },
  reminderLabel: {
    flex: 1,
    marginRight: 16,
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  reminderLabelRtl: {
    textAlign: 'right',
  },
  remindersPhoneLabel: {
    ...type.label,
    marginTop: 8,
    marginBottom: 8,
  },
  remindersPhoneInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.bg,
    color: colors.text,
    fontSize: 15,
  },
  remindersPhoneInputRtl: {
    textAlign: 'right',
  },
  remindersPhoneInputInvalid: {
    borderColor: colors.danger,
  },
  remindersHelp: {
    ...type.caption,
    lineHeight: 20,
    marginTop: 14,
    marginBottom: 16,
  },
  remindersError: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 6,
  },
  remindersSuccess: {
    color: colors.success,
    fontSize: 13,
    marginTop: 10,
  },
  remindersSaveButton: {
    alignSelf: 'flex-start',
    minWidth: 120,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  remindersSaveButtonRtl: {
    alignSelf: 'flex-end',
  },
  remindersSaveButtonDisabled: {
    opacity: 0.55,
  },
  remindersSaveText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  languageToggle: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  languageOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  languageOptionActive: {
    backgroundColor: colors.primary,
  },
  languageOptionText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  languageOptionTextActive: {
    color: colors.textInverse,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  profileCover: {
    height: 126,
    marginHorizontal: 20,
    marginTop: 10,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
  },
  profileCoverImage: { width: '100%', height: '100%' },
  coverAction: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(20,15,46,0.72)',
  },
  coverActionRtl: { right: undefined, left: 10 },
  coverActionText: { color: colors.textInverse, fontSize: 12, fontWeight: '700' },
  avatarWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarRing: { width: 80, height: 80, borderRadius: 40, padding: 3 },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.textInverse,
  },
  userDetails: {
    marginLeft: 16,
    flex: 1,
    minWidth: 0,
  },
  bioEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  profileBio: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  userEmail: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  accountBadge: {
    alignSelf: 'flex-start',
    marginTop: 7,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  accountBadgeText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
  },
  publicProfileLink: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8 },
  rowRtl: { flexDirection: 'row-reverse' },
  publicProfileLinkText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalContent: {
    width: '100%',
    backgroundColor: colors.textInverse,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
    marginBottom: 20,
  },
  bioInput: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textInverse,
  },
  deleteAccountButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  deleteModalBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  deleteModalRtl: { textAlign: 'right' },
});

export default ProfileScreen;
