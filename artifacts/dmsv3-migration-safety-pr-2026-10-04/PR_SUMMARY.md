# DMSv3 Migration Safety Harness

Legacy stock recovery cannot currently be proven safe. Strategy 4 preserves stale legacy evidence while advancing isolated UBS preparation. This test-only PR establishes acceptance contracts before absorbing legacy semantics.

## Scope and guarantees

The existing Vitest tree contains pure source-identity, coverage and replay helpers, a read-only runtime evidence schema, and an in-memory publication/lease acceptance model. Tests verify 1,337 pseudonymized vehicle identities in 1,341 source occurrences, four LDU duplicate identity groups, seven outlets, negative identity cases, provenance hashes, deterministic replay, retained last-good publication, timeout isolation, fencing and abandonment.

Publication uses a private candidate, validation, then one visible version switch in the test model. This models the required invariant; it does not implement a PostgreSQL transaction, production version table, lock or outbox. Existing UBS single-record normalizers and webhook outbox remain in place. Future production work must connect these contracts to owning-domain transactions and prove rollback/concurrency against a disposable database.

## Ownership

Proton owns upstream facts. UBS owns local decisions and workflow. Inventory/Stock Control owns Vehicle, Reservation, Allocation, Reallocation, Transfer, stock movement and effective availability. Sales references Inventory identity; Dashboard consumes published models and never owns separate transfer truth. An observed normalized chassis group is not permission to create or merge a canonical Vehicle.

External source evidence → raw ingestion → deterministic normalization/reconciliation → UBS owning domain → events/outbox → versioned read models → Dashboard/Control Tower/Workspace/outlet views.

## Coverage proposal

For each explicitly expected outlet, require exactly one mapped observation, a successful check within an explicitly supplied policy, valid nonfuture timestamps, and matching observed/published hash and row count. A zero-row snapshot requires explicit empty acknowledgement. A recent check can verify an old unchanged publication; a changed source with an old publication is pending and blocks complete coverage. Check time and publication time have different meanings.

The historical TWU 59m37s / LDU 59m00s checks pass an injected 60-minute characterization policy and fail a 30-minute policy. The old stale verdict is not adopted as desired behavior. No production freshness threshold is approved by this PR. Threshold, empty-outlet authority, clock skew and mapping policy require a separate decision before rollout.

## Limits

This does not certify current production stock, live Apps Script executor identity, full legacy replay safety or a complete UBS stock domain. The forensic manifest rejects use as live stock. Real chassis, engine values, customer data, workbook IDs and canonical IDs are absent; edge engines/targets are synthetic. Original audit material stays local and read-only.

There are no runtime/UI/routing/feature-flag/schema/deployment changes, migrations, new dependencies or workflow changes. No production connections, live Sheets writes, Apps Script execution or deployments are part of this task. No backup or evidence tabs are created inside operational workbooks. Evidence storage uses repository artifacts; any future workbook storage must be a separate non-operational workbook.

## Review and next exit criteria

See TEST_EVIDENCE.md for actual validation and NEXT_PR_RECOMMENDATION.md for the next bounded slice. Implement one owning-domain prerequisite at a time; do not start a second canonical DMS Ops database or replay the legacy stock scheduler.
