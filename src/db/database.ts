import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('datavault.db');

// ── Init schema ───────────────────────────────────────

export function initDatabase(): Promise<void> {
  return db.execAsync(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      start_datetime TEXT NOT NULL,
      end_datetime TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      source TEXT,
      sender TEXT,
      preview TEXT,
      timestamp INTEGER,
      datetime TEXT
    );

    CREATE TABLE IF NOT EXISTS call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      number TEXT,
      name TEXT,
      date INTEGER,
      datetime TEXT,
      duration INTEGER,
      type TEXT
    );
  `);
}

// ── Helpers ───────────────────────────────────────────

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

type RunResult = {
  insertId?: number;
  rowsAffected: number;
};

async function runSql(sql: string, args: unknown[] = []): Promise<RunResult> {
  const result = await db.runAsync(sql, ...(args as []));
  return {
    insertId: result.lastInsertRowId,
    rowsAffected: result.changes,
  };
}

function querySql<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  return db.getAllAsync<T>(sql, ...(args as []));
}

// ── Sessions ──────────────────────────────────────────

export async function startSession(): Promise<number> {
  const now = Date.now();
  const result = await runSql(
    'INSERT INTO sessions (start_time, start_datetime, is_active) VALUES (?, ?, 1)',
    [now, formatDateTime(now)]
  );
  return result.insertId!;
}

export async function endSession(sessionId: number): Promise<void> {
  const now = Date.now();
  await runSql(
    'UPDATE sessions SET end_time=?, end_datetime=?, is_active=0 WHERE id=?',
    [now, formatDateTime(now), sessionId]
  );
}

export async function getSessions(): Promise<Session[]> {
  return querySql<Session>('SELECT * FROM sessions ORDER BY start_time DESC');
}

export async function getActiveSession(): Promise<Session | null> {
  const rows = await querySql<Session>(
    'SELECT * FROM sessions WHERE is_active=1 ORDER BY start_time DESC LIMIT 1'
  );
  return rows.length > 0 ? rows[0] : null;
}

// ── Notifications ─────────────────────────────────────

export async function insertNotification(data: NotifData): Promise<void> {
  await runSql(
    'INSERT INTO notifications (session_id,source,sender,preview,timestamp,datetime) VALUES (?,?,?,?,?,?)',
    [data.session_id, data.source, data.sender, data.preview, data.timestamp, data.datetime]
  );
}

export async function getNotifications(): Promise<NotifData[]> {
  return querySql<NotifData>('SELECT * FROM notifications ORDER BY timestamp DESC');
}

// ── Call logs ─────────────────────────────────────────

export async function insertCallLog(data: CallData): Promise<void> {
  await runSql(
    'INSERT INTO call_logs (session_id,number,name,date,datetime,duration,type) VALUES (?,?,?,?,?,?,?)',
    [data.session_id, data.number, data.name, data.date, data.datetime, data.duration, data.type]
  );
}

export async function getCallLogs(): Promise<CallData[]> {
  return querySql<CallData>('SELECT * FROM call_logs ORDER BY date DESC');
}

// ── Export ────────────────────────────────────────────

export async function exportAll(): Promise<ExportData> {
  const [sessions, notifications, call_logs] = await Promise.all([
    getSessions(), getNotifications(), getCallLogs()
  ]);
  return {
    exported_at: Date.now(),
    exported_datetime: formatDateTime(Date.now()),
    sessions,
    notifications,
    call_logs,
  };
}

// ── Clear ─────────────────────────────────────────────

export async function clearAll(): Promise<void> {
  await runSql('DELETE FROM notifications');
  await runSql('DELETE FROM call_logs');
  await runSql('DELETE FROM sessions');
}

// ── Types ─────────────────────────────────────────────

export type Session = {
  id: number;
  start_time: number;
  end_time: number | null;
  start_datetime: string;
  end_datetime: string | null;
  is_active: number;
};

export type NotifData = {
  id?: number;
  session_id: number;
  source: string;
  sender: string;
  preview: string;
  timestamp: number;
  datetime: string;
};

export type CallData = {
  id?: number;
  session_id: number;
  number: string;
  name: string;
  date: number;
  datetime: string;
  duration: number;
  type: string;
};

export type ExportData = {
  exported_at: number;
  exported_datetime: string;
  sessions: Session[];
  notifications: NotifData[];
  call_logs: CallData[];
};
