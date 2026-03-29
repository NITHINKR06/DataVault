import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { Platform } from 'react-native';
import { insertNotification, formatDateTime } from '../db/database';
import {
  setNativeActiveSession,
  clearNativeActiveSession,
  drainNativeCapturedNotifications,
  isNativeNotificationListenerEnabled,
} from './nativeNotificationListener';

const BACKGROUND_TASK = 'background-notification-task';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Register background task
TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }: any) => {
  if (error) return BackgroundFetch.BackgroundFetchResult.Failed;
  return BackgroundFetch.BackgroundFetchResult.NewData;
});

let foregroundSub: Notifications.Subscription | null = null;
let currentSessionId = -1;
let isCapturing = false;

const WHATSAPP = ['com.whatsapp', 'com.whatsapp.w4b', 'com.gbwhatsapp'];

export function startCapturingNotifications(sessionId: number) {
  isCapturing = true;
  currentSessionId = sessionId;
  setNativeActiveSession(sessionId);

  foregroundSub?.remove();
  foregroundSub = null;

  foregroundSub = Notifications.addNotificationReceivedListener(async (notification) => {
    if (!isCapturing) return;
    const { title, body, data } = notification.request.content;
    const pkg = (data?.packageName as string) || '';
    const isWA = WHATSAPP.some(p => pkg.includes(p)) || pkg.includes('whatsapp');
    if (!isWA && pkg !== '') return;

    await insertNotification({
      session_id: currentSessionId,
      source: pkg.includes('w4b') ? 'WhatsApp Business' : 'WhatsApp',
      sender: title || 'Unknown',
      preview: body || '',
      timestamp: Date.now(),
      datetime: formatDateTime(Date.now()),
    });
  });
}

export function stopCapturingNotifications() {
  isCapturing = false;
  currentSessionId = -1;
  clearNativeActiveSession();
  foregroundSub?.remove();
  foregroundSub = null;
}

export function getCapturingState() {
  return { isCapturing, currentSessionId };
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return checkNotificationPermission();
}

export async function checkNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const listenerEnabled = await isNativeNotificationListenerEnabled();
  if (listenerEnabled) return true;

  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

export async function syncCapturedNotificationsFromNative(): Promise<number> {
  if (Platform.OS !== 'android') return 0;

  const captured = await drainNativeCapturedNotifications();
  if (captured.length === 0) return 0;

  for (const item of captured) {
    await insertNotification({
      session_id: item.sessionId,
      source: item.packageName.includes('w4b') ? 'WhatsApp Business' : 'WhatsApp',
      sender: item.sender || 'Unknown',
      preview: item.preview || '',
      timestamp: Number(item.timestamp) || Date.now(),
      datetime: formatDateTime(Number(item.timestamp) || Date.now()),
    });
  }

  return captured.length;
}