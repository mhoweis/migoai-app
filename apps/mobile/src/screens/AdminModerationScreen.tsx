import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useLocale } from '../i18n';
import { accountTypesService } from '../services/accountTypes.service';
import { User } from '../services/auth.service';
import {
  AdminBackButton,
  AdminHeader,
  AdminShell,
  EmptyState,
  Panel,
  StatusPill,
} from '../components/AdminAnalyticsUI';
import { colors, radius, type } from '../theme';

type TabKey = 'users' | 'events' | 'activity';
type ModerationUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: User['role'];
  status: 'ACTIVE' | 'PAUSED';
  pausedReason: string | null;
  supplier: { id: string; name: string } | null;
  subscription: { plan: string; status: string; currentPeriodEnd: string | null } | null;
};
type ModerationEvent = {
  id: string;
  title: string;
  startDate: string;
  status: string;
  source: string | null;
  organizer: { id: string; name: string | null } | null;
  bannedReason: string | null;
};

const roles: User['role'][] = ['USER', 'ORGANIZER', 'SUPPLIER', 'ADMIN'];

export default function AdminModerationScreen() {
  const navigation = useNavigation<any>();
  const { t, isRTL, locale } = useLocale();
  const [tab, setTab] = useState<TabKey>('users');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<ModerationUser[]>([]);
  const [events, setEvents] = useState<ModerationEvent[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [userStatus, setUserStatus] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [userRole, setUserRole] = useState<'ALL' | User['role']>('ALL');
  const [eventStatus, setEventStatus] = useState<'ALL' | 'ACTIVE' | 'BANNED'>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedUser, setSelectedUser] = useState<ModerationUser | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ModerationEvent | null>(null);
  const [reason, setReason] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [modalMode, setModalMode] = useState<'pause' | 'ban' | 'user'>('user');
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'users') {
        const result = await accountTypesService.adminUsers({
          q: search.trim() || undefined,
          status: userStatus === 'ALL' ? undefined : userStatus,
          role: userRole === 'ALL' ? undefined : userRole,
          page,
          pageSize,
        });
        setUsers(result.items);
        setTotal(result.total);
      } else if (tab === 'events') {
        const result = await accountTypesService.adminEvents({
          q: search.trim() || undefined,
          status: eventStatus === 'ALL' ? undefined : eventStatus,
          page,
          pageSize,
        });
        setEvents(result.items);
        setTotal(result.total);
      } else {
        setActions(await accountTypesService.adminActions(50));
      }
    } catch (loadError: any) {
      setError(loadError?.response?.data?.error || t('moderation_load_failed'));
    } finally {
      setLoading(false);
    }
  }, [eventStatus, page, search, tab, t, userRole, userStatus]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    setPage(1);
  }, [tab, search, userStatus, userRole, eventStatus]);

  const changeRole = async (user: ModerationUser, role: User['role']) => {
    try {
      await accountTypesService.updateAdminUser(user.id, { role });
      setSelectedUser(null);
      await load();
    } catch (updateError: any) {
      setError(updateError?.response?.data?.error || t('moderation_update_failed'));
    }
  };

  const reactivate = async (user: ModerationUser) => {
    try {
      await accountTypesService.updateAdminUser(user.id, { status: 'ACTIVE' });
      await load();
    } catch (updateError: any) {
      setError(updateError?.response?.data?.error || t('moderation_update_failed'));
    }
  };

  const pauseUser = async () => {
    if (!selectedUser || !reason.trim()) return;
    try {
      await accountTypesService.updateAdminUser(selectedUser.id, { status: 'PAUSED', reason: reason.trim() });
      setSelectedUser(null);
      setReason('');
      await load();
    } catch (updateError: any) {
      setError(updateError?.response?.data?.error || t('moderation_update_failed'));
    }
  };

  const linkSupplier = async (id: string | null) => {
    if (!selectedUser) return;
    try {
      await accountTypesService.updateAdminUser(selectedUser.id, { supplierId: id });
      setSupplierId('');
      setSelectedUser(null);
      await load();
    } catch (updateError: any) {
      setError(updateError?.response?.data?.error || t('moderation_update_failed'));
    }
  };

  const banEvent = async () => {
    if (!selectedEvent || !reason.trim()) return;
    try {
      await accountTypesService.banEvent(selectedEvent.id, reason.trim());
      setSelectedEvent(null);
      setReason('');
      await load();
    } catch (updateError: any) {
      setError(updateError?.response?.data?.error || t('moderation_update_failed'));
    }
  };

  const unbanEvent = async (event: ModerationEvent) => {
    try {
      await accountTypesService.unbanEvent(event.id);
      await load();
    } catch (updateError: any) {
      setError(updateError?.response?.data?.error || t('moderation_update_failed'));
    }
  };

  const openPause = (user: ModerationUser) => {
    setSelectedUser(user);
    setReason('');
    setModalMode('pause');
  };

  const openBan = (event: ModerationEvent) => {
    setSelectedEvent(event);
    setReason('');
    setModalMode('ban');
  };

  const statusFilters = tab === 'users'
    ? [
        ['ALL', t('admin_status_all')],
        ['ACTIVE', t('moderation_active')],
        ['PAUSED', t('moderation_paused')],
      ] as const
    : [
        ['ALL', t('admin_status_all')],
        ['ACTIVE', t('moderation_active')],
        ['BANNED', t('moderation_banned')],
      ] as const;

  return (
    <AdminShell>
      <AdminBackButton
        label={t('back')}
        rtl={isRTL}
        onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminConsole')}
      />
      <AdminHeader title={t('moderation_title')} subtitle={t('moderation_subtitle')} />
      <View style={styles.tabs}>
        {(['users', 'events', 'activity'] as TabKey[]).map(key => (
          <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.activeTab]}>
            <Text style={[styles.tabText, tab === key && styles.activeTabText]}>{t(`moderation_tab_${key}` as any)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab !== 'activity' ? (
        <>
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder={t(tab === 'users' ? 'moderation_search_users' : 'moderation_search_events')}
            placeholderTextColor={colors.textMuted}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {statusFilters.map(([value, label]) => {
              const selected = tab === 'users' ? userStatus === value : eventStatus === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => {
                    if (tab === 'users') setUserStatus(value as typeof userStatus);
                    else setEventStatus(value as typeof eventStatus);
                  }}
                  style={[styles.filterChip, selected && styles.filterChipSelected]}
                >
                  <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {tab === 'users' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {(['ALL', ...roles] as Array<'ALL' | User['role']>).map(role => (
                <TouchableOpacity
                  key={role}
                  onPress={() => setUserRole(role)}
                  style={[styles.filterChip, userRole === role && styles.filterChipSelected]}
                >
                  <Text style={[styles.filterText, userRole === role && styles.filterTextSelected]}>
                    {role === 'ALL' ? t('admin_status_all') : t(`account_role_${role.toLowerCase()}` as any)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      {!loading && tab === 'users' ? (
        <View style={styles.rows}>
          {users.length ? users.map(user => (
            <Panel key={user.id} style={styles.rowPanel}>
              <View style={styles.rowHeader}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{user.name || t('moderation_unknown_user')}</Text>
                  <Text style={styles.rowMeta}>{user.email || user.id}</Text>
                </View>
                <StatusPill value={user.status} label={t(user.status === 'ACTIVE' ? 'moderation_active' : 'moderation_paused')} />
              </View>
              <Text style={styles.rowMeta}>{t('moderation_role_label')}: {t(`account_role_${user.role.toLowerCase()}` as any)}</Text>
              {user.pausedReason ? <Text style={styles.reasonText}>{user.pausedReason}</Text> : null}
              {user.supplier ? <Text style={styles.rowMeta}>{t('moderation_supplier_linked', { name: user.supplier.name })}</Text> : null}
              {user.subscription ? <Text style={styles.rowMeta}>{user.subscription.plan} · {user.subscription.status}</Text> : null}
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionChip} onPress={() => { setSelectedUser(user); setSupplierId(user.supplier?.id || ''); setModalMode('user'); }}>
                  <Text style={styles.actionText}>{t('moderation_edit_role')}</Text>
                </TouchableOpacity>
                {user.status === 'PAUSED' ? (
                  <TouchableOpacity style={styles.actionChip} onPress={() => void reactivate(user)}>
                    <Text style={styles.actionText}>{t('moderation_reactivate')}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.actionChip, styles.dangerChip]} onPress={() => openPause(user)}>
                    <Text style={styles.dangerText}>{t('moderation_pause')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Panel>
          )) : <EmptyState label={t('moderation_no_users')} />}
        </View>
      ) : null}

      {!loading && tab === 'events' ? (
        <View style={styles.rows}>
          {events.length ? events.map(event => (
            <Panel key={event.id} style={styles.rowPanel}>
              <View style={styles.rowHeader}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{event.title}</Text>
                  <Text style={styles.rowMeta}>{event.organizer?.name || t('moderation_unknown_user')} · {event.source || 'Migo'}</Text>
                </View>
                <StatusPill value={event.status} label={t(event.status === 'BANNED' ? 'moderation_banned' : `moderation_${event.status.toLowerCase()}` as any)} />
              </View>
              <Text style={styles.rowMeta}>{new Date(event.startDate).toLocaleString(locale === 'ar' ? 'ar-AE' : 'en-AE')}</Text>
              {event.bannedReason ? <Text style={styles.reasonText}>{event.bannedReason}</Text> : null}
              <View style={styles.actions}>
                {event.status === 'BANNED' ? (
                  <TouchableOpacity style={styles.actionChip} onPress={() => void unbanEvent(event)}>
                    <Text style={styles.actionText}>{t('moderation_unban')}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.actionChip, styles.dangerChip]} onPress={() => openBan(event)}>
                    <Text style={styles.dangerText}>{t('moderation_ban')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Panel>
          )) : <EmptyState label={t('moderation_no_events')} />}
        </View>
      ) : null}

      {!loading && tab === 'activity' ? (
        <View style={styles.rows}>
          {actions.length ? actions.map(action => (
            <Panel key={action.id} style={styles.rowPanel}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>{t(`moderation_action_${String(action.action).toLowerCase()}` as any) === `moderation_action_${String(action.action).toLowerCase()}` ? action.action : t(`moderation_action_${String(action.action).toLowerCase()}` as any)}</Text>
                <Text style={styles.rowMeta}>{new Date(action.createdAt).toLocaleString(locale === 'ar' ? 'ar-AE' : 'en-AE')}</Text>
              </View>
              <Text style={styles.rowMeta}>{action.targetType} · {action.targetId} · {action.adminId}</Text>
              {action.reason ? <Text style={styles.reasonText}>{action.reason}</Text> : null}
            </Panel>
          )) : <EmptyState label={t('moderation_no_actions')} />}
        </View>
      ) : null}

      {tab !== 'activity' && total > pageSize ? (
        <View style={styles.pagination}>
          <TouchableOpacity disabled={page <= 1} onPress={() => setPage(value => Math.max(1, value - 1))} style={styles.pageButton}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={16} color={page <= 1 ? colors.textMuted : colors.primary} />
          </TouchableOpacity>
          <Text style={styles.rowMeta}>{page} / {Math.ceil(total / pageSize)}</Text>
          <TouchableOpacity disabled={page >= Math.ceil(total / pageSize)} onPress={() => setPage(value => value + 1)} style={styles.pageButton}>
            <Ionicons name={isRTL ? 'arrow-back' : 'arrow-forward'} size={16} color={page >= Math.ceil(total / pageSize) ? colors.textMuted : colors.primary} />
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={modalMode === 'pause' && Boolean(selectedUser)} transparent animationType="fade" onRequestClose={() => setSelectedUser(null)}>
        <View style={styles.modalShade}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t('moderation_pause_user')}</Text>
            <TextInput style={[styles.search, styles.reasonInput]} value={reason} onChangeText={setReason} placeholder={t('moderation_reason_required')} placeholderTextColor={colors.textMuted} multiline />
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionChip} onPress={() => setSelectedUser(null)}><Text style={styles.actionText}>{t('cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.actionChip, styles.dangerChip]} disabled={!reason.trim()} onPress={() => void pauseUser()}><Text style={styles.dangerText}>{t('moderation_pause')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalMode === 'ban' && Boolean(selectedEvent)} transparent animationType="fade" onRequestClose={() => setSelectedEvent(null)}>
        <View style={styles.modalShade}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t('moderation_ban_event')}</Text>
            <TextInput style={[styles.search, styles.reasonInput]} value={reason} onChangeText={setReason} placeholder={t('moderation_reason_required')} placeholderTextColor={colors.textMuted} multiline />
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionChip} onPress={() => setSelectedEvent(null)}><Text style={styles.actionText}>{t('cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.actionChip, styles.dangerChip]} disabled={!reason.trim()} onPress={() => void banEvent()}><Text style={styles.dangerText}>{t('moderation_ban')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalMode === 'user' && Boolean(selectedUser)} transparent animationType="fade" onRequestClose={() => setSelectedUser(null)}>
        <View style={styles.modalShade}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{t('moderation_edit_role')}</Text>
            <Text style={styles.rowMeta}>{selectedUser?.name || selectedUser?.email}</Text>
            <Text style={styles.modalLabel}>{t('moderation_role_label')}</Text>
            <View style={styles.roleOptions}>
              {roles.map(role => (
                <TouchableOpacity key={role} style={[styles.roleOption, selectedUser?.role === role && styles.roleOptionSelected]} onPress={() => selectedUser && void changeRole(selectedUser, role)}>
                  <Text style={[styles.roleOptionText, selectedUser?.role === role && styles.roleOptionTextSelected]}>{t(`account_role_${role.toLowerCase()}` as any)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>{t('moderation_supplier_id')}</Text>
            <TextInput style={styles.search} value={supplierId} onChangeText={setSupplierId} placeholder={t('moderation_supplier_id')} placeholderTextColor={colors.textMuted} autoCapitalize="none" />
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionChip} onPress={() => void linkSupplier(supplierId.trim() || null)}>
                <Text style={styles.actionText}>{supplierId.trim() ? t('moderation_link_supplier') : t('moderation_unlink_supplier')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionChip} onPress={() => setSelectedUser(null)}><Text style={styles.actionText}>{t('save')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4, alignSelf: 'flex-start' },
  tab: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill },
  activeTab: { backgroundColor: colors.surface },
  tabText: { ...type.label, color: colors.textMuted },
  activeTabText: { color: colors.primary },
  search: { minHeight: 46, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, color: colors.ink, marginTop: 14 },
  filters: { flexDirection: 'row', gap: 8, paddingVertical: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  filterChipSelected: { backgroundColor: colors.primary },
  filterText: { color: colors.textSecondary, fontWeight: '700' },
  filterTextSelected: { color: colors.textInverse },
  rows: { gap: 12 },
  rowPanel: { padding: 16 },
  rowHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { ...type.h3, color: colors.ink, flexShrink: 1 },
  rowMeta: { ...type.caption, marginTop: 4 },
  reasonText: { color: colors.danger, fontSize: 13, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  actionText: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  dangerChip: { backgroundColor: colors.dangerSoft },
  dangerText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, paddingVertical: 10 },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 16 },
  pageButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  modalShade: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(20,15,46,0.55)' },
  modal: { width: '100%', maxWidth: 520, padding: 22, borderRadius: radius.lg, backgroundColor: colors.surface },
  modalTitle: { ...type.h2, marginBottom: 12 },
  modalLabel: { ...type.label, marginTop: 14, marginBottom: 8 },
  reasonInput: { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 },
  roleOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleOption: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  roleOptionSelected: { backgroundColor: colors.primary },
  roleOptionText: { color: colors.textSecondary, fontWeight: '700' },
  roleOptionTextSelected: { color: colors.textInverse },
});
