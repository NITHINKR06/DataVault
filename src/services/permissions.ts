import { Alert, Linking, NativeModules, Platform } from 'react-native';
import {
  isNativeNotificationListenerEnabled,
  openNativeNotificationListenerSettings,
} from './nativeNotificationListener';

// ─────────────────────────────────────────────────────
//  Android permission constants
// ─────────────────────────────────────────────────────
const PERMISSIONS = {
  READ_CALL_LOG: 'android.permission.READ_CALL_LOG',
  READ_PHONE_STATE: 'android.permission.READ_PHONE_STATE',
  READ_CONTACTS: 'android.permission.READ_CONTACTS',
};

// ─────────────────────────────────────────────────────
//  Request runtime permissions via PermissionsAndroid
// ─────────────────────────────────────────────────────
export async function requestCallLogPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    const { PermissionsAndroid } = require('react-native');
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
      PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
    ]);

    const granted =
      results[PermissionsAndroid.PERMISSIONS.READ_CALL_LOG] === 'granted' &&
      results[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] === 'granted';

    return granted;
  } catch (e) {
    console.warn('Permission error:', e);
    return false;
  }
}

export async function checkCallLogPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const { PermissionsAndroid } = require('react-native');
    const result = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_CALL_LOG
    );
    return result;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────
//  Notification Listener — requires special Settings page
// ─────────────────────────────────────────────────────
export async function checkNotificationListenerEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    return await isNativeNotificationListenerEnabled();
  } catch {
    return false;
  }
}

export async function openNotificationListenerSettings(): Promise<void> {
  try {
    openNativeNotificationListenerSettings();
  } catch (e) {
    // Fallback
    Linking.openSettings();
  }
}

export async function openAppSettings(): Promise<void> {
  Linking.openSettings();
}
