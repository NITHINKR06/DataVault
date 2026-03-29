import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { exportAll } from '../db/database';

export async function exportDataAsJson(): Promise<string> {
  const data = await exportAll();
  const json = JSON.stringify(data, null, 2);

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);

  const filename = `datavault_${timestamp}.json`;
  const path = FileSystem.documentDirectory + filename;

  await FileSystem.writeAsStringAsync(path, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(path, {
      mimeType: 'application/json',
      dialogTitle: 'Export Data',
      UTI: 'public.json',
    });
  }

  return path;
}