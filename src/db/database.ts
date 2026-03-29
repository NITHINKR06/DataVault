import * as SQLite from 'expo-sqlite/legacy';

// expo-sqlite v13 (legacy API) — works with Expo 51
const db = SQLite.openDatabase('datavault.db');

// ── Init schema ───────────────────────────────────────

export function initDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(`CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        start_datetime TEXT NOT NULL,
        end_datetime TEXT,
        is_active INTEGER DEFAULT 1
      )`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        source TEXT,
        sender TEXT,
        preview TEXT,
        timestamp INTEGER,
        datetime TEXT
      )`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS call_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        number TEXT,
        name TEXT,
        date INTEGER,
        datetime TEXT,
        duration INTEGER,
        type TEXT
      )`);
    },
    (err) => reject(err),
    () => resolve()
    );
  });
}

// ── Helpers ───────────────────────────────────────────

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function runSql(sql: string, args: any[] = []): Promise<SQLite.SQLResultSet> {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(sql, args,
        (_, result) => resolve(result),
        (_, err) => { reject(err); return false; }
      );
    });
  });
}

function querySql<T>(sql: string, args: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(sql, args,
        (_, result) => {
          const rows: T[] = [];
          for (let i = 0; i < result.rows.length; i++) {
            rows.push(result.rows.item(i));
          }
          resolve(rows);
        },
        (_, err) => { reject(err); return false; }
      );
    });
  });
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
