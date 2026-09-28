import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { socialService, SocialUser } from '../services/social.service';

export default function FindFriendsScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SocialUser[]>([]);
  const [following, setFollowing] = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        try {
          setFollowing(await socialService.following());
        } catch {
          setFollowing([]);
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
        : [...items, updated]);
    } catch {
      // Keep the current state if the request fails.
    }
  };

  const people = query.trim() ? results : following;
  return (
    <SafeAreaView style={styles.container}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search people"
        placeholderTextColor="#9ca3af"
        style={styles.search}
        autoCapitalize="none"
      />
      {loading ? <ActivityIndicator color="#2563eb" style={styles.loader} /> : null}
      <FlatList
        data={people}
        keyExtractor={(person: SocialUser) => person.id}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>{query ? 'No people found.' : 'You are not following anyone yet.'}</Text> : null}
        renderItem={({ item }: { item: SocialUser }) => (
          <View style={styles.row}>
            {item.avatar ? <Image source={{ uri: item.avatar }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.initial}>{(item.name || '?')[0]}</Text></View>}
            <Text style={styles.name}>{item.name || 'Migo user'}</Text>
            <TouchableOpacity style={[styles.button, item.isFollowing && styles.following]} onPress={() => toggle(item)}>
              <Text style={[styles.buttonText, item.isFollowing && styles.followingText]}>{item.isFollowing ? 'Following' : 'Follow'}</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={people.length ? styles.list : styles.emptyList}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  search: { margin: 16, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', color: '#111827' },
  loader: { marginBottom: 8 },
  list: { paddingHorizontal: 16 },
  emptyList: { flexGrow: 1, padding: 24 },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#1d4ed8', fontWeight: '700' },
  name: { flex: 1, color: '#111827', fontWeight: '600' },
  button: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#2563eb' },
  following: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#93c5fd' },
  buttonText: { color: '#fff', fontWeight: '700' },
  followingText: { color: '#2563eb' },
});
