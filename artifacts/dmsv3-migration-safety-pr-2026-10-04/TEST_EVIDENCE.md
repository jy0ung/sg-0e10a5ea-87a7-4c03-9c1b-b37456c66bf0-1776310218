# Test evidence

Starting commit: `1cfe067944f6e2b479efe8b72685f93bd2f8ae21`.
Branch: `test/dmsv3-migration-safety-2026-10-04`.
Validation date: 2026-10-04. Initial implementation commit: `0ee5f1e5eabd82a450efff861447dfb53e6d524d`.
PR: #134. Initial CI run: `37205557664` (https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/actions/runs/37205557664).
At 2026-10-04 21:28 MYT, Lint, Web App and Mobile App passed; isolated Production Readiness and mocked E2E were running; push-only RLS Matrix was skipped. Security Audit failed solely on the unchanged baseline dependency tree. The final handoff records the subsequent branch-tip run and completion decision.

| Check | Actual result |
|---|---|
| Dependency installation | npm ci --ignore-scripts --no-audit --no-fund succeeded; lockfile unchanged; no dependency additions |
| Full lint | npm run lint passed, zero errors/warnings |
| Full TypeScript and boundary/migration contract checks | npm run typecheck passed, including all workspace checks and RPC/frontend/migration/domain boundary scripts |
| Final changed-file lint and application types | passed after final helper/test edits |
| Focused safety suite before raw-lineage review, run 1 | 75 passed, 0 failed, 0 skipped, 3 files |
| Focused safety suite before raw-lineage review, run 2 | 75 passed, 0 failed, 0 skipped, 3 files |
| Full suite in machine local timezone | 1,465 passed, 2 failed, 362 skipped; two unchanged dateParsing tests parse locale text as local midnight and assume UTC output |
| Full suite with TZ=UTC, as in CI | 1,467 passed, 0 failed, 362 skipped, 227 discovered files; includes 74-test harness before final unsuccessful-check regression assertion |
| Initial CI full suite | 1,468 passed, 0 failed, 362 skipped; 206 test files passed, 21 skipped (227 total) |
| Provenance amendment verification | 75 passed twice again; changed-file lint and application types passed |
| Final immutable raw-lineage regression | 76 passed twice; changed-file lint and application types passed after final code review |
| Repository hygiene | passed; only source/test/evidence paths added |
| RPC/frontend migration consistency | check:rpc-frontend passed; no migration changed or applied |
| Disposable local database integration | npm run test:integration attempted, stopped at Docker prerequisite (Docker/CLI absent); no database connection occurred |
| Fixture integrity | five exact byte SHA-256 hashes verified; 1,337 identities, 1,341 occurrences, four LDU groups, seven outlets |
| Replay | fixed-clock full fixture repeated, reversed and rotated with identical normalization, identities, coverage, exceptions and SHA-256; negative-case input reversed too |
| Isolation/privacy | zero baseline files changed; no application imports of test harness; no real chassis detected; synthetic engines/targets only |

Live database tests are intentionally skipped with RLS_E2E=0 locally. CI's existing production-readiness job constructs its own isolated local Supabase stack and is the database validation path for this PR. This PR itself adds no database operations/migrations. Unchanged dateParsing source/tests were checked against starting HEAD; no unrelated fix or test weakening is included. The UTC rerun resolves that environment-dependent result without modifying code.

The publication model is a test-only acceptance model. Passing its tests does not certify PostgreSQL transaction atomicity, real concurrent writers or production stock. Future adapter/transaction work requires disposable-database rollback, race and outbox tests. Donor guarantees are characterized from pinned source/tests; donor tests were not executed against a database in this task.

Production safety: no production Supabase/Cloud SQL connection, live Sheets write, Apps Script repair/execution, trigger/property mutation, inventory replay/publish, feature flag/routing change, schema change, deployment or merge occurred. No tabs were added to any operational workbook. Original audits and synced sources remain read-only. Only this isolated repository branch is published for review.

## Files added

- `artifacts/dmsv3-migration-safety-pr-2026-10-04/DMS_OPS_DONOR_MATRIX.md`
- `artifacts/dmsv3-migration-safety-pr-2026-10-04/FIXTURE_MANIFEST.json`
- `artifacts/dmsv3-migration-safety-pr-2026-10-04/LEGACY_STOCK_EVIDENCE.json`
- `artifacts/dmsv3-migration-safety-pr-2026-10-04/NEXT_PR_RECOMMENDATION.md`
- `artifacts/dmsv3-migration-safety-pr-2026-10-04/PR_SUMMARY.md`
- `artifacts/dmsv3-migration-safety-pr-2026-10-04/RUNTIME_EVIDENCE_SCHEMA.md`
- `artifacts/dmsv3-migration-safety-pr-2026-10-04/STARTING_BASELINE.md`
- `artifacts/dmsv3-migration-safety-pr-2026-10-04/TEST_EVIDENCE.md`
- `src/test/dmsv3-migration-safety/README.md`
- `src/test/dmsv3-migration-safety/fixtures/identity-edge-cases.json`
- `src/test/dmsv3-migration-safety/fixtures/incidents.json`
- `src/test/dmsv3-migration-safety/fixtures/legacy-identities.json`
- `src/test/dmsv3-migration-safety/fixtures/runtime-unknown.json`
- `src/test/dmsv3-migration-safety/identity-coverage.spec.ts`
- `src/test/dmsv3-migration-safety/identity-coverage.ts`
- `src/test/dmsv3-migration-safety/publication-model.spec.ts`
- `src/test/dmsv3-migration-safety/publication-model.ts`
- `src/test/dmsv3-migration-safety/runtime-evidence.spec.ts`
- `src/test/dmsv3-migration-safety/runtime-evidence.ts`

## CI dependency audit exception

The initial Security Audit job (`111445895063`) failed `npm audit --audit-level=low` with eight high-severity findings: braces and its affected dependents @tailwindcss/typography, chokidar, fast-glob, lovable-tagger, micromatch, tailwindcss and tailwindcss-animate. A fresh local audit reproduced the same eight-package result. Package manifest and lockfile are byte-identical to starting main; baseline/current lockfile SHA-256 is `f6c638458bbdc6a1c6692678090841ed6103a01261564c5c4f24e06fa8c3de11`. No dependency or build workflow changed. This is a clearly unrelated baseline failure, recorded rather than fixed or suppressed in this safety-contract PR. It may still prevent merge under repository rules; no merge or dependency override is attempted.

## Final raw-lineage review

Different raw values under the same immutable company/source/table/snapshot/row lineage are conflicting evidence even if trimming/case normalization agrees. Identical raw occurrences remain duplicate transport evidence; independent source rows can observe the same chassis without becoming duplicate canonical Vehicles. The final regression tightens this distinction without changing any production function or fixture population. The final branch-tip CI is observed separately in the handoff.
