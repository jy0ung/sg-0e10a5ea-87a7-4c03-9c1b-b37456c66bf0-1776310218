# Edge Function Key Rotation Runbook

Owner: Group IT / Platform on-call
Last reviewed: 2026-05-24
Cadence: every 90 days, or immediately after any suspected disclosure

This runbook covers the secrets edge functions depend on that are NOT
managed by Supabase itself (which already rotates `SUPABASE_*` keys via
the dashboard). Specifically:

| Secret | Used by | Effect of compromise |
|---|---|---|
| `FCM_SERVER_KEY` | `send-push-notification` (Android) | Attacker can push arbitrary notifications to all Android devices registered in `push_tokens`. |
| `APNS_PRIVATE_KEY` | `send-push-notification` (iOS) | Attacker can push arbitrary notifications to iOS devices. PEM file, paired with `APNS_KEY_ID` + `APNS_TEAM_ID`. |
| `APNS_KEY_ID` | `send-push-notification` (iOS) | Identifies the APNs auth key. Public-ish (paired with private key). |
| `APNS_TEAM_ID` | `send-push-notification` (iOS) | Apple Developer Team ID. Public. |
| `APNS_BUNDLE_ID` | `send-push-notification` (iOS) | iOS app bundle identifier / APNs topic. Public. |
| `ALLOWED_ORIGINS` | All edge functions (CORS allow-list via `_shared/cors.ts`) | If permissive (e.g. `*`), enables CSRF-style requests from any origin. |
| `DMS_*` | (planned) `dms-sync-worker` live fetch | Out of scope until Proton HQ issues a service account; today this function only accepts staged payloads. |

## Routine rotation (every 90 days)

The rotation cadence is calendar-driven, not event-driven. Even without
suspicion of compromise, rotate on schedule so that an old key never
silently lingers in CI runners, laptop env files, or screenshot leaks.

### FCM_SERVER_KEY

1. Open Firebase console → Project Settings → Cloud Messaging.
2. Click **Add server key** (do NOT delete the old one yet — both keys
   are valid until the old one is revoked, so the rotation has no
   downtime window).
3. Copy the new key. It will look like `AAAA...:APA91b...`.
4. In Supabase Dashboard → Settings → Edge Functions → Secrets, update
   `FCM_SERVER_KEY` to the new value. Save.
5. Trigger a deploy of `send-push-notification` so the new isolate
   picks up the secret on cold start (`supabase functions deploy
   send-push-notification` from a host with the deploy access token,
   or push to `main` and let CI redeploy).
6. Smoke test: send a test push to a known device via the admin notify
   flow. Confirm receipt within 30 seconds. The Edge Function logs an
   `[push:startup]` line on cold start if `FCM_SERVER_KEY` is missing —
   absence of that warning confirms the secret is set.
7. After 24 hours of green health, return to the Firebase console and
   **delete the previous server key**. This is the step that actually
   rotates; everything before it is a parallel-running phase.
8. Update the date in `docs/EDGE_KEY_ROTATION.md` (this file) under
   "Last rotated" below.

### APNS_PRIVATE_KEY (.p8)

APNs auth keys are issued per Team ID, scoped to one or more services,
and can be downloaded exactly once. If an existing key is lost, the
only path forward is to revoke and re-issue.

1. Apple Developer portal → Certificates, Identifiers & Profiles → Keys
   → **+** → Enable APNs → name it `FLC UBS Push <yyyy-mm>`.
2. Download the `.p8`. Apple gives you exactly one chance — save it to
   a 1Password vault or the corporate secrets manager immediately.
3. Note the new `Key ID` (10 chars).
4. In Supabase Dashboard → Edge Function Secrets:
   - Set `APNS_PRIVATE_KEY` to the PEM contents. Newlines may be
     escaped as `\n` — the function tolerates both literal newlines
     and the `\n` escape sequence.
   - Set `APNS_KEY_ID` to the new Key ID.
   - Leave `APNS_TEAM_ID` and `APNS_BUNDLE_ID` unchanged.
5. Redeploy `send-push-notification`.
6. Smoke test on an iOS device. The function will log an APNs response
   per device token on success.
7. After 24h green, revoke the previous APNs Auth Key from the Apple
   Developer portal.
8. Update "Last rotated" below.

### ALLOWED_ORIGINS

This is a CORS allow-list, not a secret in the cryptographic sense, but
it has security implications: if it widens unintentionally, edge
functions accept cross-origin requests from attacker domains.

1. Confirm the current value via `supabase secrets list` (operator host):
   ```
   ALLOWED_ORIGINS=https://ubs.protonfookloi.com,https://hrms.protonfookloi.com
   ```
2. When adding a new domain (staging, new tenant), append it; do NOT
   replace.
3. After change, redeploy ALL edge functions:
   ```
   supabase functions deploy invite-user delete-user update-user-status \
     send-push-notification rollover-leave-balances dms-sync-worker
   ```
4. Verify the `Access-Control-Allow-Origin` header is echoed back for
   the new origin via:
   ```
   curl -i -X OPTIONS https://ubs.protonfookloi.com/functions/v1/invite-user \
     -H "Origin: https://new-origin.example" \
     -H "Access-Control-Request-Method: POST"
   ```
   Expect `Access-Control-Allow-Origin: https://new-origin.example`.

## Emergency rotation (suspected compromise)

Skip the 24h parallel-running step. After uploading the new secret and
redeploying:

1. Immediately delete/revoke the old key (Firebase / Apple portal).
2. Within 1 hour, run `npm run security:smoke` against production. All
   probes should still return their expected 401/403/429 (no behavior
   change from key rotation).
3. Within 24 hours, file a `docs/INCIDENT_RESPONSE.md` entry tagged
   `secret-rotation` documenting the suspected vector and the rotation
   timestamp.
4. If FCM/APNs was compromised, audit `push_tokens` for unexpected
   `created_at` entries in the disclosure window. Revoke any tokens
   you don't recognise.

## Detection

`send-push-notification` logs a one-time `[push:startup]` warning on
cold start if `FCM_SERVER_KEY` is unset. Treat that warning as a
**must-fix** alert: it means no Android pushes are flowing.

`bump_rate_limit()` (migration `20260524010000`) makes durability of
rate-limit budgets independent of isolate restarts. If you observe a
sudden drop in 429s from production after a deploy, verify the
migration applied:

```sql
SELECT * FROM public.rate_limits ORDER BY updated_at DESC LIMIT 10;
SELECT public.bump_rate_limit(
  '00000000-0000-0000-0000-000000000000'::uuid,
  'smoke-test', 1, 60
);
```

The second call should return `allowed=false` because the budget of 1
was consumed by the first.

## Last rotated

| Secret | Date | Operator | Notes |
|---|---|---|---|
| `FCM_SERVER_KEY` | n/a | — | Set at HRMS mobile launch; rotation cadence starts 2026-05-24. |
| `APNS_PRIVATE_KEY` | n/a | — | Provisioning open per `docs/LAUNCH_CHECKLIST.md`. Update after first issuance. |
| `ALLOWED_ORIGINS` | 2026-05-06 | platform | Pinned to ubs/hrms protonfookloi.com at production launch. |
