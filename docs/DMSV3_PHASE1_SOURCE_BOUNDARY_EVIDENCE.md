# DMSv3 Phase 1 — Lead/Prospect source boundary evidence

Date: 2026-10-01. Main baseline: `e7445670bacfeedd0708368ec5ba8b917ea8134d`.
The checkout was clean, fetched main matched the requested baseline, and no
open PR touched this area. Read the DMSv3 README, reconstructed baseline and
relevant contracts in files 01, 03–07, plus `.ai/PROJECT_CONTEXT.md` before edits.

## Before implementation: current-state matrix

This matrix records inspection before adding tests or a correctness migration.
Historical test counts are not current acceptance evidence.

| Contract | Current schema/code | Existing test? | Live disposable proof before this slice? | Gap |
|---|---|---|---|---|
| Lead source read-only to ordinary authenticated users | `dms_raw_leads`; tenant SELECT; service-role-only writes | `rls-matrix.spec.ts`: INSERT denial | INSERT only; no complete source snapshot proof | Test valid INSERT and persisted UPDATE/DELETE denials |
| Prospect source read-only | `dms_raw_prospects`; same policies | Matrix INSERT denial | INSERT only | Same gap as Lead |
| Prospect without Lead valid | No required Lead column/FK; optional relationship stays in `raw_payload` | Mock feed contains Prospect | None specific | Import explicit null and absent Lead relationships; query feed/detail; prove no manufactured Lead |
| Local follow-up targets Lead | `add_lead_followup` checks kind, company and raw UUID | 8 mocked service tests; mocked Playwright flows | None specific | Persist and retrieve using authenticated RPC |
| Local follow-up targets Direct Prospect | Same RPC accepts `prospect` independently of Lead | Mock service accepts Prospect | None specific | Live positive control |
| Local follow-up leaves source unchanged | Follow-ups are separate rows; RPC only inserts there | Comments/intended design | None specific | Compare the entire source row before/after creation and note correction |
| Cross-company follow-up access denied | SELECT company/global; author/24h UPDATE; September restrictive tenant/enabled-actor gates | General matrix, no follow-up fixture | None specific | Populated exact-ID read/update/delete and cross-company INSERT/RPC tests |
| Cross-company source attachment denied | RPC validates company + source UUID; direct INSERT checks only follow-up company; UPDATE checks author/time, plus tenant gate | None | None | Suspected direct-DML bypass: A row can reference B source UUID; direct INSERT can spoof author |
| Source ID stable | Raw UUID + company/external-ID uniqueness; feed/detail preserve external ID; no name join | Mock field mapping | None specific | Same customer display name with distinct source IDs; read/source snapshot assertions |
| Replay/read does not duplicate or corrupt source/local state | Company/external-ID and payload-hash unique indexes; no Lead/Prospect normalizer | Other-object normalizer tests only | None for Lead/Prospect | Prove duplicate staging rejection and unchanged source/local state; successful worker replay is separately limited below |

## Implementation evidence inspected

- `supabase/migrations/20260510120000_dms_legacy_sync_foundation.sql`: raw
  schemas, unique indexes, updated-at triggers, company SELECT policies.
- `20260511080000_rls_security_hardening.sql`: raw writes reserved to service role.
- `20260525200000_phase3f_lead_intake.sql`: `lead_followups`, feed/detail/add RPCs.
- `20260915090000_production_readiness_security.sql`: restrictive tenant and
  enabled-user policies, PostgREST pre-request gate, safe definer search paths,
  removal of anonymous function execution. Later migrations were searched for
  changes to these objects; none supersede the follow-up relationship checks.
- `src/services/leadIntakeService.ts`, its 8 mocked tests,
  `src/pages/sales/LeadIntake.tsx`, `LeadIntakeDetail.tsx`,
  `e2e/lead-intake.spec.ts`, `src/test/rls-matrix.spec.ts`, normalizer tests,
  disposable readiness script/config and CI.
- `supabase/functions/dms-sync-worker/index.ts`: staging skeleton; no
  Lead/Prospect canonical normalization or conversion command.

The supported relationship is `(company_id, source_kind, source_raw_id)`.
`source_raw_id` is the upstream observation UUID, resolved to the explicit
`dms_lead_id`/`dms_prospect_id`; customer and Sales Advisor names are not keys.
Progress, rating, intent, Booking evidence and source follow-up fields remain
opaque source payload evidence. This slice does not invent mappings or V2 columns.

## Authorization and compatibility limits

Lead Intake routes remain Manager-and-up (`src/main.tsx:272`). Backend feed,
detail and add RPCs currently accept a same-company enabled Profile or existing
global scope, without that route-role restriction. The tests use the current
seeded `creator_updater` / `self` actors to prove the supported server contract;
they do not approve a future Sales Advisor access policy. Employee responsibility
is not yet a follow-up column. Access-policy/Employee convergence remains future work.

The worker calls `upsert(rows, { ignoreDuplicates: true })` without a conflict
target. Mapped rows have no primary-key UUID. An identical supplied observation
therefore conflicts with the company/payload-hash or external-ID unique index,
not the default primary-key conflict target. This slice tests that database
duplicate rejection preserves the one source identity and local follow-up;
it does **not** claim successful end-to-end worker replay. Fixing worker replay
and changed-payload observation semantics requires a separate ingestion slice.

`LeadIntakeDetail.tsx` still labels its handoff “Convert to Sales Order” while
navigating to `/sales/deals/new?dmsCustomerId=...`. It does not establish canonical
FLC Case/source provenance. `NewDeal.tsx` and the legacy Deal lifecycle/migration
retain Lead-stage semantics conflicting with DMSv3. These belong to the later
FLC Case/Proton Retail Order slice and are unchanged.

## Reproduction, correction and validation

The first `npm run test:integration` rebuilt baseline migrations with the new
harness, before the correctness migration existed. All 211 existing cases and
20 new cases passed; 7 new cases failed (231 passed / 7 failed, 18 files).
Failures reproduced persisted direct-write acceptance of:

- A-company follow-ups referencing B-company Lead/Prospect raw UUIDs (2 cases);
- reattachment of authored A-company follow-ups to B-company source UUIDs (2);
- ghost or wrong-kind source relationships (2);
- a spoofed author on an otherwise valid same-company source (1).

Root cause: the RPC checked `(company, kind, raw UUID)` but direct INSERT/UPDATE
policies did not. The INSERT policy also omitted the author guard described in
its own comment. September's tenant gate protected the local row's company,
not the polymorphic source relationship.

`20261001010000_dms_lead_followup_source_boundary.sql` changes only those two
policies. INSERT retains the exact same-company rule and requires caller author
and an existing same-company source of the declared kind. UPDATE preserves the
original author/24-hour USING predicate and validates the corrected row's author,
window and source. Existing restrictive policies, grants, RPC signatures, source
schemas, global RPC access, service-role ingestion and valid local note edits
remain. No rows are backfilled or deleted; invalid historical links remain for
reviewed reconciliation. Reverting to the insecure predicates is not a safe
rollback; forward-fix any later policy convergence.

## Disposable acceptance coverage

`src/test/dms-lead-prospect-boundary.rls.spec.ts` adds **27 cases**, integrated in
the existing `vitest.rls.config.ts` and readiness script. Auth, PostgREST, RLS,
RPC and PostgreSQL are real; only service-role fixture seeding/cleanup is privileged.
The suite refuses to mutate a target outside the named disposable readiness stack.

| Requested proof | Evidence |
|---|---|
| A — Lead source unchanged | Authenticated follow-up create + author note correction; whole source-row value equality including raw/normalized payloads, IDs and timestamps |
| B — Prospect source unchanged | Same proof for linked Prospect; progress/rating/intent/Booking/source follow-up evidence remains in the unchanged payload |
| C — Direct Prospect valid | Explicit null and absent Lead relationships; real feed/detail queries; exact Lead population unchanged |
| D — Direct Prospect follow-up | Persisted source UUID/author/outcome/action; corrected local note retrieved; no Lead manufactured |
| E — Source mutation denied | Fully valid authenticated INSERT fails `42501`; same-company UPDATE/DELETE returns zero rows, and privileged snapshots prove the source still exists unchanged |
| F — Company isolation | B-company positive create/read; A exact-ID source/follow-up reads and follow-up UPDATE/DELETE see zero rows; foreign-company INSERT fails `42501`; feed/detail/add RPC reject foreign company |
| G — Source-ID bypass denied | RPC/direct INSERT/UPDATE reject B UUID under A company; same-company direct positive controls; ghost/wrong-kind and spoofed-author denials |
| H — Replay/read stability | Exact worker DB staging operation repeated without raw UUID; duplicate uniqueness rejection leaves one logical source and local follow-up intact; successful duplicate-ignore is also accepted if later implemented; repeated reads preserve distinct source identities with identical customer/name evidence |

After the migration, a fresh `npm run test:integration` passed **238/238 tests
across 18 files**, including all **27/27** new cases and all **211** existing cases.
The full migration chain rebuilt from zero, database lint reported no schema
errors, and all four catalog security audits passed (RLS, safe definer search
paths, anonymous execution, unscoped authenticated reads).

Affected service command:

```sh
npm test -- --run src/services/leadIntakeService.test.ts src/services/dmsService.test.ts src/services/reconciliationService.test.ts src/services/dealService.test.ts
```

Result: **42/42 tests across 4 files**, including 8 Lead Intake service tests.

CI-equivalent local baseline command:

```sh
VITE_SUPABASE_URL=https://example.supabase.co \
VITE_SUPABASE_ANON_KEY=ci_placeholder_anon_key_do_not_use_in_production \
VITE_HRMS_APP_URL=https://hrms.example.test \
npm run check:baseline
```

Result: **PASS**. Repository hygiene, zero-warning ESLint, all workspace
typechecks and architecture/RPC checks passed. Unit tests: **1,385 passed,
126 skipped; 202 files passed, 17 skipped**. Live cases intentionally skip in
the unit command and run separately above. Client service-role/edge security
checks passed; `npm audit --audit-level=low` reported **0 vulnerabilities**.
Main build and bundle budget, HRMS web build and HRMS mobile typecheck/build
all passed. `git diff --check` passed. Fetched main was checked again before
publication and still matched the baseline SHA.

The first baseline attempt without Supabase placeholders failed unit module
loading after passing lint/typechecks. The successful command above supplies
safe test values as CI does; no product fix or production credential was needed.
UI behavior is unchanged; no local browser validation is claimed. Final-head
CI includes the repository's standard Playwright job; its result is recorded
in the PR/completion report rather than asserted before execution here.

No production deployment or production data mutation was performed.
