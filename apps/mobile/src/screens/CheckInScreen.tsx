import { colors, radius, shadow } from '../theme';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ticketsService } from '../services/tickets.service';
import type { ProfileStackParamList } from '../navigation/MainTabNavigator';
import type { RouteProp } from '@react-navigation/native';
import { formatEventDate, useLocale } from '../i18n';
import GradientButton from '../components/GradientButton';

type ResultKind = 'admitted' | 'used' | 'wrong_event' | 'forbidden' | 'invalid';

interface Result {
  kind: ResultKind;
  title: string;
  detail?: string;
}

type CheckInRoute = RouteProp<ProfileStackParamList, 'CheckIn'>;

const RESUME_AFTER_MS = 2500;
const DUPLICATE_WINDOW_MS = 3000;

const resultTone: Record<ResultKind, { icon: keyof typeof Ionicons.glyphMap; color: string; background: string }> = {
  admitted: { icon: 'checkmark-circle', color: colors.success, background: colors.successSoft },
  used: { icon: 'alert-circle', color: colors.warning, background: colors.warningSoft },
  wrong_event: { icon: 'swap-horizontal', color: colors.warning, background: colors.warningSoft },
  forbidden: { icon: 'lock-closed', color: colors.danger, background: colors.dangerSoft },
  invalid: { icon: 'close-circle', color: colors.danger, background: colors.dangerSoft },
};

interface ApiErrorBody {
  code?: string;
  error?: { code?: string; errors?: unknown };
}

function errorDetails(error: unknown): { code?: string; details?: Record<string, unknown> } {
  const body = (error as { response?: { data?: ApiErrorBody } }).response?.data;
  const details = body?.error?.errors;
  return {
    code: body?.error?.code ?? body?.code,
    details: typeof details === 'object' && details !== null && !Array.isArray(details)
      ? details as Record<string, unknown>
      : undefined,
  };
}

export default function CheckInScreen({ route }: { route?: CheckInRoute }) {
  const { t } = useLocale();
  const eventId = route?.params?.eventId;
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [attendance, setAttendance] = useState<{ confirmed: number; checkedIn: number; capacity: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScan = useRef<{ code: string; at: number } | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAttendance = useCallback(async () => {
    if (!eventId) return;
    try {
      setAttendance(await ticketsService.attendance(eventId));
    } catch {
      setAttendance(null);
    }
  }, [eventId]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  const resumeScanning = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = null;
    setPaused(false);
  };

  const submitCode = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    const now = Date.now();
    if (lastScan.current && lastScan.current.code === trimmed && now - lastScan.current.at < DUPLICATE_WINDOW_MS) return;
    lastScan.current = { code: trimmed, at: now };
    setSubmitting(true);
    setPaused(true);
    setCode('');
    try {
      const response = await ticketsService.checkIn(trimmed, eventId);
      Vibration.vibrate(80);
      setResult({
        kind: 'admitted',
        title: t('check_in_success'),
        detail: `${response.attendee?.name || 'Guest'} · ${t('guests_count', { count: response.ticketCount })}`,
      });
    } catch (error) {
      const { code: errorCode, details } = errorDetails(error);
      Vibration.vibrate([0, 60, 80, 60]);
      if (errorCode === 'ALREADY_CHECKED_IN') {
        const usedAt = details?.checkedInAt ? String(details.checkedInAt) : null;
        setResult({
          kind: 'used',
          title: t('already_checked_in'),
          detail: usedAt ? formatEventDate(usedAt, { withTime: true }) : undefined,
        });
      } else if (errorCode === 'WRONG_EVENT') {
        setResult({
          kind: 'wrong_event',
          title: t('wrong_event_ticket'),
          detail: details?.eventTitle ? String(details.eventTitle) : undefined,
        });
      } else if (errorCode === 'FORBIDDEN') {
        setResult({ kind: 'forbidden', title: t('check_in_failed'), detail: t('check_in_not_allowed') });
      } else {
        setResult({ kind: 'invalid', title: t('check_in_failed'), detail: t('check_in_invalid') });
      }
    } finally {
      setSubmitting(false);
      loadAttendance();
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(resumeScanning, RESUME_AFTER_MS);
    }
  };

  const total = attendance ? attendance.confirmed + attendance.checkedIn : 0;
  const progress = total > 0 && attendance ? attendance.checkedIn / total : 0;
  const tone = result ? resultTone[result.kind] : null;

  const renderCamera = () => {
    if (!permission) {
      return <ActivityIndicator color={colors.textInverse} />;
    }
    if (cameraError) {
      return (
        <View style={styles.cameraPrompt}>
          <Ionicons name="videocam-off-outline" size={40} color={colors.textInverse} />
          <Text style={styles.cameraPromptText}>{t('camera_unavailable')}</Text>
        </View>
      );
    }
    if (!permission.granted) {
      return (
        <View style={styles.cameraPrompt}>
          <Ionicons name="qr-code-outline" size={48} color={colors.textInverse} />
          {permission.canAskAgain ? (
            <GradientButton
              label={t('enable_camera')}
              onPress={() => void requestPermission()}
              icon={<Ionicons name="camera-outline" size={18} color={colors.textInverse} />}
              testID="checkin-enable-camera"
            />
          ) : (
            <Text style={styles.cameraPromptText}>{t('camera_blocked')}</Text>
          )}
        </View>
      );
    }
    return (
      <>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={paused ? undefined : (scan: { data: string }) => void submitCode(scan.data)}
          onMountError={() => setCameraError(true)}
        />
        <View pointerEvents="none" style={styles.frameOverlay}>
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>
        </View>
        {submitting ? (
          <View style={styles.scanningBadge}>
            <ActivityIndicator color={colors.textInverse} size="small" />
          </View>
        ) : null}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <Text style={styles.heading}>{t('scan_attendee_ticket')}</Text>
          <Text style={styles.subheading}>{t('scan_attendee_help')}</Text>

          {attendance ? (
            <View style={styles.attendanceCard}>
              <View style={styles.attendanceRow}>
                <Ionicons name="people-outline" size={18} color={colors.primary} />
                <Text style={styles.attendanceText}>
                  {t('checked_in_count', { checked: attendance.checkedIn, total })}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
            </View>
          ) : null}

          <View style={styles.cameraWrap} testID="checkin-camera">
            {renderCamera()}
          </View>

          {result && tone ? (
            <View style={[styles.resultCard, { backgroundColor: tone.background, borderColor: tone.color }]} testID="checkin-result">
              <Ionicons name={tone.icon} size={36} color={tone.color} />
              <View style={styles.resultTextWrap}>
                <Text style={[styles.resultTitle, { color: tone.color }]}>{result.title}</Text>
                {result.detail ? <Text style={styles.resultDetail}>{result.detail}</Text> : null}
              </View>
              {paused && !submitting ? (
                <TouchableOpacity style={styles.nextButton} onPress={resumeScanning} accessibilityRole="button">
                  <Text style={styles.nextText}>{t('scan_next')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.manualLabel}>{t('enter_code_manually')}</Text>
          <View style={styles.manualRow}>
            <TextInput
              style={styles.input}
              placeholder={t('paste_ticket_code')}
              placeholderTextColor={colors.textMuted}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={() => void submitCode(code)}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              testID="checkin-code-input"
            />
            <TouchableOpacity
              style={[styles.manualButton, (!code.trim() || submitting) && styles.manualButtonDisabled]}
              onPress={() => void submitCode(code)}
              disabled={!code.trim() || submitting}
              accessibilityRole="button"
              accessibilityLabel={t('check_in')}
              testID="checkin-submit"
            >
              <Ionicons name="arrow-forward" size={20} color={colors.textInverse} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const CORNER = 28;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40, alignItems: 'center' },
  inner: { width: '100%', maxWidth: 520 },
  heading: { fontSize: 26, fontWeight: '800', color: colors.text },
  subheading: { marginTop: 6, marginBottom: 16, fontSize: 15, lineHeight: 21, color: colors.textSecondary },
  attendanceCard: {
    padding: 14,
    marginBottom: 16,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  attendanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attendanceText: { fontSize: 15, fontWeight: '700', color: colors.text },
  progressTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.primarySoft, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  cameraWrap: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 420,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  camera: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  cameraPrompt: { alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 28 },
  cameraPromptText: { color: colors.textInverse, fontSize: 15, lineHeight: 21, textAlign: 'center', opacity: 0.9 },
  frameOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '64%', aspectRatio: 1 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: colors.accent },
  cornerTopLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  cornerTopRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  cornerBottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  cornerBottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  scanningBadge: {
    position: 'absolute',
    bottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(20,15,46,0.7)',
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  resultTextWrap: { flex: 1, minWidth: 0 },
  resultTitle: { fontSize: 18, fontWeight: '800' },
  resultDetail: { marginTop: 2, fontSize: 14, color: colors.text },
  nextButton: {
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nextText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  manualLabel: { marginTop: 24, marginBottom: 8, fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  manualRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
  },
  manualButton: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  manualButtonDisabled: { opacity: 0.45 },
});
