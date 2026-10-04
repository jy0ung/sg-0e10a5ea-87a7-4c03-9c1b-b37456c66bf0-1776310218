# Starting baseline

- Repository: `jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218` (UBS/DMSv3).
- Fresh isolated clone of main followed by fetch of current main before editing.
- Starting HEAD and origin/main: `1cfe067944f6e2b479efe8b72685f93bd2f8ae21`.
- Branch: `test/dmsv3-migration-safety-2026-10-04`.
- Donor main freshly checked read-only: `4f468a3ab8a817bafb56682c94b0de516e3cef6c`. Pinned audit donor blobs match this unchanged SHA; no donor changes.
- Resulting implementation commit: recorded in the subsequent implementation evidence commit and final PR handoff. A commit cannot contain its own SHA; the final branch tip is reported outside its own committed contents.

## Evidence reviewed before edits

Checkpoint 01/02/03 audit directories dated 2026-10-04: architecture checkpoint, live runtime certification, stock failure timeline, replay safety matrix, TWU/LDU coverage, orchestration audit, shadow replay, production repair strategy, DMS ingestion convergence, duplicate writer matrix and audit manifests. Original audit files and synced sources remain read-only.

All eleven documents in `docs/DMSv3 Refactor Plan/` were read, including current workflow, KPI definitions, business controls, source ownership, target schema, migration/cutover, evidence register, open policies and baseline reconciliation. Current staging worker, foundation/normalizer/reconciliation migrations, existing tests, Inventory/Sales services and CI were inspected.

## Existing capabilities and gaps

- `supabase/functions/dms-sync-worker/index.ts`: caller-supplied raw payload staging; payload hash uses JSON insertion order. Upsert ignores duplicates. Sync-run create/staging/status writes are separate API calls, not a whole-run transaction. This does not preserve every repeat occurrence with distinct lineage.
- `20260510120000_dms_legacy_sync_foundation.sql`: company-scoped raw source IDs/payload hashes and reconciliation records.
- `20260511000000_dms_normalizer_contracts.sql`: DMS versus UBS-local column authority.
- `20260511030000_normalize_dms_vehicle_stock_v2.sql`: accepted reconciliation required, existing Vehicle resolution, no auto-create, local fields protected; stage belongs to recompute trigger. Its fallback LIMIT 1 is not a newly certified general identity resolver.
- `20261002010000_dms_sales_order_normalizer_target_guards.sql`: approved source/type/company/target guards and ambiguity rejection for the bounded legacy SO normalizer, not full Case/RO convergence.
- Reconciliation review/retry RPCs and existing normalizer integration tests are present.
- `src/services/inventoryService.ts`: transfer/vehicle updates and event emission exist, but separate client operations do not establish atomic stock publication.
- `src/services/dealService.ts`: Deal references `vehicle_id`; target Inventory ownership remains authoritative.
- Existing webhook outbox (`20260527010000_phase6a_webhook_outbox.sql`) is a useful future integration boundary, not evidence of versioned Inventory candidate publication.

## CI safety inspection

Existing CI runs lint/typechecks/unit tests/builds, local production-readiness database tests and mocked E2E on PRs. The separate main deployment workflow is manual (`workflow_dispatch`). RLS job requiring repository secrets is push-only and is skipped for this feature PR. No workflow is changed. No branch push can auto-deploy this PR through the inspected deployment workflow.
