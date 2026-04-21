# FLC BI — Architecture

## Monorepo layout

```
/                      → web app (Vite + React + React Router)
  src/pages            → route components, one folder per module
  src/components       → shared UI + module-scoped components
  src/contexts         → AuthContext, DataContext, SalesContext
  src/services         → all Supabase reads/writes
  src/lib              → pure utilities (no supabase)
  src/hooks            → reusable hooks
  src/integrations/supabase → generated types + client
  src/i18n             → i18next scaffold + en bundle

apps/hrms-mobile       → Capacitor + Vite HRMS employee app
packages/
  types                → shared domain types
  supabase             → shared typed client export
  hrms-schemas         → zod schemas shared by web + mobile
  hrms-services        → HRMS data-access shared by web + mobile

supabase/
  migrations           → ordered SQL migrations
  functions            → edge functions
  config.toml          → local stack config

e2e                    → Playwright specs
scripts                → seed + server bootstrap
```

## Layering rules

1. **Pages / components MUST NOT call `supabase.from()` or `supabase.rpc()` directly.**
   Enforced by an ESLint `no-restricted-syntax` rule. All data access goes through `src/services/*`.
2. **Services own SQL shape.** They return typed rows from `packages/supabase`. Services do not import from `src/pages` or `src/components`.
3. **Contexts compose services.** `DataContext`, `SalesContext`, `AuthContext` expose React Query–backed state; context values are memoized.
4. **Routes gate on roles.** Route-level `<RequireRole>` wrappers in `src/main.tsx` are the single route gate. Column-level gating lives in `useColumnPermissions`.
5. **Errors bubble to nested boundaries.** Each major route is wrapped in a `RouteErrorBoundary` so a crash in one module does not blank the app.

## Data fetching

- React Query is the cache boundary. Query keys are tenant-scoped: `[companyId, branchId, ...]`.
- Long-running lists (vehicles, orders) are paginated server-side; contexts expose filtered views.
- Mutations update the query cache via `setQueryData` or `invalidateQueries`.

## Security model (summary)

- Every table has RLS enabled and policies scoped by `profiles.company_id = auth.uid()`'s company.
- `handle_new_user` ignores client-supplied role/company metadata; admins upgrade users via the `invite-user` edge function.
- Public signup is disabled (`[auth] enable_signup = false`).
- Edge functions validate JWTs explicitly and run a same-company check before cross-user writes.
- See `docs/SECURITY.md` and `docs/RLS_MATRIX.md`.

## Observability

- Sentry (opt-in via `VITE_SENTRY_DSN`) wraps the root `ErrorBoundary`.
- Structured logs flow through `errorTrackingService` / `loggingService`.
- Edge function logs correlate with a `request_id` header.
