import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import type { Event } from '@migo/shared';
import { profileService, ProfileEvent, PublicProfile, ReviewSummary } from '../services/profile.service';
import { authService } from '../services/auth.service';
import { socialService } from '../services/social.service';
import { uploadService } from '../services/upload.service';
import { useUserStore } from '../store/userStore';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useLocale, formatEventDate } from '../i18n';
import { navigateToTab } from '../navigation/navigationRef';
import EventCard from '../components/EventCard';
import ReviewCards from '../components/ReviewCards';
import Container from '../components/Container';
import { AdminBackButton, EmptyState } from '../components/AdminAnalyticsUI';
import { colors, gradients, radius, shadow, type } from '../theme';

type ProfileTab = 'upcoming' | 'past' | 'attended' | 'hosted' | 'reviews';

const profileTabs: ProfileTab[] = ['upcoming', 'past', 'attended', 'hosted', 'reviews'];

const eventId = (event: Event) => event.id;

export default function UserProfileScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t, isRTL } = useLocale();
  const { isWebDesktop } = useBreakpoint();
  const { user: currentUser, setUser } = useUserStore();
  const userId = String(route.params?.userId || currentUser?.id || '');
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [selectedTab, setSelectedTab] = useState<ProfileTab>('upcoming');
  const [events, setEvents] = useState<ProfileEvent[]>([]);
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [followingBusy, setFollowingBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [editCover, setEditCover] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!userId) return;
    try {
      setError(false);
      setProfile(await profileService.profile(userId));
    } catch {
      setProfile(null);
      setError(true);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void loadProfile();
  }, [loadProfile]));

  const loadTab = useCallback(async (tab: ProfileTab, nextPage = 1, append = false) => {
    if (!userId) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      if (tab === 'reviews') {
        const response = await profileService.reviews(userId, nextPage);
        setReviews(current => append ? [...current, ...response.items] : response.items);
        setTotal(response.total);
      } else {
        const response = await profileService.events(userId, tab, nextPage);
        setEvents(current => append ? [...current, ...response.items] : response.items);
        setTotal(response.total);
      }
      setPage(nextPage);
    } catch {
      if (!append) {
        setEvents([]);
        setReviews([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [userId]);

  useEffect(() => {
    if (profile?.canViewContent) void loadTab(selectedTab);
  }, [loadTab, profile?.canViewContent, selectedTab]);

  const toggleFollow = async () => {
    if (!profile || followingBusy) return;
    setFollowingBusy(true);
    try {
      if (profile.isFollowing || profile.followRequested) await socialService.unfollow(userId);
      else await socialService.follow(userId);
      await loadProfile();
    } catch {
      setError(true);
    } finally {
      setFollowingBusy(false);
    }
  };

  const chooseTab = (tab: ProfileTab) => {
    setSelectedTab(tab);
    setEvents([]);
    setReviews([]);
    setTotal(0);
    setPage(1);
  };

  const openConnections = (typeName: 'followers' | 'following' | 'requests') => {
    if (typeName === 'requests') {
      navigateToTab('Profile', 'FollowList', { userId, tab: typeName });
      return;
    }
    navigation.navigate('FollowList', { userId, tab: typeName });
  };

  const openPerson = (id: string) => {
    if (id !== userId) navigation.push('UserProfile', { userId: id });
  };

  const showMore = () => {
    void loadTab(selectedTab, page + 1, true);
  };

  const openEditProfile = () => {
    setEditBio(profile?.user.bio || '');
    setEditPrivate(Boolean(profile?.user.isPrivate));
    setEditAvatar(profile?.user.avatar || null);
    setEditCover(profile?.user.coverImage || null);
    setEditOpen(true);
  };

  const chooseProfileImage = async (target: 'avatar' | 'cover') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(t('profile_photo_permission'), t('profile_photo_permission_help'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: target === 'cover' ? [16, 9] : [1, 1],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingImage(true);
    try {
      const url = await uploadService.uploadImage(asset.uri, {
        name: asset.fileName || (target === 'cover' ? 'profile-cover.jpg' : 'avatar.jpg'),
        type: asset.mimeType || 'image/jpeg',
      });
      if (target === 'cover') setEditCover(url);
      else setEditAvatar(url);
    } catch {
      Alert.alert(t('error'), t('profile_image_upload_failed'));
    } finally {
      setUploadingImage(false);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await authService.updateProfile({
        bio: editBio.trim() || null,
        avatar: editAvatar,
        coverImage: editCover,
        isPrivate: editPrivate,
      });
      await setUser(updated);
      setProfile(await profileService.profile(userId));
      setEditOpen(false);
    } catch {
      Alert.alert(t('error'), t('profile_save_failed'));
    } finally {
      setSavingProfile(false);
    }
  };

  if (!profile && loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (!profile) {
    return (
      <Container style={styles.page}>
        {route.name !== 'MyProfile' && navigation.canGoBack() ? <AdminBackButton label={t('back')} rtl={isRTL} onPress={() => navigation.goBack()} /> : null}
        <EmptyState label={error ? t('profile_not_found') : t('profile_not_found')} />
      </Container>
    );
  }

  const roleLabelKey = `account_role_${profile.user.role.toLowerCase()}` as any;
  const isHost = ['ORGANIZER', 'SUPPLIER', 'ADMIN'].includes(profile.user.role);
  const visibleTabs = profileTabs.filter(tab => tab !== 'hosted' || profile.counts.hosted > 0 || isHost);
  const tabCounts: Record<ProfileTab, number> = {
    upcoming: profile.counts.upcoming,
    past: profile.counts.past,
    attended: profile.counts.attended,
    hosted: profile.counts.hosted,
    reviews: profile.counts.reviews,
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <Container style={styles.page}>
        {route.name !== 'MyProfile' && navigation.canGoBack() ? <AdminBackButton label={t('back')} rtl={isRTL} onPress={() => navigation.goBack()} /> : null}
        <View style={[styles.hero, isWebDesktop && styles.heroDesktop]}>
          <View style={[styles.cover, isWebDesktop && styles.coverDesktop]}>
            {profile.user.coverImage ? <Image source={{ uri: profile.user.coverImage }} style={styles.coverImage} /> : (
              <View style={styles.coverFallback}>
                <Ionicons name="sparkles-outline" size={32} color={colors.primary} />
              </View>
            )}
          </View>
          <View style={[styles.profileLayout, isWebDesktop && styles.profileLayoutDesktop]}>
            <View style={[styles.profileSidebar, isWebDesktop && styles.profileSidebarDesktop]}>
              <View style={[styles.identity, isRTL && styles.rowRtl]}>
                <LinearGradient colors={gradients.primary} style={styles.avatarRing}>
                  {profile.user.avatar ? (
                    <Image source={{ uri: profile.user.avatar }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}><Ionicons name="person" size={36} color={colors.primary} /></View>
                  )}
                </LinearGradient>
                <View style={styles.identityCopy}>
                  <View style={[styles.nameRow, isRTL && styles.rowRtl]}>
                    <Text style={[styles.name, isRTL && styles.textRtl]}>{profile.user.name || t('profile_user')}</Text>
                    {profile.user.isPrivate ? <Ionicons name="lock-closed" size={14} color={colors.textMuted} /> : null}
                    <View style={styles.roleBadge}><Text style={styles.roleText}>{t(roleLabelKey)}</Text></View>
                  </View>
                  {profile.followsYou ? <Text style={styles.followsYou}>{t('profile_follows_you')}</Text> : null}
                  {profile.user.bio ? <Text style={[styles.bio, isRTL && styles.textRtl]}>{profile.user.bio}</Text> : (
                    <Text style={[styles.bioEmpty, isRTL && styles.textRtl]}>{t('profile_no_bio')}</Text>
                  )}
                  <Text style={styles.joined}>{t('profile_joined', { date: formatEventDate(profile.user.createdAt) })}</Text>
                </View>
              </View>
              {profile.isMe ? (
                <View style={[styles.profileActions, isRTL && styles.rowRtl]}>
                  <TouchableOpacity accessibilityRole="button" onPress={openEditProfile} style={styles.followButton}>
                    <Text style={styles.followButtonText}>{t('profile_edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('ProfileMain')} style={styles.settingsButton}>
                    <Ionicons name="settings-outline" size={17} color={colors.primary} />
                    <Text style={styles.settingsButtonText}>{t('account_settings')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={followingBusy}
                  onPress={() => void toggleFollow()}
                  style={[styles.followButton, (profile.isFollowing || profile.followRequested) && styles.followingButton]}
                >
                  {followingBusy ? <ActivityIndicator color={profile.isFollowing || profile.followRequested ? colors.primary : colors.textInverse} size="small" /> : (
                    <Text style={[styles.followButtonText, (profile.isFollowing || profile.followRequested) && styles.followingText]}>
                      {profile.isFollowing ? t('following') : profile.followRequested ? t('requested') : t('follow')}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              {profile.isMe && (profile.pendingRequests || 0) > 0 ? (
                <TouchableOpacity accessibilityRole="button" onPress={() => openConnections('requests')} style={styles.requestsButton}>
                  <Ionicons name="person-add-outline" size={16} color={colors.primary} />
                  <Text style={styles.settingsButtonText}>{t('profile_follow_requests_count', { count: profile.pendingRequests ?? 0 })}</Text>
                </TouchableOpacity>
              ) : null}
              <View style={[styles.stats, isRTL && styles.rowRtl]}>
                <TouchableOpacity accessibilityRole="button" disabled={!profile.canViewContent} onPress={() => openConnections('followers')} style={styles.stat}>
                  <Text style={styles.statNumber}>{profile.counts.followers}</Text><Text style={styles.statLabel}>{t('followers')}</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" disabled={!profile.canViewContent} onPress={() => openConnections('following')} style={styles.stat}>
                  <Text style={styles.statNumber}>{profile.counts.following}</Text><Text style={styles.statLabel}>{t('following')}</Text>
                </TouchableOpacity>
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>{profile.counts.attended}</Text><Text style={styles.statLabel}>{t('profile_attended')}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statNumber}>{profile.counts.reviews}</Text><Text style={styles.statLabel}>{t('profile_reviews')}</Text>
                </View>
              </View>
            </View>
            <View style={styles.profileMain}>
              {!profile.canViewContent ? (
                <View style={styles.lockedState}>
                  <Ionicons name="lock-closed-outline" size={34} color={colors.primary} />
                  <Text style={styles.lockedTitle}>{t('profile_private_title')}</Text>
                  <Text style={styles.lockedDescription}>{t('profile_private_description')}</Text>
                </View>
              ) : (
              <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabs, isRTL && styles.tabsRtl]}>
                {visibleTabs.map(tab => (
                  <TouchableOpacity
                    key={tab}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: selectedTab === tab }}
                    onPress={() => chooseTab(tab)}
                    style={[styles.tab, selectedTab === tab && styles.tabSelected]}
                  >
                    <Text style={[styles.tabText, selectedTab === tab && styles.tabTextSelected]}>
                      {t(`profile_tab_${tab}` as any)} <Text style={styles.tabCount}>({tabCounts[tab]})</Text>
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.tabContent}>
                {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
                {!loading && selectedTab === 'reviews' ? (
                  reviews.length ? (
                    <ReviewCards
                      items={reviews}
                      onAuthorPress={openPerson}
                      onEventPress={id => navigateToTab('Events', 'EventDetail', { eventId: id })}
                    />
                  ) : <EmptyState label={t('profile_no_reviews')} />
                ) : null}
                {!loading && selectedTab !== 'reviews' ? (
                  events.length ? (
                    <View style={[styles.eventGrid, isWebDesktop && styles.eventGridDesktop]}>
                      {events.map(event => (
                        <View key={event.id} style={[styles.eventItem, isWebDesktop && styles.eventItemDesktop]}>
                          <EventCard event={event} onPress={() => navigateToTab('Events', 'EventDetail', { eventId: eventId(event) })} />
                          <View style={styles.relationBadge}>
                            <Text style={styles.relationText}>{t(`profile_relation_${event.relation}` as any)}</Text>
                          </View>
                          {(event as any).status === 'BANNED' ? (
                            <View style={styles.bannedBadge}><Text style={styles.bannedText}>{t('profile_event_banned')}</Text></View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : <EmptyState label={t('profile_no_events')} />
                ) : null}
                {!loading && total > (selectedTab === 'reviews' ? reviews.length : events.length) ? (
                  <TouchableOpacity accessibilityRole="button" disabled={loadingMore} onPress={showMore} style={styles.loadMore}>
                    {loadingMore ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.loadMoreText}>{t('load_more')}</Text>}
                  </TouchableOpacity>
                ) : null}
              </View>
              </>
              )}
            </View>
          </View>
        </View>
        <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={[styles.modalHeader, isRTL && styles.rowRtl]}>
                <Text style={styles.modalTitle}>{t('profile_edit')}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close')} onPress={() => setEditOpen(false)}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={[styles.imageActions, isRTL && styles.rowRtl]}>
                <TouchableOpacity accessibilityRole="button" disabled={uploadingImage} onPress={() => void chooseProfileImage('avatar')} style={styles.imageAction}>
                  {editAvatar ? <Image source={{ uri: editAvatar }} style={styles.editAvatar} /> : (
                    <View style={styles.editAvatarFallback}><Ionicons name="person" size={22} color={colors.primary} /></View>
                  )}
                  <Text style={styles.imageActionText}>{t('profile_change_photo')}</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" disabled={uploadingImage} onPress={() => void chooseProfileImage('cover')} style={styles.coverAction}>
                  {editCover ? <Image source={{ uri: editCover }} style={styles.editCover} /> : (
                    <View style={styles.editCoverFallback}><Ionicons name="image-outline" size={22} color={colors.primary} /></View>
                  )}
                  <Text style={styles.imageActionText}>{t('profile_change_cover')}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.coverHint}>{t('profile_cover_hint')}</Text>
              <View style={[styles.privacyRow, isRTL && styles.rowRtl]}>
                <View style={styles.privacyCopy}>
                  <Text style={styles.inputLabel}>{t('profile_private_label')}</Text>
                  <Text style={styles.coverHint}>{t('profile_private_explanation')}</Text>
                </View>
                <Switch
                  accessibilityLabel={t('profile_private_label')}
                  value={editPrivate}
                  onValueChange={setEditPrivate}
                  trackColor={{ false: colors.borderStrong, true: colors.primarySoft }}
                  thumbColor={editPrivate ? colors.primary : colors.surface}
                />
              </View>
              <Text style={styles.inputLabel}>{t('profile_about')}</Text>
              <TextInput
                value={editBio}
                onChangeText={setEditBio}
                maxLength={500}
                multiline
                textAlignVertical="top"
                placeholder={t('profile_add_bio')}
                placeholderTextColor={colors.textMuted}
                style={[styles.bioInput, isRTL && styles.textRtl]}
              />
              <Text style={[styles.bioCounter, isRTL && styles.textRtl]}>{editBio.length}/500</Text>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={savingProfile || uploadingImage}
                onPress={() => void saveProfile()}
                style={[styles.saveButton, (savingProfile || uploadingImage) && styles.saveButtonDisabled]}
              >
                {savingProfile || uploadingImage ? <ActivityIndicator color={colors.textInverse} /> : (
                  <Text style={styles.saveButtonText}>{t('profile_save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingBottom: 40 },
  page: { paddingTop: 18, paddingBottom: 30 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  hero: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginTop: 10, ...shadow.card },
  heroDesktop: { maxWidth: 1120, width: '100%', alignSelf: 'center' },
  cover: { height: 210, backgroundColor: colors.primarySoft },
  coverDesktop: { height: 250 },
  coverImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  coverFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  profileLayout: { padding: 20 },
  profileLayoutDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: 28 },
  profileSidebar: { minWidth: 0 },
  profileSidebarDesktop: { width: 320, flexShrink: 0 },
  profileMain: { flex: 1, minWidth: 0 },
  identity: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginTop: -40 },
  rowRtl: { flexDirection: 'row-reverse' },
  avatarRing: { width: 88, height: 88, borderRadius: 44, padding: 4, flexShrink: 0 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.surfaceAlt },
  avatarFallback: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  identityCopy: { flex: 1, minWidth: 0, paddingTop: 36 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { ...type.h2, color: colors.ink },
  textRtl: { textAlign: 'right' },
  roleBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  roleText: { color: colors.primaryDark, fontSize: 11, fontWeight: '800' },
  followsYou: { color: colors.info, fontSize: 12, fontWeight: '700', marginTop: 4 },
  bio: { ...type.body, color: colors.textSecondary, marginTop: 5 },
  bioEmpty: { ...type.body, color: colors.textMuted, marginTop: 5 },
  joined: { ...type.caption, marginTop: 5 },
  followButton: { minWidth: 92, minHeight: 40, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, borderRadius: radius.pill, backgroundColor: colors.primary, marginTop: 16 },
  profileActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 },
  followButtonText: { color: colors.textInverse, fontWeight: '800' },
  followingButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  followingText: { color: colors.primary },
  settingsButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, marginTop: 16 },
  settingsButtonText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  requestsButton: { minHeight: 38, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primarySoft, backgroundColor: colors.surface, marginTop: 10 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, marginTop: 18, paddingTop: 14, gap: 8 },
  stat: { alignItems: 'center', minWidth: 66 },
  statNumber: { color: colors.ink, fontWeight: '800', fontSize: 18 },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 3, textAlign: 'center' },
  tabs: { gap: 8, paddingVertical: 2, paddingHorizontal: 2, marginBottom: 18 },
  tabsRtl: { flexDirection: 'row-reverse' },
  tab: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  tabTextSelected: { color: colors.textInverse },
  tabCount: { fontWeight: '500' },
  tabContent: { minWidth: 0 },
  lockedState: { minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 28, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 10 },
  lockedTitle: { ...type.h3, color: colors.ink, textAlign: 'center' },
  lockedDescription: { ...type.body, color: colors.textMuted, textAlign: 'center', maxWidth: 360 },
  loader: { marginVertical: 24 },
  eventGrid: { gap: 16 },
  eventGridDesktop: { flexDirection: 'row', flexWrap: 'wrap' },
  eventItem: { width: '100%', position: 'relative' },
  eventItemDesktop: { width: '48%' },
  relationBadge: { position: 'absolute', right: 10, bottom: 10, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  relationText: { color: colors.primaryDark, fontSize: 11, fontWeight: '700' },
  bannedBadge: { position: 'absolute', left: 10, top: 10, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.danger },
  bannedText: { color: colors.textInverse, fontSize: 11, fontWeight: '800' },
  loadMore: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  loadMoreText: { color: colors.primary, fontWeight: '800' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,15,46,0.56)' },
  modalCard: { width: '100%', maxWidth: 620, maxHeight: '90%', alignSelf: 'center', padding: 22, paddingBottom: 30, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.surface, gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { ...type.h2, color: colors.ink },
  imageActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imageAction: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 100, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  editAvatar: { width: 52, height: 52, borderRadius: 26 },
  editAvatarFallback: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  coverAction: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 100, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  editCover: { width: 90, height: 52, borderRadius: radius.sm },
  editCoverFallback: { width: 90, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  imageActionText: { color: colors.primary, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  coverHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  privacyCopy: { flex: 1, gap: 3 },
  inputLabel: { ...type.label, color: colors.textSecondary },
  bioInput: { minHeight: 108, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, backgroundColor: colors.bg },
  bioCounter: { color: colors.textMuted, textAlign: 'right', fontSize: 11 },
  saveButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.primary },
  saveButtonDisabled: { opacity: 0.65 },
  saveButtonText: { color: colors.textInverse, fontWeight: '800' },
});
