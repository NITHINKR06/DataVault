import { Platform, NativeModules } from 'react-native';
import { formatDateTime, CallData } from '../db/database';

type NativeCallLogItem = {
  number?: string;
  name?: string;
  date?: string;
  duration?: string;
  type?: string;
};

type DataVaultCallLogModule = {
  getCallLogs: (limit: number) => Promise<NativeCallLogItem[]>;
};

export function isNativeCallLogModuleAvailable(): boolean {
  const moduleRef = NativeModules.DataVaultCallLogModule as DataVaultCallLogModule | undefined;
  return Platform.OS === 'android' && !!moduleRef?.getCallLogs;
}

// Android call type constants
const CALL_TYPE: Record<number, string> = {
  1: 'incoming',
  2: 'outgoing',
  3: 'missed',
  4: 'voicemail',
  5: 'rejected',
  6: 'blocked',
};

/**
 * Reads call log using React Native's NativeModules.
 * This works in Expo with a custom dev client / bare workflow build.
 * 
 * For EAS Build (bare), the native Java code in the plugin handles this.
 * In managed Expo, we use a JS-native bridge approach.
 */
export async function readCallLogs(sessionId: number, limit = 200): Promise<CallData[]> {
  if (Platform.OS !== 'android') return [];

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const calls = await readViaContentResolver(sessionId, limit);
      if (calls.length > 0) {
        return calls;
      }
    } catch (e) {
      console.warn('Call log read error:', e);
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  return [];
}

async function readViaContentResolver(sessionId: number, limit: number): Promise<CallData[]> {
  try {
    const moduleRef = NativeModules.DataVaultCallLogModule as DataVaultCallLogModule | undefined;
    if (!moduleRef?.getCallLogs) {
      return [];
    }

    const logs = await moduleRef.getCallLogs(limit);
    return logs.map((log) => {
      const ts = parseInt(log.date || '') || Date.now();
      const typeNum = parseInt(log.type || '') || 0;
      return {
        session_id: sessionId,
        number: log.number || '',
        name: log.name || '',
        date: ts,
        datetime: formatDateTime(ts),
        duration: parseInt(log.duration || '') || 0,
        type: CALL_TYPE[typeNum] || 'unknown',
      };
    });
  } catch {
    return [];
  }
}
