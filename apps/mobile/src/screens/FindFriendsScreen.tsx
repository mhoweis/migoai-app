import { colors } from '../theme';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { socialService, SocialUser } from '../services/social.service';
import { useLocale } from '../i18n';

type FriendSection = {
  title: string;
  data: SocialUser[];
};

export default function FindFriendsScreen() {
  const { t } = useLocale();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SocialUser[]>([]);
  const [following, setFollowing] = useState<SocialUser[]>([]);
  const [suggested, setSuggested] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        try {
          const [followedUsers, suggestedUsers] = await Promise.all([
            socialService.following(),
            socialService.suggested(),
          ]);
          setFollowing(followedUsers.map(person => ({ ...person, isFollowing: true })));
          setSuggested(suggestedUsers);
        } catch {
          setFollowing([]);
          setSuggested([]);
        }
        return;
      }
      if (query.trim().length < 2) return;
      setLoading(true);
      try {
        setResults(await socialService.searchUsers(query));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const toggle = async (person: SocialUser) => {
    try {
      if (person.isFollowing) await socialService.unfollow(person.id);
      else await socialService.follow(person.id);
      const updated = { ...person, isFollowing: !person.isFollowing };
      setResults(items => items.map(item => item.id === person.id ? updated : item));
      setFollowing(items => person.isFollowing
        ? items.filter(item => item.id !== person.id)
        : [...items.filter(item => item.id !== person.id), updated]);
      setSuggested(items => person.isFollowing
        ? items
        : items.filter(item => item.id !== person.id));
    } catch {
      // Keep the current state if the request fails.
    }
  };

  const sections: FriendSection[] = query.trim()
    ? [{ title: '', data: results }]
    : [
      { title: t('following'), data: following },
      { title: t('suggested_people'), data: suggested },
    ];
  const hasPeople = sections.some(section => section.data.length > 0);
  return (
    <SafeAreaView style={styles.container}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('search_people')}
        placeholderTextColor={colors.textMuted}
        style={styles.search}
        autoCapitalize="none"
      />
      {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
      <SectionList
        sections={sections}
        keyExtractor={(person: SocialUser) => person.id}
        ListEmptyComponent={!loading && !hasPeople ? <Text style={styles.empty}>{query ? t('no_friends') : t('following')}</Text> : null}
        renderSectionHeader={({ section }: { section: FriendSection }) => section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
        renderItem={({ item }: { item: SocialUser }) => (
          <View style={styles.row}>
            {item.avatar ? <Image source={{ uri: item.avatar }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.initial}>{(item.name || '?')[0]}</Text></View>}
            <View style={styles.personDetails}>
              <Text style={styles.name}>{item.name || 'Migo'}</Text>
              {item.goingCount && item.goingCount > 0 ? (
                <Text style={styles.subtitle}>{t('going_to_events', { count: item.goingCount })}</Text>
              ) : null}
            </View>
            <TouchableOpacity style={[styles.button, item.isFollowing && styles.following]} onPress={() => toggle(item)}>
              <Text style={[styles.buttonText, item.isFollowing && styles.followingText]}>{item.isFollowing ? t('following') : t('follow')}</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={hasPeople ? styles.list : styles.emptyList}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  search: { margin: 16, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.textInverse, borderWidth: 1, borderColor: colors.border, color: colors.text },
  loader: { marginBottom: 8 },
  list: { paddingHorizontal: 16 },
  emptyList: { flexGrow: 1, padding: 24 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 24 },
  sectionTitle: { color: colors.textSecondary, fontWeight: '700', fontSize: 14, marginTop: 12, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.primaryDark, fontWeight: '700' },
  personDetails: { flex: 1 },
  name: { color: colors.text, fontWeight: '600' },
  subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  button: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary },
  following: { backgroundColor: colors.textInverse, borderWidth: 1, borderColor: colors.primarySoft },
  buttonText: { color: colors.textInverse, fontWeight: '700' },
  followingText: { color: colors.primary },
});
