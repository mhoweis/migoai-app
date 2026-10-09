import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { profileService, ConnectionProfile } from '../services/profile.service';
import { socialService } from '../services/social.service';
import { useLocale } from '../i18n';
import { navigateToTab } from '../navigation/navigationRef';
import { useUserStore } from '../store/userStore';
import Container from '../components/Container';
import { AdminBackButton, EmptyState } from '../components/AdminAnalyticsUI';
import { colors, radius, type } from '../theme';

export default function FollowListScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t, isRTL } = useLocale();
  const userId = String(route.params?.userId || '');
  const tab = route.params?.tab || route.params?.type;
  const isRequests = tab === 'requests';
  const typeName = tab === 'following' ? 'following' : 'followers';
  const { user } = useUserStore();
  const [name, setName] = useState('');
  const [items, setItems] = useState<ConnectionProfile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (nextPage = 1, append = false) => {
    if (!userId) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      if (isRequests) {
        const requests = await profileService.followRequests(nextPage);
        setName(user?.name || '');
        setItems(current => append
          ? [...current, ...requests.items]
          : requests.items.map(person => ({ ...person, isFollowing: false, isMe: false })));
        setTotal(requests.total);
        setPage(nextPage);
        return;
      }
      const [profile, connections] = await Promise.all([
        profileService.profile(userId),
        profileService.connections(userId, typeName, nextPage),
      ]);
      setName(profile.user.name);
      setItems(current => append ? [...current, ...connections.items] : connections.items);
      setTotal(connections.total);
      setPage(nextPage);
    } catch {
      if (!append) {
        setItems([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [isRequests, typeName, user?.name, userId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const toggleFollow = async (person: ConnectionProfile) => {
    if (busyId) return;
    setBusyId(person.id);
    try {
      if (person.isFollowing || person.followRequested) {
        await socialService.unfollow(person.id);
        setItems(current => current.map(item => item.id === person.id
          ? { ...item, isFollowing: false, followRequested: false }
          : item));
      } else {
        const result = await socialService.follow(person.id);
        setItems(current => current.map(item => item.id === person.id
          ? { ...item, isFollowing: result.status === 'following', followRequested: result.status === 'requested' }
          : item));
      }
    } catch {
      return;
    } finally {
      setBusyId(null);
    }
  };

  const respondToRequest = async (userIdToRespond: string, approve: boolean) => {
    if (busyId) return;
    setBusyId(userIdToRespond);
    try {
      if (approve) await profileService.approveFollowRequest(userIdToRespond);
      else await profileService.declineFollowRequest(userIdToRespond);
      setItems(current => current.filter(person => person.id !== userIdToRespond));
      setTotal(current => Math.max(0, current - 1));
    } catch {
      return;
    } finally {
      setBusyId(null);
    }
  };

  const openPerson = (id: string) => navigation.push('UserProfile', { userId: id });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <Container style={styles.page}>
        <AdminBackButton label={t('back')} rtl={isRTL} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigateToTab('Profile')} />
        <Text style={[styles.title, isRTL && styles.textRtl]}>
          {t(isRequests ? 'profile_follow_requests_title' : typeName === 'followers' ? 'profile_followers_title' : 'profile_following_title', { name })}
        </Text>
        {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
        {!loading && items.length === 0 ? <EmptyState label={t(isRequests ? 'profile_no_follow_requests' : typeName === 'followers' ? 'profile_no_followers' : 'profile_no_following')} /> : null}
        <View style={styles.list}>
          {items.map(person => (
            <View key={person.id} style={[styles.row, isRTL && styles.rowRtl]}>
              <TouchableOpacity accessibilityRole="button" onPress={() => openPerson(person.id)}>
                {person.avatar ? <Image source={{ uri: person.avatar }} style={styles.avatar} /> : (
                  <View style={styles.avatarFallback}><Ionicons name="person" size={20} color={colors.primary} /></View>
                )}
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => openPerson(person.id)} style={styles.person}>
                <View style={styles.nameRow}>
                  <Text numberOfLines={1} style={styles.name}>{person.name || t('profile_user')}</Text>
                  {person.isPrivate ? <Ionicons name="lock-closed" size={13} color={colors.textMuted} /> : null}
                </View>
                {person.bio ? <Text numberOfLines={1} style={styles.bio}>{person.bio}</Text> : null}
              </TouchableOpacity>
              {isRequests ? (
                <View style={[styles.requestActions, isRTL && styles.rowRtl]}>
                  <TouchableOpacity accessibilityRole="button" disabled={busyId === person.id} onPress={() => void respondToRequest(person.id, true)} style={styles.approveButton}>
                    <Text style={styles.approveText}>{t('profile_approve')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" disabled={busyId === person.id} onPress={() => void respondToRequest(person.id, false)} style={styles.declineButton}>
                    <Text style={styles.declineText}>{t('profile_decline')}</Text>
                  </TouchableOpacity>
                </View>
              ) : !person.isMe ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={busyId === person.id}
                  onPress={() => void toggleFollow(person)}
                  style={[styles.followButton, (person.isFollowing || person.followRequested) && styles.followingButton]}
                >
                  {busyId === person.id ? <ActivityIndicator size="small" color={person.isFollowing ? colors.primary : colors.textInverse} /> : (
                    <Text style={[styles.followText, (person.isFollowing || person.followRequested) && styles.followingText]}>
                      {person.isFollowing ? t('following') : person.followRequested ? t('requested') : t('follow')}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
        {!loading && items.length < total ? (
          <TouchableOpacity accessibilityRole="button" disabled={loadingMore} onPress={() => void load(page + 1, true)} style={styles.more}>
            {loadingMore ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.moreText}>{t('load_more')}</Text>}
          </TouchableOpacity>
        ) : null}
      </Container>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingBottom: 32 },
  page: { paddingTop: 18 },
  title: { ...type.h2, color: colors.ink, marginTop: 12, marginBottom: 14 },
  textRtl: { textAlign: 'right' },
  loader: { marginVertical: 24 },
  list: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowRtl: { flexDirection: 'row-reverse' },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  person: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { color: colors.text, fontWeight: '800' },
  bio: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  followButton: { minWidth: 88, minHeight: 38, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primary },
  followingButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  followText: { color: colors.textInverse, fontWeight: '800', fontSize: 12 },
  followingText: { color: colors.primary },
  requestActions: { flexDirection: 'row', gap: 6 },
  approveButton: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.primary },
  approveText: { color: colors.textInverse, fontSize: 12, fontWeight: '800' },
  declineButton: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  declineText: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  moreText: { color: colors.primary, fontWeight: '800' },
});
