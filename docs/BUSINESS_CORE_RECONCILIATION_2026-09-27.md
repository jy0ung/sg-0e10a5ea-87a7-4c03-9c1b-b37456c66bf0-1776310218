# Business Core reconciliation → Sales identity migration

**Checkpoint:** 2026-09-27  
**Parent:** #47; implementation #94; release safety remains #48  
**Repository baseline:** `3a0da12df47a61d1a8ee081d3a9e14af44ec873f`

## Authoritative read-only evidence

The host's `flc-bi-supabase.service` starts the Supabase project in this checkout. The running production application image is `sha-85b0251`; the associated host database is `supabase_db_rbmsbppvpgcrmtkdfahy`. Schema preflight and aggregate queries were executed through host-local `psql` in read-only transactions. The aggregate query had a 30-second statement timeout and ended with ROLLBACK. No names, account IDs, chassis numbers, or customer rows were exported.

Scope: all companies, including historical/deleted source rows (the reconciliation pack is an integrity audit, not the filtered operational report).

| Measurement | Result |
|---|---:|
| Applied migration ledger rows | 152 |
| Latest applied migration | `20260712000000` |
| `deals.sales_advisor_employee_id` present | No |
| Profiles without an Employee link | 15 |
| Employee rows (inventory count, not an exception count) | 3 |
| Legacy Sales Advisor rows (inventory count, not a failed-map count) | 195 |
| Vehicles with nonblank salesperson name and NULL salesperson Profile ID | 22,185 |
| Sales Target rows | 0 |

**Full reconciliation: blocked by schema prerequisites.** The pack expects canonical Deal ownership added by `20260922090000_deal_employee_sales_advisor_identity.sql`. The preflight stopped full execution rather than fabricating counts or changing production. Profile workforce mismatches, invalid organisation references, canonical Deal exceptions, failed Advisor mappings, and the remaining Vehicle categories are **not measured**. The partial counts above are not a full pack result, and zero target rows does not imply clean identity data.

The company-scope defect in the existing pack was corrected: the replacement token now differs textually from the sentinel expression. Previously replacing every occurrence left `NULLIF` comparing the supplied company ID with itself, which silently widened the query to all companies.

## Measured implementation decision

Implement the additive Employee-backed target/report caller path in the repository and test it on disposable data. Production execution remains gated on schema reconciliation and #48 evidence.

- There are no existing production Sales Targets to backfill in this snapshot.
- Legacy target rows in other environments carry only a name, branch and period. None of those establish Employee identity. Preserve them with NULL `employee_id`; do not guess a mapping even if the name is unique.
- The large name-only Vehicle population must remain visible as unresolved. A matching label cannot create an Employee relationship.
- The 195 legacy Advisor rows still need measured code/assignment reconciliation. Their row count is not proof that 195 deterministic mappings exist.

## Implementation contract

Targets add a nullable `employee_id` FK to `employees`, with delete restriction, same-company/valid-branch validation, server-derived name snapshots and uniqueness on company + Employee + branch + year + month. New UI writes require an Employee selection. The old name field remains readable. Unresolved legacy targets are returned separately by the report and remain visible in target management; they never match actuals by name. Branch remains the existing company-scoped code dimension in this slice; canonical Branch-ID migration is separate.

The Sales Performance business metric remains **legacy orders booked in the selected month**, including all existing statuses in total orders/revenue and only case-insensitive `delivered`/`completed` in delivered counts. Soft-deleted orders are excluded. This is not a new Deal-stage or commission metric. Date bounds are server-side calendar boundaries, including the whole final day. Aggregation runs server-side, avoiding PostgREST row-limit truncation.

Order attribution first uses canonical Employee ownership from the migrated Deal with the same source ID. Otherwise, the actual `sales_orders.salesman_id -> sales_advisors` relationship may resolve through exactly one same-company Employee staff code. This legacy FK must not be mistaken for a Profile FK. Names never join identities. Totals and targets match by Employee and branch. Employees with a target but no orders remain visible at zero; name-only orders and targets remain separate unresolved rows.

Auto Aging attribution uses only the existing same-company Vehicle → Profile → Employee chain. It groups by Employee and branch, preserves source rows with missing/invalid/cross-company identity as separate unresolved entries, and returns stable identity keys plus deterministic pagination. It does not add Vehicle ownership or change imports. Other Auto Aging report branches retain their existing SQL behavior.

Both RPCs use invoker security so table RLS remains authoritative. The target validation trigger has a fixed search path and no direct authenticated execution grant. Names remain display snapshots; commission-specific names are deferred to the next slice.

## Release and rollback boundary

1. Review this repository implementation and its tests; keep #48 open.
2. Through a separately authorized production release, reconcile/apply the prerequisite schema. Rerun the full read-only pack with commit, scope and safe exception counts before promoting these callers.
3. Recheck target row count immediately before the target migration. Any new legacy targets require an explicit reviewed ID mapping; do not infer from names. No automatic target backfill is supplied because this schema has no deterministic source key.
4. Apply both new migrations before deploying the new application. The migration-ledger release guard enforces the database prerequisites.
5. Coordinate target writes during rollout: replacing the old full name uniqueness constraint with legacy-only uniqueness is necessary to support two Employees with the same name. **Old clients' name-based `ON CONFLICT` target upserts are incompatible with the new index.** Existing reads and legacy fields remain available. Do not roll back to an old target-writing client; disable target writes or deploy a forward fix retaining the Employee contract. Recreating the old name constraint after canonical same-name records exist requires explicit reconciliation and is not an automatic rollback.
6. Do not drop compatibility columns/tables, enforce workforce organisation FKs, apply production migrations, or deploy as part of this checkpoint.

## Validation

- `npm run check:baseline` passed using the checked-in CI placeholder Supabase environment: repository hygiene, lint, all four TypeScript workspaces, RPC/architecture boundaries, **1,344 unit tests**, security checks, zero audit vulnerabilities, main bundle budget, and all three application builds.
- `npm run test:integration` reconstructed an isolated Supabase stack, passed database lint/security assertions and **180 live tests**, including nine new identity/scoping cases. The stack was destroyed afterward.
- `npm run gen:types:write` found the augmented types already consistent; both Sales Target service mirrors are identical.
- A first baseline attempt without CI environment placeholders failed on missing Supabase configuration. A new test's unsupported `String.replaceAll` was replaced with ES-target-compatible string operations; the corrected repository gate passed.

Synthetic test results do not replace the blocked authoritative reconciliation.

## Follow-up sequence

Complete authoritative reconciliation and exception review; then converge person-specific Commission rules/records onto Employee/Deal/Vehicle references. Add Vehicle Employee ownership only from deterministic mappings. Migrate remaining Profile workforce reads and retire compatibility state only after caller, data and rollback evidence supports it.
