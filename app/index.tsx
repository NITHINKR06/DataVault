import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Alert,
  Animated,
  Easing,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  startSession,
  endSession,
  getSessions,
  getActiveSession,
  insertCallLog,
  getCallLogs,
  getNotifications,
  Session,
  formatDateTime,
} from '../src/db/database';
import {
  startCapturingNotifications,
  stopCapturingNotifications,
  requestNotificationPermission,
  checkNotificationPermission,
  syncCapturedNotificationsFromNative,
} from '../src/services/notificationCapture';
import Constants from 'expo-constants';
import { readCallLogs, isNativeCallLogModuleAvailable } from '../src/services/callLog';
import { openNotificationListenerSettings } from '../src/services/permissions';
import { exportDataAsJson } from '../src/services/exportService';

// ── Palette ──────────────────────────────────────────
const C = {
  bg: '#0A0A0F',
  surface: '#0F0F18',
  border: '#1A1A2E',
  accent: '#5B6BF8',
  accentDim: '#1A2060',
  green: '#22C55E',
  greenDim: '#0A1F12',
  greenBorder: '#166534',
  red: '#EF4444',
  redDim: '#1F0A0A',
  redBorder: '#7F1D1D',
  amber: '#F59E0B',
  amberDim: '#1F1508',
  text: '#EEEEF8',
  textDim: '#9898B8',
  sub: '#4A4A6A',
  divider: '#151520',
};

// ── Pulsing dot ──────────────────────────────────────
function PulsingDot({ color = C.green, size = 8 }: { color?: string; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.8, duration: 1000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 1000, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.2, duration: 1000, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.9, duration: 1000, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);
  return (
    <Animated.View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, transform: [{ scale }], opacity }}
    />
  );
}

// ── Session card ─────────────────────────────────────
function SessionCard({ session, index }: { session: Session; index: number }) {
  const active = session.is_active === 1;
  const durationSec =
    !active && session.end_time && session.start_time
      ? Math.floor((session.end_time - session.start_time) / 1000)
      : null;
  const durStr = durationSec !== null
    ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
    : null;

  return (
    <View style={[styles.sessionCard, active && styles.sessionCardActive]}>
      <View style={styles.sessionTop}>
        <View style={styles.sessionLeft}>
          {active && <PulsingDot size={7} />}
          <Text style={styles.sessionNum}>Session #{index + 1}</Text>
          {active && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          )}
        </View>
        {durStr && <Text style={styles.sessionDur}>{durStr}</Text>}
      </View>
      <View style={styles.timeBlock}>
        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>Started</Text>
          <Text style={styles.timeVal}>{session.start_datetime}</Text>
        </View>
        {!active && session.end_datetime && (
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Ended</Text>
            <Text style={styles.timeVal}>{session.end_datetime}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Permission row ───────────────────────────────────
function PermRow({
  label, ok, onGrant, hint,
}: { label: string; ok: boolean; onGrant: () => void; hint?: string }) {
  return (
    <View style={styles.permRow}>
      <View style={[styles.permIndicator, { backgroundColor: ok ? C.green : C.red }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.permLabel}>{label}</Text>
        {hint && !ok && <Text style={styles.permHint}>{hint}</Text>}
      </View>
      {!ok && (
        <TouchableOpacity style={styles.grantBtn} onPress={onGrant} activeOpacity={0.7}>
          <Text style={styles.grantBtnText}>Grant</Text>
        </TouchableOpacity>
      )}
      {ok && <Text style={styles.okText}>✓</Text>}
    </View>
  );
}

// ── Main screen ──────────────────────────────────────
export default function HomeScreen() {
  const isExpoGo = Constants.appOwnership === 'expo';
  const notificationSupported = Platform.OS === 'android' && !isExpoGo;

  const [capturing, setCapturing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [permCall, setPermCall] = useState(false);
  const [permNotif, setPermNotif] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<number>(-1);
  const [messageCount, setMessageCount] = useState(0);
  const [callCount, setCallCount] = useState(0);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const checkPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      const { PermissionsAndroid } = require('react-native');
      const callOk = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG
      );
      setPermCall(callOk);
      if (notificationSupported) {
        const notifOk = await checkNotificationPermission();
        setPermNotif(notifOk);
      } else {
        setPermNotif(true);
      }
    } catch {}
  }, [notificationSupported]);

  const loadSessions = useCallback(async () => {
    try {
      const [list, notifications, calls] = await Promise.all([
        getSessions(),
        getNotifications(),
        getCallLogs(),
      ]);
      setSessions(list);
      setMessageCount(notifications.length);
      setCallCount(calls.length);
    } catch (e) {
      console.warn('loadSessions error', e);
    }
  }, []);

  const restoreAppState = useCallback(async () => {
    await checkPermissions();

    const imported = await syncCapturedNotificationsFromNative();
    if (imported > 0) {
      setLiveCount(imported);
    }

    const activeSession = await getActiveSession();
    if (activeSession) {
      setCapturing(true);
      setCurrentSessionId(activeSession.id);
      startCapturingNotifications(activeSession.id);
    } else {
      setCapturing(false);
      setCurrentSessionId(-1);
    }

    await loadSessions();
  }, [checkPermissions, loadSessions]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();

    checkPermissions();
    restoreAppState();
  }, []);

  const handleGrantCallLog = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const { PermissionsAndroid } = require('react-native');
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      ]);
      const ok = results[PermissionsAndroid.PERMISSIONS.READ_CALL_LOG] === 'granted';
      setPermCall(ok);
      if (!ok) {
        Alert.alert(
          'Permission Needed',
          'Please allow access in Settings.',
          [{ text: 'Open Settings', onPress: () => Linking.openSettings() }, { text: 'Cancel' }]
        );
      }
    } catch (e) {
      console.warn(e);
    }
  };

  const handleGrantNotif = async () => {
    if (!notificationSupported) {
      Alert.alert(
        'Not Available in Expo Go',
        'Notification capture requires a development build. You can still test call-log features in Expo Go.'
      );
      setPermNotif(true);
      return;
    }

    // First try standard notification permission
    const granted = await requestNotificationPermission();
    setPermNotif(granted);

    if (!granted) {
      // Guide user to Notification Listener settings
      Alert.alert(
        'Enable Notification Access',
        'Tap "Open Settings" → find this app → toggle ON',
        [
          { text: 'Open Settings', onPress: () => openNotificationListenerSettings() },
          { text: 'Later', style: 'cancel' },
        ]
      );
    }

    // Re-check after delay (user may return from settings)
    setTimeout(async () => {
      const ok = await checkNotificationPermission();
      setPermNotif(ok);
    }, 2000);
  };

  const handleStart = async () => {
    if (!permCall || (notificationSupported && !permNotif)) {
      Alert.alert('Access Required', 'Please grant both permissions before starting.');
      return;
    }
    setLoading(true);
    try {
      const sessionId = await startSession();
      setCurrentSessionId(sessionId);
      startCapturingNotifications(sessionId);
      setCapturing(true);
      setLiveCount(0);
      await loadSessions();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not start');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!capturing || currentSessionId === -1) return;
    setLoading(true);
    try {
      stopCapturingNotifications();

      // Snapshot call logs
      if (permCall) {
        if (!isNativeCallLogModuleAvailable()) {
          console.warn('[DataVault] DataVaultCallLogModule not linked in this build.');
        } else {
          const calls = await readCallLogs(currentSessionId, 100);
          // Fetch session directly from DB — don't trust stale React state
          const activeSession = await getActiveSession();
          const sessionStart = activeSession?.start_time ?? 0;
          const sessionCalls = sessionStart > 0
            ? calls.filter((call) => call.date >= sessionStart - 10000)
            : calls; // if sessionStart unknown, save all calls

          for (const call of sessionCalls) {
            await insertCallLog(call);
          }

          if (sessionCalls.length === 0) {
            Alert.alert(
              'No Calls in This Session',
              'No calls were found in this session window. If a call just ended, wait 5–10 seconds and tap Stop again.'
            );
          }
        }
      }
      await endSession(currentSessionId);
      setCapturing(false);
      setCurrentSessionId(-1);
      setLiveCount(0);
      await loadSessions();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not stop');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (sessions.length === 0) {
      Alert.alert('No Data', 'Start and stop a session first to collect data.');
      return;
    }

    setExporting(true);
    try {
      await exportDataAsJson();
    } catch (e: any) {
      Alert.alert('Export Failed', e?.message ?? 'Unknown error');
    } finally {
      setExporting(false);
    }
  };

  const handleClear = () => {
    if (capturing) {
      Alert.alert('Still Active', 'Stop the session before clearing data.');
      return;
    }
    Alert.alert(
      'Clear All Data',
      'This permanently deletes all sessions and records.',
      [
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            const { clearAll } = await import('../src/db/database');
            await clearAll();
            stopCapturingNotifications();
            setCapturing(false);
            setCurrentSessionId(-1);
            setSessions([]);
            setLiveCount(0);
            setMessageCount(0);
            setCallCount(0);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const allPerms = permCall && permNotif;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.appName}>DataVault</Text>
          <Text style={styles.appTagline}>local · private · secure</Text>
        </View>
        {capturing && (
          <View style={styles.headerStatus}>
            <PulsingDot size={6} />
            <Text style={styles.headerStatusText}>Active</Text>
          </View>
        )}
      </Animated.View>

      <Animated.ScrollView
        style={{ flex: 1, opacity: fadeAnim }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>

        {/* ── Access Card ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>ACCESS</Text>

          <PermRow
            label="Call History"
            ok={permCall}
            onGrant={handleGrantCallLog}
            hint="Tap Grant to allow"
          />
          <PermRow
            label="Notifications"
            ok={permNotif}
            onGrant={handleGrantNotif}
            hint="Required for monitoring"
          />
        </View>

        {/* ── Control Buttons ── */}
        <View style={styles.controlRow}>
          <TouchableOpacity
            style={[styles.controlBtn, styles.startBtn, (capturing || loading || !allPerms) && styles.btnOff]}
            onPress={handleStart}
            disabled={capturing || loading || !allPerms}
            activeOpacity={0.75}>
            {loading && !capturing
              ? <ActivityIndicator color="#fff" />
              : (
                <View style={styles.btnInner}>
                  <Text style={styles.btnIcon}>▶</Text>
                  <Text style={styles.btnText}>Start</Text>
                </View>
              )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlBtn, styles.stopBtn, (!capturing || loading) && styles.btnOff]}
            onPress={handleStop}
            disabled={!capturing || loading}
            activeOpacity={0.75}>
            {loading && capturing
              ? <ActivityIndicator color="#fff" />
              : (
                <View style={styles.btnInner}>
                  <Text style={styles.btnIcon}>■</Text>
                  <Text style={styles.btnText}>Stop</Text>
                </View>
              )}
          </TouchableOpacity>
        </View>

        {/* ── Live indicator ── */}
        {capturing && (
          <View style={styles.liveBar}>
            <PulsingDot size={8} />
            <Text style={styles.liveText}>Session in progress</Text>
            {liveCount > 0 && (
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>+{liveCount} captured</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Capture summary ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>CAPTURED DATA</Text>
          {messageCount === 0 && callCount === 0 ? (
            <View style={styles.summaryEmpty}>
              <Text style={styles.summaryEmptyText}>No data</Text>
              <Text style={styles.summaryEmptySubText}>No messages or call logs captured</Text>
            </View>
          ) : (
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Messages</Text>
                <Text style={styles.summaryValue}>{messageCount}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Calls</Text>
                <Text style={styles.summaryValue}>{callCount}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Sessions list ── */}
        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Text style={styles.cardLabel}>SESSIONS</Text>
            {sessions.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{sessions.length}</Text>
              </View>
            )}
          </View>

          {sessions.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>◎</Text>
              <Text style={styles.emptyText}>No sessions yet</Text>
              <Text style={styles.emptySubText}>Tap Start to begin</Text>
            </View>
          ) : (
            sessions.map((s, i) => (
              <SessionCard key={s.id} session={s} index={i} />
            ))
          )}
        </View>

        {/* ── Export + Clear ── */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.exportBtn, exporting && styles.btnOff]}
            onPress={handleExport}
            disabled={exporting}
            activeOpacity={0.8}>
            {exporting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.actionBtnText}>⬆  Export JSON</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.clearBtn]}
            onPress={handleClear}
            activeOpacity={0.8}>
            <Text style={styles.actionBtnText}>✕  Clear</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footNote}>All data is stored only on this device</Text>

      </Animated.ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLeft: {},
  appName: { fontSize: 24, fontWeight: '800', color: C.text, letterSpacing: 0.3 },
  appTagline: { fontSize: 11, color: C.sub, marginTop: 1, letterSpacing: 2, textTransform: 'uppercase' },
  headerStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.greenDim, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: C.greenBorder },
  headerStatusText: { color: C.green, fontSize: 12, fontWeight: '600' },

  scroll: { padding: 18, paddingBottom: 60, gap: 14 },

  card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18, gap: 0 },
  cardLabel: { fontSize: 10, fontWeight: '800', color: C.sub, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 14 },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  countBadge: { backgroundColor: C.accentDim, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  countBadgeText: { color: C.accent, fontSize: 12, fontWeight: '700' },

  // Permissions
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.divider },
  permIndicator: { width: 8, height: 8, borderRadius: 4 },
  permLabel: { color: C.text, fontSize: 15, fontWeight: '500' },
  permHint: { color: C.sub, fontSize: 11, marginTop: 2 },
  grantBtn: { backgroundColor: C.accentDim, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: C.accent },
  grantBtnText: { color: C.accent, fontSize: 12, fontWeight: '700' },
  okText: { color: C.green, fontSize: 16, fontWeight: '700' },

  // Controls
  controlRow: { flexDirection: 'row', gap: 12 },
  controlBtn: { flex: 1, paddingVertical: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  startBtn: { backgroundColor: C.green },
  stopBtn: { backgroundColor: C.red },
  btnOff: { opacity: 0.25 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnIcon: { fontSize: 14, color: '#fff' },
  btnText: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  // Live bar
  liveBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.greenDim, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: C.greenBorder },
  liveText: { flex: 1, color: C.green, fontSize: 14, fontWeight: '600' },
  countPill: { backgroundColor: C.green, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  countPillText: { color: '#061209', fontSize: 11, fontWeight: '800' },

  // Capture summary
  summaryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  summaryItem: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center' },
  summaryLabel: { color: C.sub, fontSize: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
  summaryValue: { color: C.text, fontSize: 22, fontWeight: '800' },
  summaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: C.border },
  summaryEmpty: { alignItems: 'center', paddingVertical: 18, backgroundColor: C.bg, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  summaryEmptyText: { color: C.textDim, fontSize: 16, fontWeight: '700' },
  summaryEmptySubText: { color: C.sub, fontSize: 12, marginTop: 4 },

  // Session cards
  sessionCard: { backgroundColor: C.bg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  sessionCardActive: { borderColor: C.green, backgroundColor: C.greenDim },
  sessionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sessionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionNum: { color: C.text, fontSize: 14, fontWeight: '700' },
  sessionDur: { color: C.sub, fontSize: 12 },
  liveBadge: { backgroundColor: C.green, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  liveBadgeText: { color: '#061209', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  timeBlock: { gap: 5 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeLabel: { color: C.sub, fontSize: 12, width: 54 },
  timeVal: { color: C.textDim, fontSize: 12, flex: 1, textAlign: 'right' },

  // Empty state
  emptyBox: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  emptyIcon: { fontSize: 28, color: C.sub },
  emptyText: { color: C.textDim, fontSize: 15, fontWeight: '600' },
  emptySubText: { color: C.sub, fontSize: 13 },

  // Actions
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, paddingVertical: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  exportBtn: { backgroundColor: C.accent },
  clearBtn: { backgroundColor: C.redDim, borderWidth: 1, borderColor: C.redBorder },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  footNote: { color: C.sub, fontSize: 11, textAlign: 'center', letterSpacing: 0.5, paddingTop: 4 },
});
