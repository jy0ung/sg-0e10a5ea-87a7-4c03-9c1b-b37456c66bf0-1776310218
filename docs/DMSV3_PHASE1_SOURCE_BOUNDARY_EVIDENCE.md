# DMSv3 Phase 1A — Lead/Prospect source boundary evidence

Date: 2026-10-01. Main baseline: `e7445670bacfeedd0708368ec5ba8b917ea8134d`.
[PR #128](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/pull/128)
is a **partial Phase 1 checkpoint**, limited to the source/local-follow-up
boundary. It does not complete the Phase 1 programme. The correction round
refreshed live main and PR state: main still matched the baseline and the
reviewed PR head was `31072bf4608da46aa443e2896f6dfa6216fc452c`; the checkout
was clean and no other open PR overlapped this area. Read the DMSv3 README,
reconstructed baseline and relevant contracts in files 01, 03–08, plus
`.ai/PROJECT_CONTEXT.md` before edits.

Execution links: [Phase 1 plan](DMSv3%20Refactor%20Plan/06_MIGRATION_AND_CUTOVER_PLAN.md#3-phase-1--current-behavior-regression-harness)
and [evidence register](DMSv3%20Refactor%20Plan/07_EVIDENCE_REGISTER.md#dmsv3-phase-1a-source-boundary-checkpoint--pr-128).

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

Governed source: [current workflow §1](DMSv3%20Refactor%20Plan/01_CURRENT_WORKFLOW.md),
[Lead/Prospect rules §2](DMSv3%20Refactor%20Plan/03_BUSINESS_RULES_AND_CONTROLS.md#2-lead--prospect-rules)
and [ownership §§2–3](DMSv3%20Refactor%20Plan/04_SOURCE_OF_TRUTH_AND_OWNERSHIP.md#2-domain-ownership-matrix)
establish DMS-owned source facts, optional Lead and UBS-local follow-up. LP-01,
03–05 and 10 prove that boundary. LP-02 and 06–09 characterize the current
source identity, tenant, RPC and local aggregation implementation without
settling the open access/Employee policies or wider Prospect SLA rules.

## Authorization and compatibility limits

Lead Intake routes remain Manager-and-up (`src/main.tsx:272`). Backend feed,
detail and add RPCs currently accept a same-company enabled Profile or existing
global scope, without that route-role restriction. LP acceptance uses suite-owned
`manager` / `company` actors. The original seeded `creator_updater` / `self`
cases remain server compatibility evidence; neither set approves a future Sales
Advisor access policy. Employee responsibility is not yet a follow-up column.
Route/backend access convergence and Employee responsibility remain separate work.

The worker calls `upsert(rows, { ignoreDuplicates: true })` without a conflict
target. Mapped rows have no primary-key UUID. An identical supplied observation
therefore conflicts with the company/payload-hash or external-ID unique index,
not the default primary-key conflict target. This slice tests that database
duplicate rejection (`23505`) preserves the one source identity and local follow-up;
it does **not** claim successful end-to-end worker replay. Fixing worker replay
and changed-payload observation semantics requires a separate ingestion slice.
LP-10 instead proves a successful privileged fixture refresh on the **same raw
UUID**. It does not call the worker, exercise ingestion credentials or claim
successful worker replay.

`LeadIntakeDetail.tsx` still labels its handoff “Convert to Sales Order” while
navigating to `/sales/deals/new?dmsCustomerId=...`. It does not establish canonical
FLC Case/source provenance. `NewDeal.tsx` and the legacy Deal lifecycle/migration
retain Lead-stage semantics conflicting with DMSv3. These belong to the later
FLC Case/Proton Retail Order slice and are unchanged.

The local-history limitation also remains separate work. The original author/time
UPDATE predicate and new-row source check do **not** compare old/new source
identity or protect `created_at`. An author can still reattach a note to another
valid same-company source and rewrite its creation timestamp (the independent
review reproduced a same-company Prospect reattachment and `created_at` set to
2099). Consequently, the nominal 24-hour condition does not guarantee immutable
history or a fixed correction window. This predates PR #128; no history-control
redesign is included. Future history work must govern source identity, timestamp
immutability and auditable correction, rather than treating the current predicate
as that guarantee. Reviewer probes support this limitation; they do not replace
the committed LP regression assertions below.

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
original author/time USING predicate and validates the corrected row's author,
time condition and source, subject to the history limitation above. Existing
restrictive policies, grants, RPC signatures, source
schemas, global RPC access, service-role ingestion and valid local note edits
remain. No rows are backfilled or deleted; invalid historical links remain for
reviewed reconciliation. Reverting to the insecure predicates is not a safe
rollback; forward-fix any later policy convergence.

## Committed LP-01–LP-10 acceptance coverage

[src/test/dms-lead-prospect-boundary.rls.spec.ts](../src/test/dms-lead-prospect-boundary.rls.spec.ts)
contains **49 cases**: all 27 reviewed cases retained, plus 22 cases with searchable
`[LP-xx]` names. It remains registered in `vitest.rls.config.ts` and the existing
readiness script. Auth, PostgREST, RLS, RPC and PostgreSQL are real. Service role is
used only for synthetic setup, refresh, timestamp fixtures, verification and
cleanup; PostgreSQL provides the date oracle. The suite rejects a target outside
the named disposable readiness stack before mutations. Manager accounts/tenants
and deactivation fixtures are suite-owned; existing seeded actors are not deactivated.

| Requirement | Concrete committed assertions |
|---|---|
| LP-01 — Direct Prospect independent of Lead | Two `[LP-01]` cases, null/absent Lead reference, each in its own tenant with **zero Leads and Deals**. Exact feed/detail kind, raw UUID, external ID, source status/timestamps and empty follow-ups; full source equality and business population equality after reads. Original Direct Prospect cases also retained. |
| LP-02 — Tenant source isolation | Two `[LP-02]` cases, both kinds, identical external IDs in A/B. Populated own-company raw/feed/detail controls; foreign raw hidden; forged-company feed/detail denied; **own-company argument + foreign raw UUID returns empty detail**; both tenant source/follow-up snapshots unchanged. Original foreign follow-up read/update/delete and INSERT/RPC cases retained. |
| LP-03 — Authenticated source writes denied | Two `[LP-03]` manager cases plus six original ordinary-user CRUD cases. Fully valid source INSERT fails `42501`; UPDATE/DELETE return zero affected rows; privileged full-row snapshots prove survival and unchanged values. Manager snapshots also prove INSERT created no source. Both kinds. |
| LP-04 — Persisted local authorship and aggregation | `[LP-04]` manager Direct Prospect RPC persists exact company/kind/raw UUID, caller author, notes/outcome/date. Detail equals the full persisted note; feed count/latest timestamp/outcome/next action are exact. Entire source and business population unchanged. Original Lead, linked/Direct Prospect create/correct cases remain. |
| LP-05 — Local outcomes preserve source/business boundaries | Four `[LP-05]` cases, `converted` and `lost` on each kind. Exact persisted author/source/outcome and feed/detail values; entire source equality preserves progress/rating/intent/Booking/source follow-up facts; scoped commercial/RO/financial counts and IDs unchanged. |
| LP-06 — Rejected commands preserve state | Two `[LP-06]` cases, each with six rejected calls: foreign company, foreign UUID under own company, nonexistent UUID, invalid kind, empty notes and space-only notes. Authorized populated control; expected RPC error and null result; **both tenants' complete source/follow-up state and business IDs/counts equal before/after every rejection**. Original direct-DML ghost/wrong-kind/foreign attachment and spoofed-author denials remain. |
| LP-07 — Deterministic follow-up projection and priority | Two `[LP-07]` cases, both kinds. PostgreSQL yesterday/today/tomorrow, distinct note timestamps and source dates; exact latest timestamp/outcome/date and count (including zero/null). Five-row exact order proves strictly-before-today priority, then never-contacted, then scheduled; older overdue note superseded by newer scheduled note. Detail returns both notes newest first; all source facts unchanged. This is feed priority, not Prospect SLA classification. |
| LP-08 — Equal raw UUIDs partition by kind/tenant | `[LP-08]` has equal Lead/Prospect UUIDs in each of two tenants, same external ID, and 1/2/3/4 real notes. Each tenant's feed contains exactly its two source kinds and correct counts; details contain exact note ID sets, author and company/kind/raw UUID. Own-company/foreign-UUID detail is empty for both kinds; full state unchanged after reads. A table PK cannot repeat across tenants within that table, so each tenant has a distinct UUID repeated across kinds. |
| LP-09 — Anonymous and deactivated-session denial | Four `[LP-09]` cases, both kinds × anonymous/inactive. Real manager feed/detail/add controls first; all **three** RPCs denied to anonymous and to the same previously authenticated session after Profile deactivation; full persisted boundary state unchanged after each call. Inactive cases also compare business populations and restore only their owned Profile in `finally`. |
| LP-10 — Successful same-UUID source refresh | Two `[LP-10]` cases, both kinds. Privileged fixture UPDATE succeeds on existing company/raw UUID, changes source status/customer/payload/fetched timestamp, preserves one external identity, and exposes new facts in feed/detail. Exact full local note equality, attachment, count/latest/outcome/date survive; business IDs/counts unchanged. Separate from duplicate staging rejection and worker replay. |

The no-side-effect snapshot uses exact tenant-scoped IDs/counts for `dms_raw_leads`,
`deals`, `deal_activities`, `deal_loan`, `deal_insurance`, `deal_registration`,
`sales_orders`, `dms_raw_sales_orders`, `customers`, `invoices`, `dealer_invoices`,
`payment_events`, `supplier_payment_events`, `official_receipts`, `purchase_invoices`
and `journal_entries`. These assertions cover the commands and current populations
listed; they do not claim later Case/RO ingestion or lifecycle acceptance.

Two original duplicate-staging **rejection** cases retain the worker's current
database operation (no raw UUID/default conflict target), assert `23505`, one source
identity and unchanged local notes. Source refresh succeeds in LP-10; successful
end-to-end worker replay remains unimplemented and unclaimed. Original repeated
reads also preserve distinct source identities despite identical display names.

## Validation records

### Reviewed checkpoint (historical, head `31072bf`)

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

### Correction-round validation

The expanded harness passed on two newly reconstructed disposable stacks after
the final timestamp assertions were added. Historical counts above and external
reviewer probes are not acceptance for this revision.

- `npm ci`: **PASS**, 963 packages installed, 976 audited, **0 vulnerabilities**;
  the lockfile and dependencies are unchanged.
- Affected service command shown above, with the safe inputs below and `RLS_E2E=0`:
  **42/42 passed across 4 files**, including 8 Lead Intake cases.
- Full repository and disposable gate:

  ```sh
  RLS_E2E=0 \
  VITE_SUPABASE_URL=https://ci-placeholder.supabase.co \
  VITE_SUPABASE_ANON_KEY=ci_placeholder_anon_key_do_not_use_in_production \
  VITE_HRMS_APP_URL=https://hrms.example.test \
  npm run check:production-readiness
  ```

  **PASS**: hygiene, zero-warning ESLint, all workspace TypeScript projects
  (including recovery service), RPC/architecture checks, client service-role and
  edge security checks, audit **0 vulnerabilities**, main build/bundle budget and
  HRMS web/mobile builds. Unit tests: **1,385 passed / 148 skipped; 202 files
  passed / 17 skipped**. Those skips include the live suites, which are executed
  by the following integration stage: **260/260 passed, 18 files, no skips**,
  including **49/49 boundary cases** and all **211** preexisting baseline cases.
- Separate command `READINESS_PORT_BASE=56420 npm run test:integration`:
  **260/260 passed, 18 files, no skips**, also including **49/49** boundary cases.
  Both stacks rebuilt the complete migration chain from zero, found no schema
  lint errors and passed all four catalog audits. Each runner destroyed only its
  own temporary stack/volumes without preserving a database backup.
- `git diff --check`: **PASS**. Evidence/SOT relative file links resolve. Main was
  fetched again and remained `e7445670bacfeedd0708368ec5ba8b917ea8134d`.

The first correction-round run had **258 passed / 2 failed**: the new LP-07
fixtures used outcome labels outside the existing CHECK constraint. The fixtures
were corrected to distinct permitted outcomes; no business policy or runtime
change was needed. Subsequent runs passed, including the final assertions above.

Exact final head and final-head CI run/results are recorded in PR #128's updated
description and the Astra review handoff after publication. The required CI jobs
must execute on that head; a skipped optional RLS Matrix job is not database
acceptance evidence. No new local browser run or live Lead Intake browser flow
is claimed by this backend slice.

No production deployment or production data mutation was performed. PR #128 must
return to Astra for independent review before any separately authorized merge.
