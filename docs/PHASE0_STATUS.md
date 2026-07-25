# Phase 0 Status — FLC BI v2 Rebuild (Foundation)

**Date**: 2026-06-28 (updated 2026-07-25 for main rebase)
**Branch**: `dev-2`
**Status**: Planning + additive foundation (post-rebase onto latest `main`)

## Deliverables kept after rebase prep
- `docs/development-roadmap.md` — v2 rebuild roadmap (Phases 0–7)
- `packages/core-types/` — `@flc/core-types` shared roles/scopes/Zod Profile contract (additive; does not replace `@flc/types`)
- `docs/data-model/DATA_MODEL.md` — normalized entity skeleton + RLS/immutable patterns
- `supabase/migrations/v2/0001_initial_identity_tenant.sql` — stub only (TODO real DDL)
- This status file

## Dropped / superseded by `main`
- Local Phase 0 stub `packages/ui` — **not kept**. Production already has a full `@flc/ui` package on `main` (StandardTable, FilterBar, ExcelTable, shell primitives, etc.). Reintroducing the stub would clobber it.
- Root `tsconfig.json` references to a stub UI package — not needed; `main` already wires real packages via workspaces.

## Verification (pre-rebase, 2026-06-28)
- Multiple `npm run typecheck` runs were clean on the May 21 base.
- Post-rebase: re-run typecheck on latest `main` + new packages.

## Blockers
1. Supabase CLI may still be missing locally (blocks real v2 migrations / `supabase start`)
2. `@flc/core-types` not yet adopted by app code (by design until Phase 1+)
3. v2 migration path vs existing 100+ migrations needs an explicit cutover strategy

## Next (real v2 work on rebased tip)
- Rebase `dev-2` onto latest `origin/main`
- Wire `@flc/core-types` into workspace consumers only where it reduces duplication without forking `@flc/types`
- Schema design / real `migrations/v2` DDL once CLI available
- Phase 1 Vehicle domain per roadmap — on top of current production baseline

**All changes intended to stay additive/non-destructive relative to production `main`.**
