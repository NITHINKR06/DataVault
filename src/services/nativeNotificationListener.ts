import { NativeModules, Platform } from 'react-native';

type NativeCapturedNotification = {
  sessionId: number;
  packageName: string;
  sender: string;
  preview: string;
  timestamp: number;
};

type NativeNotificationModule = {
  setActiveSession: (sessionId: number) => void;
  clearActiveSession: () => void;
  isNotificationListenerEnabled: () => Promise<boolean>;
  openNotificationListenerSettings: () => void;
  drainCapturedNotifications: () => Promise<NativeCapturedNotification[]>;
};

const moduleRef = NativeModules.DataVaultNotificationModule as NativeNotificationModule | undefined;

export function hasNativeNotificationModule(): boolean {
  return Platform.OS === 'android' && !!moduleRef;
}

export function setNativeActiveSession(sessionId: number): void {
  if (!hasNativeNotificationModule()) return;
  moduleRef!.setActiveSession(sessionId);
}

export function clearNativeActiveSession(): void {
  if (!hasNativeNotificationModule()) return;
  moduleRef!.clearActiveSession();
}

export async function isNativeNotificationListenerEnabled(): Promise<boolean> {
  if (!hasNativeNotificationModule()) return false;
  return moduleRef!.isNotificationListenerEnabled();
}

export function openNativeNotificationListenerSettings(): void {
  if (!hasNativeNotificationModule()) return;
  moduleRef!.openNotificationListenerSettings();
}

export async function drainNativeCapturedNotifications(): Promise<NativeCapturedNotification[]> {
  if (!hasNativeNotificationModule()) return [];
  const list = await moduleRef!.drainCapturedNotifications();
  return Array.isArray(list) ? list : [];
}
