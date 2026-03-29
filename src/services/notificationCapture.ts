import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { insertNotification, formatDateTime, NotifData } from '../db/database';

// WhatsApp package names to watch
const WHATSAPP_PACKAGES = [
  'com.whatsapp',
  'com.whatsapp.w4b',
  'com.gbwhatsapp',
  'com.poor.gbwhatsapp',
];

let isCapturing = false;
let currentSessionId = -1;
let notificationSubscription: { remove: () => void } | null = null;
let notificationsModulePromise: Promise<typeof import('expo-notifications')> | null = null;
let notificationHandlerConfigured = false;

function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

async function getNotificationsModule() {
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications');
  }
  return notificationsModulePromise;
}

async function ensureNotificationHandler(): Promise<boolean> {
  if (notificationHandlerConfigured) return true;
  if (Platform.OS !== 'android' || isExpoGo()) return false;

  const Notifications = await getNotificationsModule();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  notificationHandlerConfigured = true;
  return true;
}

// ─────────────────────────────────────────
//  Start capturing
// ─────────────────────────────────────────
export function startCapturingNotifications(sessionId: number) {
  isCapturing = true;
  currentSessionId = sessionId;

  if (Platform.OS !== 'android' || isExpoGo()) {
    console.warn('Notification capture is disabled in Expo Go. Use a development build for notification features.');
    return;
  }

  void (async () => {
    try {
      const canCapture = await ensureNotificationHandler();
      if (!canCapture || !isCapturing || currentSessionId === -1) return;

      const Notifications = await getNotificationsModule();
      notificationSubscription = Notifications.addNotificationReceivedListener(
        async (notification) => {
          if (!isCapturing || currentSessionId === -1) return;

          try {
            const { title, body, data } = notification.request.content;

            // expo-notifications may expose the source package in payload data on Android.
            const pkg = (data?.packageName as string) ||
                        (data?.android?.packageName as string) || '';

            const isWhatsApp = WHATSAPP_PACKAGES.some(p => pkg.includes(p)) ||
                               pkg.includes('whatsapp');

            if (!isWhatsApp && pkg !== '') return;

            const entry: NotifData = {
              session_id: currentSessionId,
              source: pkg.includes('w4b') ? 'WhatsApp Business' : 'WhatsApp',
              sender: title || 'Unknown',
              preview: body || '',
              timestamp: Date.now(),
              datetime: formatDateTime(Date.now()),
            };

            await insertNotification(entry);
            console.log('Notification captured:', entry.sender);
          } catch (e) {
            console.warn('Notification capture error:', e);
          }
        }
      );
    } catch (e) {
      console.warn('Failed to initialize notification capture:', e);
    }
  })();
}

// ─────────────────────────────────────────
//  Stop capturing
// ─────────────────────────────────────────
export function stopCapturingNotifications() {
  isCapturing = false;
  currentSessionId = -1;
  if (notificationSubscription) {
    notificationSubscription.remove();
    notificationSubscription = null;
  }
}

export function getCapturingState() {
  return { isCapturing, currentSessionId };
}

// ─────────────────────────────────────────
//  Request notification permission
// ─────────────────────────────────────────
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || isExpoGo()) return false;

  const Notifications = await getNotificationsModule();
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function checkNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || isExpoGo()) return false;

  const Notifications = await getNotificationsModule();
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}
