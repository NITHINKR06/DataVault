# DataVault — Expo Version

100% React Native / TypeScript. No Java. No Android Studio needed to run.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Expo SDK 51 |
| Router | expo-router |
| Database | expo-sqlite (on-device SQLite) |
| Notifications | expo-notifications |
| File export | expo-file-system + expo-sharing |
| Build | EAS Build (cloud) |

---

## Quick Start (Development)

### 1. Install dependencies
```bash
cd DataVaultExpo
npm install
```

### 2. Install Expo CLI
```bash
npm install -g expo-cli eas-cli
```

### 3. Run on your phone — Option A: Expo Go (fastest, no build needed)
```bash
npx expo start
```
- Install **Expo Go** app on your Android phone from Play Store
- Scan the QR code shown in terminal
- App opens instantly on your phone

> ⚠️ Note: Some native features (call log reading) require a real build. 
> The UI and SQLite/notifications work in Expo Go.

---

## Build APK (installs directly on phone, no Play Store)

### Step 1 — Create free Expo account
```bash
eas login
```
Go to https://expo.dev and sign up free.

### Step 2 — Configure project
```bash
eas build:configure
```

### Step 3 — Build APK
```bash
eas build --platform android --profile preview
```
- This builds in the cloud (free tier available)
- Takes ~5-10 minutes
- Downloads a `.apk` file when done

### Step 4 — Install on phone
```bash
adb install your-app.apk
```
Or transfer the APK to your phone and open it directly.
(Enable "Install from unknown sources" in phone Settings if prompted)

---

## Build locally (needs Android SDK)

If you have Android SDK installed:
```bash
npx expo run:android
```

---

## Permissions Setup on Phone

When the app opens:

**Call History** — tap Grant → allow the system dialog

**Notifications** — tap Grant → opens Notification Access settings 
→ find **DataVault** → toggle ON → return to app

---

## How to Use

1. Both permission dots turn green ✅
2. Tap **▶ Start** — session begins, notifications captured in real-time
3. Tap **■ Stop** — session ends, call log snapshot taken
4. Sessions list shows start/end times for each session
5. Tap **⬆ Export JSON** — share sheet opens, save or send the file
6. Tap **✕ Clear** — wipes all data from device

---

## Exported JSON Structure

```json
{
  "exported_at": 1710000000000,
  "exported_datetime": "2024-03-10 09:45:00",
  "sessions": [
    {
      "id": 1,
      "start_datetime": "2024-03-10 09:00:00",
      "end_datetime": "2024-03-10 09:45:00",
      "is_active": 0
    }
  ],
  "notifications": [
    {
      "source": "WhatsApp",
      "sender": "John",
      "preview": "Hey, are you free?",
      "datetime": "2024-03-10 09:12:34",
      "session_id": 1
    }
  ],
  "call_logs": [
    {
      "number": "+91XXXXXXXXXX",
      "name": "Mom",
      "datetime": "2024-03-10 08:55:00",
      "duration": 183,
      "type": "incoming",
      "session_id": 1
    }
  ]
}
```

---

## Files

```
DataVaultExpo/
├── app/
│   ├── _layout.tsx        ← Root layout + DB init
│   └── index.tsx          ← Main UI (all screens)
├── src/
│   ├── db/
│   │   └── database.ts    ← SQLite schema + queries
│   └── services/
│       ├── notificationCapture.ts  ← expo-notifications listener
│       ├── callLog.ts              ← Call log reader
│       ├── permissions.ts          ← Permission helpers
│       └── exportService.ts        ← JSON export + share
├── app.json               ← Expo config + permissions
├── eas.json               ← EAS Build profiles
└── package.json
```

---

## Privacy

- Zero network requests — app never connects to internet
- All data in on-device SQLite at `expo-sqlite://datavault.db`
- Exported JSON goes wherever you share it — your choice
- Clear button permanently wipes all records
