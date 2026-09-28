import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ticketsService } from '../services/tickets.service';
import type { ProfileStackParamList } from '../navigation/MainTabNavigator';
import type { RouteProp } from '@react-navigation/native';

interface Result {
  kind: 'admitted' | 'used' | 'invalid';
  message: string;
}

type CheckInRoute = RouteProp<ProfileStackParamList, 'CheckIn'>;

export default function CheckInScreen({ route }: { route?: CheckInRoute }) {
  const eventId = route?.params?.eventId;
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [attendance, setAttendance] = useState<{ confirmed: number; checkedIn: number; capacity: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScan = useRef<{ code: string; at: number } | null>(null);

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

  const submitCode = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    const now = Date.now();
    if (lastScan.current && lastScan.current.code === trimmed && now - lastScan.current.at < 3000) return;
    lastScan.current = { code: trimmed, at: now };
    setSubmitting(true);
    setCode('');
    try {
      const response = await ticketsService.checkIn(trimmed);
      setResult({
        kind: 'admitted',
        message: `Admitted — ${response.attendee?.name || 'Guest'}, ${response.ticketCount} ticket${response.ticketCount === 1 ? '' : 's'}`,
      });
    } catch (error) {
      const responseError = error as { response?: { status?: number; data?: { code?: string; error?: unknown } } };
      if (responseError.response?.data?.code === 'ALREADY_CHECKED_IN') {
        const details = responseError.response.data.error;
        const errorDetails = typeof details === 'object' && details !== null && 'errors' in details
          ? details.errors
          : details;
        const usedAt = typeof errorDetails === 'object' && errorDetails !== null && 'checkedInAt' in errorDetails
          ? String(errorDetails.checkedInAt)
          : null;
        setResult({ kind: 'used', message: usedAt ? `Already used at ${new Date(usedAt).toLocaleTimeString()}` : 'Already used' });
      } else {
        setResult({ kind: 'invalid', message: 'Invalid ticket' });
      }
    } finally {
      setSubmitting(false);
      loadAttendance();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Check in attendees</Text>
      {Platform.OS === 'web' ? (
        <View style={styles.manual}>
          <TextInput
            style={styles.input}
            placeholder="Paste ticket code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
          />
          <Button title={submitting ? 'Checking…' : 'Check ticket'} onPress={() => submitCode(code)} disabled={submitting} />
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          {!permission?.granted ? (
            <Button title="Allow camera access" onPress={requestPermission} />
          ) : (
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={(scan: { data: string }) => submitCode(scan.data)}
            />
          )}
        </View>
      )}
      {submitting && <ActivityIndicator color="#2563eb" style={styles.spinner} />}
      {result && <Text style={[styles.result, result.kind === 'admitted' ? styles.success : styles.failure]}>{result.message}</Text>}
      {attendance && (
        <Text style={styles.attendance}>Live attendance: {attendance.checkedIn} / {attendance.confirmed + attendance.checkedIn} checked in</Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 20 },
  heading: { fontSize: 28, fontWeight: '700', color: '#111827', marginBottom: 20 },
  manual: { gap: 12 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, backgroundColor: '#fff', padding: 14, fontSize: 16 },
  cameraWrap: { height: 340, overflow: 'hidden', borderRadius: 16, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  camera: { width: '100%', height: '100%' },
  spinner: { marginTop: 18 },
  result: { marginTop: 24, padding: 20, borderRadius: 12, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  success: { color: '#166534', backgroundColor: '#dcfce7' },
  failure: { color: '#991b1b', backgroundColor: '#fee2e2' },
  attendance: { marginTop: 20, color: '#374151', fontSize: 16, textAlign: 'center' },
});
