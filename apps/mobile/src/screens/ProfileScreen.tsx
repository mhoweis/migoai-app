import { colors } from '../theme';
// src/screens/ProfileScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUserStore } from '../store/userStore';
import { ProfileStackParamList } from '../navigation/MainTabNavigator';
import { navigationRef } from '../navigation/navigationRef';
import { authService } from '../services/auth.service';
import { setLocale, useLocale } from '../i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, radius, shadow, type } from '../theme';

type ProfileScreenNavigationProp = NavigationProp<ProfileStackParamList, 'ProfileMain'>;

const ProfileScreen = () => {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { user, logout, updateProfile, setUser } = useUserStore();
  const { locale, t } = useLocale();

  const [showNameModal, setShowNameModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
      const uri = result.assets[0].uri;
      // 'localProfileAvatar' key is NOT removed on logout, so it survives re-login
      await AsyncStorage.setItem('localProfileAvatar', uri);
      if (user) await setUser({ ...user, avatar: uri });
    }
  };

  // ── Name edit ─────────────────────────────────────────────────────────────
  const openNameModal = () => {
    setEditName(user?.name || '');
    setShowNameModal(true);
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

  const handleNavigateToMyEvents = () => {
    navigation.navigate('MyEvents');
  };

  const handleNavigateToFindFriends = () => {
    navigation.navigate('FindFriends');
  };

  const handleNavigateToVerifyOrganizers = () => {
    (navigation as any).navigate('VerifyOrganizers');
  };

  const handleLocaleChange = async (next: 'en' | 'ar') => {
    await setLocale(next);
    if (user) {
      void authService.updateLocale(next).then(updated => setUser(updated)).catch(() => undefined);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>{t('profile')}</Text>
        </View>

        {/* ── User Info ── */}
        <View style={styles.section}>
          <View style={styles.userInfo}>

            {/* Tappable avatar */}
            <TouchableOpacity onPress={handlePickAvatar} style={styles.avatarWrapper}>
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
              <Text style={styles.userEmail}>{user?.email || 'user@example.com'}</Text>
            </View>
          </View>
        </View>

        {/* ── Menu ── */}
        <View style={styles.section}>
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

          <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToConnectionTest}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="wifi-outline" size={24} color={colors.textSecondary} />
              <Text style={styles.menuItemText}>{t('connection_test')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('host')}</Text>
          <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToCreateEvent}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
              <Text style={styles.menuItemText}>{t('create_event')}</Text>
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
          <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToFindFriends}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="people-outline" size={24} color={colors.primary} />
              <Text style={styles.menuItemText}>{t('find_friends')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          {(user as any)?.role === 'ADMIN' || (user as any)?.isAdmin ? (
            <TouchableOpacity style={styles.menuItem} onPress={handleNavigateToVerifyOrganizers}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="shield-checkmark-outline" size={24} color={colors.primary} />
                <Text style={styles.menuItemText}>{t('verify_organizers')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.menuItem} onPress={logout}>
            <View style={styles.menuItemLeft}>
              <Ionicons name="log-out-outline" size={24} color={colors.danger} />
              <Text style={[styles.menuItemText, { color: colors.danger }]}>{t('log_out')}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
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
  },
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
});

export default ProfileScreen;
