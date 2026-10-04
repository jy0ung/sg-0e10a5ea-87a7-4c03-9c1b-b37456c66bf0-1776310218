# Test evidence

Starting commit: `1cfe067944f6e2b479efe8b72685f93bd2f8ae21`.
Branch: `test/dmsv3-migration-safety-2026-10-04`.
Validation date: 2026-10-04. CI result is pending the PR run; actual observed results will be recorded in a follow-up evidence commit.

| Check | Actual result |
|---|---|
| Dependency installation | npm ci --ignore-scripts --no-audit --no-fund succeeded; lockfile unchanged; no dependency additions |
| Full lint | npm run lint passed, zero errors/warnings |
| Full TypeScript and boundary/migration contract checks | npm run typecheck passed, including all workspace checks and RPC/frontend/migration/domain boundary scripts |
| Final changed-file lint and application types | passed after final helper/test edits |
| Focused final safety suite, run 1 | 75 passed, 0 failed, 0 skipped, 3 files |
| Focused final safety suite, run 2 | 75 passed, 0 failed, 0 skipped, 3 files |
| Full suite in machine local timezone | 1,465 passed, 2 failed, 362 skipped; two unchanged dateParsing tests parse locale text as local midnight and assume UTC output |
| Full suite with TZ=UTC, as in CI | 1,467 passed, 0 failed, 362 skipped, 227 discovered files; includes 74-test harness before final unsuccessful-check regression assertion |
| Final new unsuccessful-check regression | final 75-test focused runs above passed; CI will run the final full tree |
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
