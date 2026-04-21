# Security Model

## Identity

- Supabase Auth is the single identity provider.
- Public signup is disabled in `supabase/config.toml` (`[auth] enable_signup = false`).
- New users are onboarded via the `invite-user` edge function, which creates an auth user and a `profiles` row with `role='analyst'`, `access_scope='self'`, `company_id=<inviter's company>`.
- `handle_new_user` (DB trigger) ignores client-supplied `raw_user_meta_data.role|company_id|access_scope`. Privilege escalation via signup metadata is not possible.

## Authorization layers

1. **RLS (database)** — the primary boundary. Every tenant-scoped table requires `company_id` to match the caller's profile.
2. **Route gates (client)** — `<RequireRole roles={...}>` in `src/main.tsx` hides unauthorized UI. Not a security boundary; purely UX.
3. **Column gates (DB + client)** — `column_permissions` table lists per-role writable columns. The DB enforces via `BEFORE UPDATE` trigger / `SECURITY DEFINER` RPC; the client uses `useColumnPermissions` to disable inputs.

## Edge functions

- All edge functions validate the caller's JWT and reject anonymous calls unless the function is explicitly public.
- CORS is set to an explicit allow-list in `supabase/functions/_shared/cors.ts`.
- `send-push-notification` also checks that target `user_ids` share the caller's company before delivery.

## Secrets

- Anon key and publishable URL are the only client-side values.
- Service-role key is never shipped to the client and is available only in edge functions via `Deno.env`.
- Scripts read credentials from env files; do not commit `.env*` other than `.env.example`.

## Audit

- All mutating service calls should log a row to `audit_logs` (DB-side where possible).

## RLS verification harness

- `src/test/rls-matrix.spec.ts` is the cross-tenant acceptance gate for Phase 0.
- It signs in as user A (company X) and, for every tenant-scoped table, asserts that A cannot SELECT/INSERT rows belonging to company Y. It also asserts that a fresh signup cannot escalate via `raw_user_meta_data` and that notifications cannot be spoofed onto another tenant's user.
- The suite is excluded from the default `vitest run` because it requires a live Supabase stack. To execute:
  1. `supabase start` (apply migrations).
  2. Seed two tenants + users with `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:rls:seed`.
  3. Export the returned credentials as `RLS_USER_A_*` / `RLS_USER_B_*` along with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
  4. `npm run test:rls`.
- Run this harness before every release; a red run blocks the tag.
- `audit_logs` INSERT policy requires `user_id = auth.uid()`; SELECT is scoped by company.

## Threat model (condensed)

| Threat                                          | Control                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Cross-tenant read via client                    | RLS USING clause on every table (`company_id = profile.company_id`)    |
| Cross-tenant write via client                   | RLS WITH CHECK + column triggers                                       |
| Privilege escalation at signup                  | `handle_new_user` ignores metadata + public signup disabled            |
| Spoofed notifications                           | Notifications INSERT policy requires `user_id = auth.uid()`            |
| Edge function called without auth               | Explicit JWT validation in every handler                               |
| Credential leak via scripts                     | Scripts require env-file overrides; no keys embedded in shell scripts  |
| Stolen anon key used to probe schema            | RLS default-deny; no public table lists tenant data                    |
| Import pipeline partial failure                 | Transactional RPC covers `import_batches + vehicles + quality_issues` |

## Accepted dependency audit exceptions

| Package | Severity | Advisory | Rationale | Mitigation |
| --- | --- | --- | --- | --- |
| `xlsx` | high | Prototype Pollution, ReDoS | No upstream fix on npm (SheetJS moved distribution). Used only by `src/lib/import-parser.ts` and `src/services/reportService.ts`. | Parsing runs only behind admin-gated import/report routes; file-name/size validation at upload. Replacement with `exceljs` tracked as follow-up. |
| `esbuild`, `vite` (moderate) | moderate | Dev-server request leak | Affects local dev server only; production is a static bundle behind Nginx. | Bump to Vite 8 deferred to avoid churn during release; not exposed in prod. |
| `jsdom`, `http-proxy-agent`, `@tootallnate/once` (low) | low | Transitive via Vitest/jsdom | Test runtime only; no production reach. | Will be resolved by the next minor bump to `jsdom` in vitest 4. |

Review cadence: re-run `bash scripts/security-check.sh` on every release tag and during the monthly restore drill.
