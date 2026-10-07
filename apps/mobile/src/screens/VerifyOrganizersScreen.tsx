import { colors } from '../theme';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { useLocale } from '../i18n';

type Organizer = {
  id: string;
  name: string;
  email?: string | null;
  isVerified: boolean;
  eventsHosted: number;
};

export default function VerifyOrganizersScreen() {
  const { t } = useLocale();
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ success: boolean; data: Organizer[] }>('/admin/organizers');
      setOrganizers(response.data.data || []);
    } catch {
      setOrganizers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const toggle = async (organizer: Organizer, verified: boolean) => {
    setOrganizers(current => current.map(item => item.id === organizer.id ? { ...item, isVerified: verified } : item));
    try {
      await api.put(`/admin/organizers/${organizer.id}/verify`, { verified });
    } catch {
      setOrganizers(current => current.map(item => item.id === organizer.id ? organizer : item));
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator size="large" color={colors.primary} /></SafeAreaView>;
  }
  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={organizers}
        keyExtractor={(item: Organizer) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{t('no_organizers')}</Text>}
        renderItem={({ item }: { item: Organizer }) => (
          <View style={styles.card}>
            <View style={styles.copy}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.eventsHosted} {t('events_hosted')}</Text>
            </View>
            <Switch value={item.isVerified} onValueChange={(value: boolean) => { void toggle(item, value); }} />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 20, gap: 12 },
  card: { backgroundColor: colors.textInverse, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, flexDirection: 'row', alignItems: 'center' },
  copy: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { marginTop: 5, color: colors.textMuted },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 24 },
});
