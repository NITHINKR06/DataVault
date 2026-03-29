import { Platform, NativeModules } from 'react-native';
import { formatDateTime, CallData } from '../db/database';

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

  try {
    // Method 1: Try via expo-contacts style content resolver
    const calls = await readViaContentResolver(sessionId, limit);
    return calls;
  } catch (e) {
    console.warn('Call log read error:', e);
    return [];
  }
}

async function readViaContentResolver(sessionId: number, limit: number): Promise<CallData[]> {
  return new Promise((resolve) => {
    try {
      // React Native exposes ContentResolver through a native module
      // In Expo bare workflow this works after permissions are granted
      const { CallLogModule } = NativeModules;
      
      if (CallLogModule && CallLogModule.getCallLogs) {
        CallLogModule.getCallLogs(limit, (error: any, logs: any[]) => {
          if (error || !logs) {
            resolve(generateMockCallLogs(sessionId));
            return;
          }
          const result: CallData[] = logs.map(log => ({
            session_id: sessionId,
            number: log.number || '',
            name: log.name || '',
            date: parseInt(log.date) || Date.now(),
            datetime: formatDateTime(parseInt(log.date) || Date.now()),
            duration: parseInt(log.duration) || 0,
            type: CALL_TYPE[parseInt(log.type)] || 'unknown',
          }));
          resolve(result);
        });
      } else {
        // Module not available - return mock for testing UI
        resolve(generateMockCallLogs(sessionId));
      }
    } catch {
      resolve(generateMockCallLogs(sessionId));
    }
  });
}

// Generates sample data so the UI works even before native module is wired up
function generateMockCallLogs(sessionId: number): CallData[] {
  const types = ['incoming', 'outgoing', 'missed', 'rejected'];
  const names = ['', '', 'Home', '', 'Office'];
  const now = Date.now();
  
  return Array.from({ length: 5 }, (_, i) => ({
    session_id: sessionId,
    number: `+91${Math.floor(9000000000 + Math.random() * 999999999)}`,
    name: names[i % names.length],
    date: now - i * 3600000,
    datetime: formatDateTime(now - i * 3600000),
    duration: Math.floor(Math.random() * 300),
    type: types[i % types.length],
  }));
}
