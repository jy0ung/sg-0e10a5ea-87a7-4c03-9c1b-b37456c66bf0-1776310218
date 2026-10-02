# Sales Order normalizer decision and target guards — bounded evidence

Date: **2026-10-02, Asia/Kuala_Lumpur**. Refreshed main:
`6585773f0f530364fb04e7ca01dbd9d7b386d279` (accepted PR #130 squash).
No intervening main changes or overlapping DMS implementation PR were found.
This correction was independently accepted at `6666aefe6459790345fb530a80ce6600f6fdbcee`
and squash-merged in [PR #131](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/pull/131)
as `988526f36d07061946f1d4c450449ac725b1f4a2`, sole parent the implementation
baseline above; tree `b8d81683ddfeae6a9c38e2eca8e6f22f4ad2ca82` equals the
accepted head. [Actual merged-main CI](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/actions/runs/36977417028)
passed all six required checks: 363 live/zero skips, 1,393 unit passes/251 skips,
48 browser passes/two existing skips. Optional RLS Matrix executed no DB tests.
Phase 1 remains **partial**. The later
[Deal child boundary correction](DMSV3_DEAL_CHILD_BOUNDARY_EVIDENCE.md) is a
separate pending-review prerequisite; all NR/CP assertions and limits below remain.

[Forward migration](../supabase/migrations/20261002010000_dms_sales_order_normalizer_target_guards.sql)
replaces only `public.normalize_dms_sales_order(uuid) -> jsonb`, comment and
unchanged service-only grants. No applied SQL, table/index, type, lifecycle,
metric, policy, customer/vehicle normalizer or application/service code changes.
[Registered NR live suite](../src/test/dms-sales-order-normalizer-guards.rls.spec.ts)
adds 59 real cases. The [CP suite](../src/test/dms-case-ro-characterization.rls.spec.ts)
retains all 14 cases and strengthens only CP-08's obsolete ambiguous-success
expectation. All 304 baseline live scenarios remain, including LP49/DN30/CP14
and 13 existing normalizer cases; eight component witnesses remain.

## Evidence strength and red-before root cause

LIVE DB means real Auth, PostgREST and PostgreSQL over separate real clients on
a freshly reconstructed owned disposable stack. No RPC/database/network response
mocks, index removal, artificial uniqueness policy, skipped acceptance or source
fetches. Loopback endpoint port must equal the exact uniquely owned readiness
container's base+1 and Docker identity must match before fixtures can mutate.
All business evidence is synthetic; no production data was read or changed.

The unchanged function selected any approved raw/company match by priority
without object kind, source system or canonical-table validation. It used LIMIT 1
for text and allowed an explicit locally deleted target. Astra's 14 external
probes are supporting audit observations, not committed test acceptance.

Focused red-before uses the committed new regression assertions with `-t` against
`git archive 6585773f0f530364fb04e7ca01dbd9d7b386d279 supabase` in the owned runner
copy. It reconstructs the exact baseline migrations without the new migration.
Five selected product tests must fail; 54 deliberately unselected tests are
reported separately and are not claimed as executed live acceptance:

| Committed red witness | Before, unchanged main | After guard |
|---|---|---|
| `NR-02 customer-only cannot authorize SO normalization` | Normalizes SO and stamps customer evidence as SO | 42501; every persisted row/counter unchanged |
| `NR-02 higher-priority customer evidence cannot mask the explicit SO decision` | Updates the wrong SO named by customer evidence | Explicit approved SO wins; real Customer and its decision/history remain unchanged |
| `NR-03 unequal priorities active SO decisions fail cardinality without a winner` | Chooses priority 10 among two approved SO decisions | 21000; no writes |
| `NR-06 ambiguous own text plus foreign collision rejects with full candidate identities intact` | Picks one own candidate and stamps provenance | 21000; both candidates/source/decision/events/foreign rows unchanged |
| `NR-08 explicit soft-deleted target refuses fallback to matching live SO` | Updates the locally deleted explicit target | P0002; no fallback/no writes |

The customer-masking fixture uses an actual Customer whose UUID also exists as
a different SO UUID; table/object kind must determine authority. Its source
external ID is NULL and weaker text names the other SO, avoiding interference
from the retained company/external-ID uniqueness constraint. Both selected
and unselected SOs have populated protected local Customer relationships.
Full red before/after rows, response and changed table names are retained in
`red-manifest.json`; cleanup is asserted even when product assertions fail.

An initial green attempt found two bounded implementation/fixture issues: the
new denial text differed from an existing message assertion, and the first
customer-masking fixture would violate the retained external-ID index when the
correct SO was selected. The old denial message was preserved and the fixture
was corrected to use literal text evidence. This did not change a baseline test,
constraint or policy. Earlier logs remain alongside the final repetitions.

## Decision, target and error matrix

Every core qualifier is required: source company, source UUID, system `dms`,
object `sales_order`, raw table `dms_raw_sales_orders`, status accepted/auto_matched.
Count this set before validating canonical declaration. Priority, confidence,
UUID, timestamps and insertion order never select a business winner.

| Condition/tier | Result | Persisted effect |
|---|---|---|
| Missing raw source | P0002 | None |
| Zero qualifying approved decisions | 42501, existing denial message | None |
| More than one core decision, including malformed/redundant evidence | 21000 | None |
| One decision: table sales_orders, explicit or NULL ID; or NULL/NULL legacy unresolved | Allowed declaration | Continue |
| Wrong/empty/space-only canonical table; explicit UUID with NULL table | 22023 | None |
| Explicit UUID: absent/foreign/locally deleted | P0002; never weaker fallback | None |
| Explicit UUID: eligible own SO | Select explicit | Ignore lower-tier duplicates |
| No explicit: nonblank literal external ID, one eligible own SO | Select ID | Ignore lower-tier duplicate text |
| No explicit: multiple eligible external-ID candidates, if encountered | 21000 | None; existing uniqueness retained |
| No explicit/ID candidate: nonblank literal text, one eligible own SO | Select text | Foreign/deleted duplicates excluded |
| Multiple eligible same-company text candidates | 21000 | None |
| No eligible fallback candidate, including blank IDs/text | Exact existing unmatched JSON/reason | None |
| Successful UPDATE violates existing uniqueness | 23505; transaction rolls back | None; no fallback substitution |

Blank detection alone uses btrim. Matching uses the original nonblank value:
no trimming, case folding, LIKE/ILIKE, customer/name/phone/VSO identity or
cross-company folding. NULL/empty/space-only evidence cannot match equally blank
canonical columns; blank external ID still permits nonblank text fallback.
The existing unique company/external-ID index makes the >1 ID branch unreachable
in current valid fixtures; it is retained, tested and never dropped to force a
fixture. The defensive 21000 branch is not claimed as separately exercised.

## Committed NR-01–NR-12 coverage map

Names below are literal templates in the linked NR suite; `%s` expands to the
listed values. NR-09 is cross-cutting in every refused/unmatched case, not a
single count-only test. Success uses `success`/`verifySuccess`; refusal uses
`refused`; all read the complete `state` before/after real requests.

| Requirement | Committed test names / parameters | Concrete observed contract |
|---|---|---|
| NR-01 | `NR-01 typed explicit %s preserves exact success and local facts over duplicate text` (accepted, auto_matched); `NR-01 unresolved canonical table %s stamps only its approved decision` (sales_orders, NULL) | Exact normalized JSON, target/raw/match/event deltas. Explicit beats duplicated lower text. Local Customer FK, populated branch/date, notes/prices/deposit/loan and every other full SO field protected; NULL/NULL declaration compatibility retained. |
| NR-02 | `NR-02 %s cannot authorize SO normalization` (customer-only, vehicle-only, payment-only, non-DMS, wrong raw table/UUID, unapproved candidate/conflict/ignored/rejected); `NR-02 foreign-company approval cannot authorize own raw UUID`; `NR-02 higher-priority customer evidence cannot mask the explicit SO decision` | First 11 cases: 42501, zero changes. Coexisting real customer approval cannot mask valid SO approval; target company and all unrelated decisions/history/customer/foreign rows verified by full deltas. |
| NR-03 | `NR-03 %s active SO decisions fail cardinality without a winner` (unequal/equal priorities, duplicate unresolved, accepted plus auto_matched, resolved plus unresolved, one malformed) | Six 21000/full no-write cases. Core count precedes shape validation; no priority/redundancy winner. |
| NR-04 | `NR-04 explicit target with canonical table %s is malformed` (customers, vehicles, empty, spaces, NULL); `NR-04 unresolved wrong canonical table does not authorize fallback` | Six 22023/full no-write cases, even with existing SO UUID and matching fallback. Two-decision malformed case separately remains 21000 under NR-03. |
| NR-05 | `NR-05 exact %s selects own target and preserves foreign collisions` (external ID, text after absent ID, text after nonmatching ID); `NR-05 company external-ID uniqueness is retained; rejected duplicate insertion changes no rows`; `NR-05 normalization uniqueness violation rolls back rather than choosing another target` | Own exact target, unique ID over duplicate text, foreign colliding ID/text/customer evidence unchanged. Duplicate insert and normalization collision both 23505/full unchanged state; no constraint change. |
| NR-06 | `NR-06 ambiguous own text plus foreign collision rejects with full candidate identities intact`; `NR-06 %s text duplicate does not invalidate the one own live target` (soft-deleted, foreign) | 21000/full no-write ambiguity with recorded raw/decision/candidate/tenant UUIDs. One live own candidate succeeds despite deleted/foreign duplicates. CP-08 fixture independently retained below. |
| NR-07 | `NR-07 blank ID/text %s cannot match equally blank canonical evidence` (NULL, empty, spaces); `NR-07 blank external ID %s still allows usable exact text` (empty, spaces); `NR-07 nonblank %s uses literal equality without trimming, folding or patterns` (external ID, text) | Blanks return exact unmatched/full no-write; usable text succeeds. Near matches with trim/case/pattern differences return unmatched unchanged, then original literal including spaces/%/_ succeeds. |
| NR-08 | `NR-08 missing raw UUID returns P0002 with all owned state unchanged`; `NR-08 no approved decision returns 42501 and genuine no-target returns exact unmatched`; `NR-08 explicit %s target refuses fallback to matching live SO` (missing, foreign, soft-deleted) | Exact codes/data/reason, complete timestamps/payload/backlink/match/history unchanged. Invalid explicit never falls back to live matching text. Local deletion guard is not official RO KPI policy. |
| NR-09 | `refused` in all named negative/unmatched NR cases; `NR-10 revalidates %s after waiting for the existing row lock`; both NR-05 uniqueness cases; strengthened CP-08 | Complete SO/raw payload/hash/status/freshness/backlink/timestamps, every decision/history/event, Deals/activities, Accounts/Finance populations and counter rows compared. For deliberate barrier edits, expected full state differs only by that exact edited row/timestamp. Counts only verify snapshots are untruncated. |
| NR-10 | `NR-10 repeated successful calls retain one target and append one event each`; `NR-10 independent clients wait on the same raw lock and serialize two successful normalizations`; `NR-10 revalidates %s after waiting for the existing row lock` (decision status, explicit target deleted, explicit target company, text target deleted) | Replay/concurrent calls use same SO, no new SO/Case; exactly one correct event per success, preserved local values/other decisions/history. Two independent RPCs are observed waiting before barrier release. Post-wait decision rejection =>42501, explicit deletion/company change =>P0002, deleted fallback =>unmatched; complete state equals deliberate edit baseline. |
| NR-11 | `NR-11 catalog retains service-only SECURITY DEFINER and safe search_path without PUBLIC execution`; `NR-11 %s cannot execute a fully eligible normalization` (anonymous, active sales, active company_admin, inactive) | Real ordinary sessions denied 42501 without writes; no PUBLIC/anon/authenticated grant, service-role grant and safe search_path retained. Inactive profile restored in finally. Exact owned fixture/auth/counter cleanup asserted. Four global catalog audits retained. |
| NR-12 | `CP-08 CORRECTED GUARD ambiguous same-company text fallback rejects without changing candidates or foreign collisions`; unchanged remaining CP, LP, DN, existing normalizer and component suites | Same CP candidate/source/match/foreign/local-Deal fixture; 21000, null data, all 20 business tables/counters unchanged. Historical arbitrary-success reproduction remains in the CP report; all other known-gap witnesses stay unchanged. Dedicated report/SOT/register/RLS mapping updated; no target programme completion claim. |

## Preservation, transaction locks and supported concurrency

Success overwrites only the original four DMS references and sync timestamp;
original branch/date if-null assignments remain unchanged. Current schema requires
populated branch/date, so tests preserve populated values and do not relax
constraints to manufacture NULL fixtures. Original local notes, stage/vehicle/
Customer relationships and other commercial fields are never assigned. Existing
payload/hash/status/freshness remain exactly equal, with only raw backlink/update
timestamp changing. Only the selected unresolved SO decision is stamped; already
resolved and unrelated decisions/history remain equal. One existing-shape event
is appended per success; repeated calls deliberately append again.

Raw row FOR UPDATE serializes this function for one source and reloads changed
raw facts after a wait. Approved core rows and eligible target candidate sets
are selected with FOR UPDATE before cardinality evaluation; existing row
predicates are rechecked after waits. UUID sorting orders locks only; an array of
the complete qualifying set determines zero/one/many, with no unchecked separate
count followed by arbitrary LIMIT. The sole decision and selected target remain
locked through the write. Any exception rolls back the entire RPC transaction.

Tests use an owned interactive psql transaction and observable
`pg_stat_activity` / `pg_blocking_pids` wait chains to coordinate two real clients
and deliberate existing-row changes. Bounded condition polling yields for network
I/O; arbitrary sleeps cannot decide whether a race happened. Barriers close and
RPCs settle in finally. Revalidation compares the full pre-call state with only
the explicitly edited blocker row replaced, including its persisted timestamp.

This does **not** globally serialize arbitrary privileged new decision/candidate
inserts, excluded-to-eligible retargets or all other reconciliation writers.
Candidate-set locks cover existing rows visible/qualifying to that statement;
phantoms/direct-writer races require a separate writer contract. No table-wide
lock, global constraint, conflict queue or reconciliation-history redesign is
introduced. Repeat normalized events are not exactly-once ingestion-worker or
Case-command/link idempotency evidence.

## Validation and reproducibility

Artifacts: `/home/flitadmin/.codex/artifacts/dmsv3-normalizer-implementation-2026-10-02/`.
Assertions remain executable without artifacts or optional manifest output.

- `npm ci`: PASS; 963 packages added, 976 audited, zero vulnerabilities.
- Affected tests with CI-safe Supabase placeholders: `npm test -- src/pages/sales/CaseCreationCompatibility.test.tsx src/services/dealService.test.ts src/services/leadIntakeService.test.ts src/services/salesOrderService.test.ts`: **57 passed, five files, zero skips**. Eight existing actual-component cases retained; service response mocks here are separate from NR live database evidence.
- Red runner `READINESS_PORT_BASE=58420 NR_EVIDENCE_FILE=<artifacts>/red-manifest.json bash <artifacts>/run-red.sh`: five expected product failures against archived baseline; 54 unselected, no fixture failures. Logs/manifests preserve exact unsafe writes and cleanup.
- Green runner `READINESS_PORT_BASE=58440 NR_EVIDENCE_FILE=<artifacts>/green-manifest.json CP_EVIDENCE_FILE=<artifacts>/green-cp-manifest.json bash <artifacts>/run-focused.sh`: **86 passed, three files, zero skips** = NR59 + CP14 + existing normalizer13. DB lint and all four catalog audits passed; exact fixture cleanup and owned no-backup destruction verified.
- Required full gate uses `RLS_E2E=0 VITE_SUPABASE_URL=https://ci-placeholder.supabase.co VITE_SUPABASE_ANON_KEY=ci_placeholder_anon_key_do_not_use_in_production VITE_HRMS_APP_URL=https://hrms.example.test READINESS_PORT_BASE=58460 NR_EVIDENCE_FILE=<artifacts>/live-manifest.json CP_EVIDENCE_FILE=<artifacts>/live-cp-manifest.json npm run check:production-readiness`. **PASS**: repository hygiene, ESLint, four app/Node/HRMS TypeScript projects plus recovery-service typecheck, RPC/architecture checks, service-role/edge security, npm audit (zero vulnerabilities), UBS/HRMS web/mobile builds and bundle budget. Units: **1,393 passed / 251 skipped**, 203 passed / 20 skipped files; unchanged baseline 192 unit-mode skips plus 59 new live-only unit-mode skips. Fresh migrations, DB lint and four catalog audits passed. Expanded live: **363 passed, 21 files, zero skips** = 304 retained + NR59; LP49/DN30/CP14 and existing normalizer13 retained. One complete full gate ran; no broad repetition after its pass.
- Final head / required CI links and actual counts are recorded after commit in the PR description and `ASTRA_REVIEW_HANDOFF.md`; a commit cannot contain its own SHA. Optional RLS Matrix skips/credential-only success are not executed DB evidence. Unit-mode skips of live specs are separate from the zero-skip full live run.

Runner copies retain fresh reconstruction, DB lint, four catalog audits and
`--no-backup` destruction of only their owned project/workdir. Test cleanup
resolves rows solely within newly created tenants, deletes exact owned IDs in
FK order, checks empty rereads, removes exact owned Auth users and asserts
counter cascade. NR cleanup verified seven owned tenants in red and 72 in each green/full run; green/full removed three owned Auth users (red created none). CP independently verified its 17 owned tenants/users. `cleanup-proof.json` confirms no task containers, volumes or temporary workdirs for bases 58420/58440/58460 remain. Cleanup errors fail visibly; no shared stack is stopped.

## Operational impact and unchanged limits

Privileged calls formerly succeeding by untyped evidence, priority/text winners,
blank identity or deleted explicit targets are intentionally refused. Operator
reconciliation is required; no automatic repair/backfill/decision-status cleanup
or population of newly refused production requests is claimed. The repository
has no application caller to update for this RPC; public signature/generated
return type and successful/unmatched shapes remain compatible. Existing denial
message and uniqueness rollback remain compatible with baseline assertions.

[Ownership](DMSv3%20Refactor%20Plan/04_SOURCE_OF_TRUTH_AND_OWNERSHIP.md),
[phase plan](DMSv3%20Refactor%20Plan/06_MIGRATION_AND_CUTOVER_PLAN.md),
[evidence register](DMSv3%20Refactor%20Plan/07_EVIDENCE_REGISTER.md),
[RLS matrix](RLS_MATRIX.md) and [historical CP evidence](DMSV3_CASE_RO_CHARACTERIZATION_EVIDENCE.md)
record this bounded protection separately from Case/official-source work.

Preserved limits: deposits 0/500 still create legacy lead; NewDeal source/default/
document behavior; separate number/Deal/activity requests, gaps/GEN fallback,
literal company/label/YY-MM allocator namespace, direct writers outside its
guarantee, retained counter state and forward correction; no typed Case→RO link;
legacy dashboard missing upper month bound and distinct populations; official
identifier/date/status/codebook/freshness/Master RO parity unverified; successful
worker replay distinct from privileged replay and duplicate staging rejection;
route/backend convergence and Employee responsibility; same-company follow-up
reattachment and created_at rewriting, so neither immutable history nor a fixed
24-hour correction window. Other normalizers and global reconciliation history/
concurrency are not certified.

SOT 08 §§4,11,33,35 deposit operations, Case creator/scope/documents/exceptional
initiation/waiting-RO, official Deleted/cancelled/replaced/rebooked/gross-net/
effective-date inclusion and DMS creator/UBS attester/maker-checker remain OPEN.
Optional deposit for Case existence remains confirmed. Local SO deletion is a
storage eligibility guard, not an official-Proton inclusion decision. Phase 1 is
partial; no Phase 2/3 completion, official KPI, production acceptance, issue closure,
programme comment, deployment or merge is part of this correction.
