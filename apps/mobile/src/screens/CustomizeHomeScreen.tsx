import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import GradientButton from '../components/GradientButton';
import { HOME_SECTION_META, HomeLayout, HomeSectionId, DEFAULT_HOME_LAYOUT, normalizeHomeLayout } from '../config/homeSections';
import { useLocale } from '../i18n';
import { navigationRef } from '../navigation/navigationRef';
import { useUserStore } from '../store/userStore';
import { colors, radius, shadow, spacing, type } from '../theme';

export default function CustomizeHomeScreen() {
  const { t } = useLocale();
  const { user, updateHomeLayout } = useUserStore();
  const [layout, setLayout] = useState<HomeLayout>(() => normalizeHomeLayout(user?.preferences?.homeLayout));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLayout(normalizeHomeLayout(user?.preferences?.homeLayout));
  }, [user?.preferences?.homeLayout]);

  const isVisible = (id: HomeSectionId) => !layout.hidden.includes(id);

  const toggleSection = (id: HomeSectionId) => {
    setLayout(current => ({
      ...current,
      hidden: current.hidden.includes(id)
        ? current.hidden.filter(hiddenId => hiddenId !== id)
        : [...current.hidden, id],
    }));
  };

  const moveSection = (id: HomeSectionId, direction: -1 | 1) => {
    setLayout(current => {
      const index = current.order.indexOf(id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.order.length) return current;
      const order = [...current.order];
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      return { ...current, order };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateHomeLayout(layout);
      navigationRef.current?.goBack();
    } catch {
      Alert.alert(t('error'), t('please_try_again'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="customize-home">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('customize_home')}</Text>
        <Text style={styles.hint}>{t('customize_home_hint')}</Text>

        {layout.order.map((id, index) => {
          const meta = HOME_SECTION_META[id];
          return (
            <View
              key={id}
              testID={`customize-section-${id}`}
              style={[styles.row, !isVisible(id) && styles.rowHidden]}
            >
              <Ionicons name="reorder-three-outline" size={24} color={colors.textMuted} />
              <Ionicons name={meta.icon} size={22} color={colors.primary} style={styles.sectionIcon} />
              <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
                {t(meta.labelKey as Parameters<typeof t>[0])}
              </Text>
              <Switch
                testID={`customize-toggle-${id}`}
                value={isVisible(id)}
                onValueChange={() => toggleSection(id)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={isVisible(id) ? colors.primary : colors.textMuted}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(meta.labelKey as Parameters<typeof t>[0])}
                disabled={index === 0}
                onPress={() => moveSection(id, -1)}
                style={styles.orderButton}
                testID={`customize-up-${id}`}
              >
                <Ionicons name="chevron-up" size={20} color={index === 0 ? colors.border : colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(meta.labelKey as Parameters<typeof t>[0])}
                disabled={index === layout.order.length - 1}
                onPress={() => moveSection(id, 1)}
                style={styles.orderButton}
                testID={`customize-down-${id}`}
              >
                <Ionicons name="chevron-down" size={20} color={index === layout.order.length - 1 ? colors.border : colors.text} />
              </Pressable>
            </View>
          );
        })}

        <Pressable
          testID="customize-reset"
          accessibilityRole="button"
          onPress={() => setLayout({ order: [...DEFAULT_HOME_LAYOUT.order], hidden: [] })}
          style={styles.resetButton}
        >
          <Text style={styles.resetText}>{t('reset_default')}</Text>
        </Pressable>
        <GradientButton
          testID="customize-save"
          label={t('save')}
          onPress={() => void save()}
          loading={saving}
          style={styles.saveButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    ...type.h1,
    marginBottom: spacing.xs,
  },
  hint: {
    ...type.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  rowHidden: {
    opacity: 0.55,
  },
  sectionIcon: {
    marginLeft: spacing.xs,
    marginRight: spacing.sm,
  },
  label: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  orderButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButton: {
    alignSelf: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  resetText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  saveButton: {
    marginTop: spacing.sm,
  },
});
