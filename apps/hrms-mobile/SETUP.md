# HRMS Mobile — Native Project Setup

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| npm | 10+ |
| Xcode | 15+ (macOS only, for iOS) |
| Android Studio | Hedgehog+ (for Android) |
| Java | 17 (for Android Gradle) |
| Capacitor CLI | 6.x (installed locally via npm) |

---

## First-time setup

```bash
# 1. From the monorepo root, install all workspace deps
npm install

# 2. Configure environment
cd apps/hrms-mobile
cp .env.example .env
# → Edit .env with your Supabase URL and anon key

# 3. Build the web assets
npm run build        # runs tsc --noEmit && vite build → dist/

# 4. Initialise native platforms (only needed once)
npx cap add ios
npx cap add android

# 5. Sync web assets + plugins into native projects
npx cap sync
```

---

## Daily development

```bash
# Rebuild + sync (web changes)
npm run cap:sync

# Run on a connected device / simulator
npm run cap:run:ios
npm run cap:run:android

# Or open the native IDE directly
npx cap open ios      # opens Xcode
npx cap open android  # opens Android Studio
```

---

## Push Notifications setup

### Android (Firebase Cloud Messaging)
1. Create a Firebase project at https://console.firebase.google.com
2. Add an Android app with package name `com.flc.hrms`
3. Download `google-services.json` → place at `android/app/google-services.json`
4. In Firebase Console → Cloud Messaging → copy the **Server Key**
5. Add the server key to your Supabase project:
   Supabase Dashboard → Settings → Edge Functions → Secrets → `FCM_SERVER_KEY`

### iOS (Apple Push Notification service)
1. In Xcode, enable Push Notifications capability (Signing & Capabilities)
2. Create an APNs key in Apple Developer Portal → Keys
3. Download the `.p8` key file
4. Add to Supabase Dashboard → Settings → Edge Functions → Secrets:
   - `APNS_KEY_ID`
   - `APNS_TEAM_ID`
   - `APNS_PRIVATE_KEY` (contents of the .p8 file)

### Supabase Edge Function (push dispatcher)
Deploy the `supabase/functions/send-push-notification` Edge Function to dispatch
notifications when leave requests change status. See `supabase/functions/` for
the template.

---

## Deep Links

The app registers the custom URL scheme `com.flc.hrms://app/`.

| URL | Navigates to |
|-----|-------------|
| `com.flc.hrms://app/leave/history` | Leave History screen |
| `com.flc.hrms://app/attendance` | Attendance screen |
| `com.flc.hrms://app/announcements` | Announcements screen |
| `com.flc.hrms://app/appraisals` | Appraisals screen |
| `com.flc.hrms://app/payslip` | Payslip screen |

Configure the scheme in:
- **iOS**: `ios/App/App/Info.plist` → `CFBundleURLSchemes`
- **Android**: `android/app/src/main/AndroidManifest.xml` → `<intent-filter>`

---

## Project structure

```
apps/hrms-mobile/
├── capacitor.config.ts     # Capacitor app config (appId, webDir, plugins)
├── vite.config.ts          # Vite build config
├── tsconfig.json           # TypeScript config (references @flc/* packages)
├── src/
│   ├── App.tsx             # Router + ProtectedRoute + useAppLifecycle
│   ├── contexts/
│   │   └── AuthContext.tsx # Supabase auth + profile fetch
│   ├── hooks/
│   │   ├── useAppLifecycle.ts    # Back button, resume, deep links
│   │   └── usePushNotifications.ts # Push permission + listener setup
│   ├── screens/            # 7 screens (Login, Dashboard, Leave, ...)
│   └── services/
│       ├── hrmsService.ts  # Thin Supabase query layer (no React hooks)
│       └── pushService.ts  # FCM/APNs token registration + listeners
└── dist/                   # Vite build output → synced to native by Capacitor
```
