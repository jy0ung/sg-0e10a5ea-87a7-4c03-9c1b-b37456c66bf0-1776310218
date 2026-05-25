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

## UI conventions

### StandardTable
New list/table views use `src/components/shared/StandardTable.tsx` rather than raw HTML tables. Features: per-column sort, global text filter, client-side pagination, row selection, and bulk-action slot. For large server-paginated results use `ExcelTable` (wraps the same column definition contract).

### Form validation
All forms use the shared Zod helpers in `src/lib/forms.ts`:
- `requiredString`, `optionalString`, `optionalEmail`, `optionalPhone`, `codeField` — composable field schemas.
- `validateForm(schema, data)` — returns a `Record<string, string>` of field errors or `null` on success.
- Do **not** add per-page ad-hoc validation state; route the validation through these helpers so error messages are consistent.

### Toast variants
`useToast` (shadcn/ui) and `toast` (Sonner) both support `warning` / `destructive` variants. Use `src/lib/errorMessages.ts` to translate raw Postgres / Supabase error codes into user-friendly messages before displaying a toast.

## Service decomposition pattern

Large service files are split into three concerns (see `salesOrder*Service.ts` as the reference):

| File | Responsibility |
|------|---------------|
| `*CrudService.ts` | `create`, `update`, `delete`, `get*` — direct table reads/writes |
| `*PipelineService.ts` | State-machine transitions, status rules, audited moves |
| `*DashboardService.ts` | Aggregation RPCs, summary stats, KPI queries |

A barrel file `salesOrderService.ts` re-exports all three for backwards compatibility — existing callers do not need updating.

## Concurrency patterns

- **Advisory locks** (`pg_advisory_xact_lock(hashtext(id))`) guard idempotent batch operations in `commit_import_batch` and equivalent multi-step writes. Acquire the lock as the first statement inside the transaction.
- **RPC wrapper for long-running jobs** — edge functions that touch multiple rows use a `SECURITY DEFINER` PL/pgSQL RPC instead of issuing raw DML; the RPC acquires the advisory lock, performs all mutations atomically, and returns a structured result. See `rollover_company_leave_balances()`.
- **CTEs for N+1 elimination** — functions that previously issued per-row sub-queries (e.g. SLA policy lookups in `auto_aging_report`) load the full reference table once into a local variable or CTE at function entry.

## Immutable payment ledger pattern (AR / AP)

Both AR (`payment_events`) and AP (`supplier_payment_events`) use the same pattern. Do not deviate from it when adding new finance ledgers.

**Invariants:**
- The event table is append-only. `REVOKE INSERT, UPDATE, DELETE FROM authenticated` prevents direct DML from the client tier.
- All mutations go through `SECURITY DEFINER` RPCs only.
- A `AFTER INSERT OR DELETE` trigger on the event table atomically recomputes the parent record's `paid_amount` and `payment_status`. No service layer should ever manually set those fields.
- Reversals are first-class events (`event_type = 'reversal'`) with a `reversal_of_event_id` back-link. Double-reversal is rejected server-side.
- Tenant isolation is enforced by RLS (`SELECT` via `profiles.company_id`) and by the RPC which validates `company_id` ownership before inserting.

**RPC naming convention:**

| Concern | AR | AP |
|---|---|---|
| Record event | `record_payment_event` | `record_supplier_payment_event` |
| Reverse event | `reverse_payment_event` | `reverse_supplier_payment_event` |
| Read ledger | `get_payment_events` | `get_supplier_payment_events` |
| Aging summary | `get_ar_aging_summary` | `get_ap_aging_summary` |
| Lifecycle move | — | `transition_pi_lifecycle` |

**AP lifecycle state machine:**
```
received → verified → approved → scheduled ↘
                                 approved  → paid
any (except paid/cancelled)   → cancelled
```
Lifecycle transitions are enforced by `transition_pi_lifecycle()`. Payment RPCs reject calls unless `lifecycle_status IN ('approved', 'scheduled')`.

**Service layer:**
- `src/services/invoiceService.ts` — AR methods (`recordPaymentEvent`, `reversePaymentEvent`, `getPaymentEvents`, `getArAgingSummary`)
- `src/services/apService.ts` — all AP methods
- `src/services/purchaseInvoiceService.ts` — CRUD + `rowToInvoice` mapper (includes AP lifecycle fields)

## Target directory for new modules

New features (post Phase 2 refactor) should be scaffolded under `src/features/`:

```
src/features/{module}/
  pages/        → route-level page components (lazy-loaded from main.tsx)
  components/   → module-private UI components
  hooks/        → module-private hooks
  services/     → if the module warrants its own service (otherwise use src/services/)
```

Existing code under `src/pages/` and `src/services/` remains in place. Migrate incrementally when touching a file for another reason.

