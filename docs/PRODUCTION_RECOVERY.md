# Production Recovery: Schema Drift Follow-Up

Last updated: 2026-05-29

## Summary

The `get_role_home_kpis` production failure was caused by deploy/schema drift:
the production web container was updated, but the host-local Supabase stack had
not applied the migrations that define the Home RPC and other Phase 3+ database
objects. Phase 4e made `/home` the default authenticated landing page, which
turned a previously dark RPC path hot for every signed-in user.

The immediate code-side recovery landed in `1061479`:

- `PageErrorState` now presents schema-cache misses as a platform configuration
  mismatch rather than a retryable page error.
- `PlatformHealthBanner` and `usePlatformHealth` surface the outage class
  globally for authenticated users.
- `20260528100000_schema_qualify_and_reload.sql` drops stray non-public RPC
  copies, asserts the required public RPCs exist, and notifies PostgREST to
  reload its schema cache.
- `check-rpc-frontend-vs-migrations` and expanded RPC contract checks catch
  frontend/migration drift before merge.
- Production module smoke now fails on `Unable to load data`, `Platform
  configuration mismatch`, or `schema cache`.

## Remaining Work

This follow-up closes the remaining code-side items from the recovery audit:

- Preserve the audit in tracked docs instead of leaving `production_recovery`
  as an untracked root file.
- Detect real Supabase/PostgREST error objects, including `message`, `details`,
  `hint`, and `code`, in `isPlatformMismatchError`.
- Remove the remaining service-layer `supabase.rpc('name' as never, ...)`
  escape hatches for RPCs that already exist in generated Supabase types.
- Add a post-deploy RPC canary step that signs in with smoke credentials and
  fails only on schema-cache/table-missing/platform-mismatch responses.

## Operator Procedure

The production database still requires an operator action on the production
host whenever migrations land:

```bash
cd /srv/flc-bi
git fetch && git checkout main && git pull
supabase db push --local --dry-run
supabase db push --local --yes
psql "$(supabase status -o env | awk -F= '/^DB_URL=/{print $2}' | tr -d \"'\\\"\")" \
  -c "NOTIFY pgrst, 'reload schema';"
```

Attach this evidence after the run:

```sql
SELECT version
  FROM supabase_migrations.schema_migrations
 WHERE version >= '20260524000000'
 ORDER BY version;
```

## At-Risk Surfaces

If migrations are not applied, these surfaces can fail with the same root
cause:

- Home and KPI Studio: `get_role_home_kpis`, `upsert_role_kpi_defaults`
- Finance reports: `get_profit_loss`, `get_balance_sheet`,
  `get_ar_aging_by_branch`, `get_ap_aging_by_branch`, `get_cash_position`,
  `get_period_close_summary`
- Ops queues: DMS sync summaries, reconciliation status/counts, lead intake
- Purchasing: purchase orders, GRN receipt summaries, 3-way match queues
- Webhooks and edge helper RPCs: webhook outbox RPCs, `bump_rate_limit`

The deploy canary added in this follow-up probes representative, read-safe
RPCs from those groups so a schema-cache miss blocks the deploy before users
hit the broken route.

## Explicit Non-Goals

- Do not run production-host commands from the repository workspace.
- Do not auto-apply migrations from `main-deploy.yml`; production migration
  apply remains an operator-controlled step.
- Do not broaden this pass into table-update casts, tests, generated-type
  regeneration, or unrelated `as never` cleanup.
