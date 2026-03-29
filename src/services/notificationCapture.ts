import * as Notifications from 'expo-notifications';
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
let notificationSubscription: Notifications.Subscription | null = null;

// ─────────────────────────────────────────
//  Setup notification handler
// ─────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,  // Don't re-show notifications
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// ─────────────────────────────────────────
//  Start capturing
// ─────────────────────────────────────────
export function startCapturingNotifications(sessionId: number) {
  isCapturing = true;
  currentSessionId = sessionId;

  // Listen for incoming notifications while app is running
  notificationSubscription = Notifications.addNotificationReceivedListener(
    async (notification) => {
      if (!isCapturing || currentSessionId === -1) return;

      try {
        const { title, body, data } = notification.request.content;
        
        // Check if it's from WhatsApp
        // expo-notifications exposes the originating app in data on Android
        const pkg = (data?.packageName as string) || 
                    (data?.android?.packageName as string) || '';

        const isWhatsApp = WHATSAPP_PACKAGES.some(p => pkg.includes(p)) ||
                           pkg.includes('whatsapp');

        if (!isWhatsApp && pkg !== '') return; // filter non-WA if pkg known

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
  if (Platform.OS !== 'android') return false;
  
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;
  
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function checkNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}
