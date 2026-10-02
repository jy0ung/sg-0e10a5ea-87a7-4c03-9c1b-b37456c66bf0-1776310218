# DMSv3 Phase 1C — local Deal, deposit, legacy SO and raw RO characterization

Date: 2026-10-01. Refreshed baseline: `730f900533ad207dd44c40297e911e7f860072b5`
(independently accepted PR #129 squash; parent PR #128 squash
`2d744dbbc16410a7762abf7bcb16974b000590d6`). No intervening main changes were found.
This historical **partial Phase 1 characterization** was independently accepted
at `c713fb2d0fb29fcae5e2905a264dba6f8793ebc3` and squash-merged in
[PR #130](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/pull/130)
as `6585773f0f530364fb04e7ca01dbd9d7b386d279` (2026-10-02 Asia/Kuala_Lumpur).
Parent: `730f900533ad207dd44c40297e911e7f860072b5`; squash tree
`16b08daec7e5a4b68eff51c44d7af608e1e90837` equals the accepted head.
[Actual merged-main CI](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/actions/runs/36933800523)
passed all six required jobs: 304 live, 1,393 unit passes / 192 skips,
48 browser passes / two existing skips. Optional RLS Matrix tested no database.
The original slice changed tests and evidence only. Phase 2/3, official Booking cutover,
production acceptance, #48 and production reconciliation in #94 remain incomplete.

## Later bounded correction — CP-08 only

The [Sales Order normalizer correction](DMSV3_SALES_ORDER_NORMALIZER_EVIDENCE.md)
adds a forward function guard on that merged baseline. The historical arbitrary
text selection remains a reproduced defect of PR #130; its committed CP-08
fixture is now strengthened to require **21000 and full unchanged state**.
Both own candidate UUIDs, foreign SO/raw UUIDs, approved decision, two real
local Deals/activities/counters and all 20 business tables remain in the witness.
No other CP scenario is removed or reinterpreted; all 14 live and eight component
cases remain. Stage, front-door, month/population and Case-provenance gaps below
still describe current behavior. This correction is pending Astra review.

## Evidence strength and reproducibility

- **LIVE DB:** [registered characterization suite](../src/test/dms-case-ro-characterization.rls.spec.ts),
  14 executable cases on freshly reconstructed migrations. Actual Auth,
  PostgREST, RPC/RLS and PostgreSQL; unchanged TypeScript `createDeal` and
  dashboard service. A test-only client export supplies an actual authenticated
  client; RPC/from/network/row responses are never mocked. The active fixture
  is manager/company scope, not approval of a production Case creator policy.
- **COMPONENT/MOCKED:** [eight compatibility tests](../src/pages/sales/CaseCreationCompatibility.test.tsx)
  execute actual NewDeal, LeadIntakeDetail, SalesDashboard and MemoryRouter,
  mocking service responses and actor/hooks only. These are component/router
  evidence, not browser-to-database E2E. Live creation is independently covered.
- **STATIC / LIVE CATALOG:** effective SQL, current service/page code and applied
  migration mapping identify absent typed Case provenance and the historical
  fallback's `LIMIT 1`. Catalog assertions execute against the reconstructed database.
- **OPEN POLICY:** the owner decisions below are retained, not implemented.

Run `npm ci`, then the affected tests below and
`npm run check:production-readiness` with safe test inputs. The existing runner
creates a unique `ubs-readiness-<port>-<run>` project, reconstructs all migrations,
and executes every registered live file. The new suite checks exact container
identity and matching loopback API port before creating owned tenants. DB
dates come from PostgreSQL, not a frozen browser clock. Its full-row snapshots
include all 17 DN tables plus `purchase_orders`, reconciliation matches and
events (20 business tables), and separately inspect private allocator state.
Neither counts alone nor omitted retained columns are used as a side-effect oracle.

The fixture manifest uses separate arrays for local Deal UUIDs, raw observation
UUIDs and legacy SO UUIDs. It prints these and can write synthetic evidence with
`CP_EVIDENCE_FILE`; assertions do not depend on that optional file. Exact owned
row IDs are deleted in dependency order, errors fail the suite, empty rows and
counter cascade are verified, inactive profiles are restored in `finally`, and
the runner destroys its stack with `--no-backup`. No shared stack is stopped.

## CP-01–CP-10 committed assertion map

Test names below are literal names in the linked suites; parameterized cases
expand to the values shown. `twoRealDeals` and `normalizeAndVerify` execute
real operations and verify their full before/after rows in each calling test.

| Contract | Evidence and committed test names | Concrete assertion |
|---|---|---|
| CP-01 | LIVE DB: `CP-01/02 real createDeal preserves distinct identities and deposit inputs without money, source or dashboard creation` | Empty owned tenant, no branch, identical customer evidence, deposits 0/500, two UUIDs and GEN numbers 001/002; exact creator/company/input/total, one activity each, full authenticated rereads; no canonical customer/VSO/source identity manufactured. Both stages are legacy `lead`, a known gap. |
| CP-02 | Same LIVE DB case and `twoRealDeals` used in source/denial cases | Per creation, only one Deal, one activity and expected private counter advancement change; all other full business rows remain equal. Dashboard RPC and real TS service remain exactly 0 orders/value. Numeric deposit creates no receipt/payment/journal/source/SO. |
| CP-03 | COMPONENT/MOCKED: `CP-03 standalone deposit 0 preserves vehicle prefill, actor binding, input and UUID navigation` and deposit `500`; `CP-03 KNOWN GAP lead conversion deposit 0 carries only repeated customer ID and ignores raw origin`, with lead/prospect × 0/500; `CP-03 KNOWN GAP minimal standalone form accepts no documents, defaults auto_aging and permits absent Employee` | Actual form and navigation; exact complete service arguments, company/Profile/Employee or null, name/email fallback, input and vehicle prefill, returned UUID route. Distinct Lead/Prospect raw UUIDs share customer/external evidence; the action passes only customer ID and NewDeal submits no source/canonical link. Minimal input submits without documents; unconditional `auto_aging` is characterized, not approved. |
| CP-04 | LIVE DB: `CP-04/06/07 three populations stay separate; cross-month raw-to-SO normalization and privileged replay retain local Deals`; COMPONENT/MOCKED: `CP-04 legacy dashboard labels its fixture population MTD Orders` | Exact Deal/raw/SO manifests and persisted authenticated rows; dashboard sequence 0→0→1/100→2/300. Manual SO has no DMS IDs/match. Second SO has an explicit accepted source association. Actual label is MTD Orders; no official count is inferred. |
| CP-05 | LIVE DB: `CP-05 KNOWN GAP missing month upper bound and distinct branch/trend predicates remain tenant scoped` | DB-derived prior last day/current first day/next first day, deleted row, A/B branches, foreign colliding order/RO evidence. Exact all/branch/absent/foreign summary objects and full unchanged state; own-company argument plus foreign UUID reads expose no SO/raw row. |
| CP-06 | LIVE DB: CP-04/06/07 case | Previous-month source order date versus populated current-month SO booking date; identity/status/freshness/payload/hash retained, exact DMS field/backlink changes, all local/commercial fields retained. Actual full dashboard summary unchanged. `created_at` is not used as a business date. |
| CP-07 | Same LIVE DB case; `CP-07 LIVE CATALOG KNOWN GAP Deals have no typed raw-origin columns or deal_source_links relationship`; STATIC applied migration and normalizer code below | Explicit company-qualified match; two privileged calls target the same SO, each adds one exact normalized event; allowed sync/update timestamps are checked while every other row remains equal. Existing Deal UUIDs/numbers/notes/activities remain full-row equal. Catalog lacks typed source columns/FKs and `deal_source_links`. |
| CP-08 | LIVE DB: `CP-08 no accepted reconciliation rejects privileged normalization and retains every business row`; `CP-08 accepted source without existing target returns unmatched without manufacturing SO or Case`; `CP-08 CORRECTED GUARD ambiguous same-company text fallback rejects without changing candidates or foreign collisions`; `CP-08 external ID fallback selects actual own-company SO despite identical foreign identifiers and customer evidence` | Rejection 42501 and exact unchanged full state; exact unmatched result with no writes/events; originally two same-company text candidates with absent raw external ID returned one by set membership. The later correction retains these fixtures and requires 21000, null data and full unchanged state, including every candidate, foreign row, source/match/event and local Deal/counter. External-ID success still checks actual selected company and complete deltas. |
| CP-09 | LIVE DB: `CP-09 active ordinary session cannot normalize; active dashboard remains scoped with unchanged full business state`; anonymous/inactive variants with `dashboard is denied`; `CP-09 anonymous allocator and actual createDeal reject writes without advancing any owned state`, with inactive/cross-company variants | Ordinary normalizer denied 42501; anonymous/inactive dashboards denied 42501; anonymous/inactive/cross-company allocator and unchanged actual service reject creation. Full business/counter state remains equal after each request. Successful normalization is explicitly privileged; cleanup and profile restoration are asserted. CP-05 separately proves regular-session cross-company read isolation. |
| CP-10 | This report; SOT [06](DMSv3%20Refactor%20Plan/06_MIGRATION_AND_CUTOVER_PLAN.md), [07](DMSv3%20Refactor%20Plan/07_EVIDENCE_REGISTER.md), [08](DMSv3%20Refactor%20Plan/08_OPEN_POLICY_DECISIONS.md) | Coverage, populations, current/gap/policy labels, commands/counts and limits are recorded. Exact published head/CI are recorded after commit in the PR description and `ASTRA_REVIEW_HANDOFF.md`; a commit cannot embed its own SHA. |

## Population and identity witnesses

| Population | Identity/date evidence | Observed result; authority limit |
|---|---|---|
| Local Deal compatibility | Local UUID and `DEAL/GEN/YY/MM/001` or `/002`, identical customer, deposits 0/500 | Two rows, each `lead`, one `deal_created` activity; 0 MTD Orders. UUID is distinct from the display number and official identity. No direct-DML PK immutability/full command idempotency is proved. |
| Raw RO-shaped observation | Raw UUID, company, `dms_so_no_id`, `dms_so_no`, source `order_date/status`, payload/hash and `fetched_at` | Raw-only observation leaves headline 0. Synthetic staging evidence is not production Master RO parity or governed official eligibility. |
| Manual legacy SO | Separate UUID, local `order_no`, current-month local `booking_date`, selling price 100, null DMS IDs, no match | Headline 1/value 100, despite no accepted source identity. Privileged fixture insertion is setup, not permission to add an application creation path. |
| Explicitly associated legacy SO | Separate UUID, price 200, current-month local booking date; accepted raw previous-month business date | Headline 2/value 300 before and after normalization. Raw backlink/match identify an SO, not an existing local Deal. Two normalized audit events after replay; no additional Deal/SO. |

CP-05 creates prices 100 (current A), 200 (current B), 300 (next month A),
400 (previous-month last day A), 500 (deleted current B), and 999 (foreign).
The headline is exactly **3 / 600**, A **2 / 400**, B **1 / 200**, absent
branch and foreign-company request **0 / 0**. All-time branch breakdown is
A=3/B=1; trend is previous=1/current=2/next=1. Prior/deleted/foreign rows do not
enter the headline; next-month does. This is a reproduction of missing upper
date bound, not a new MTD definition or an approved official gross/net count.

## Provenance and known gaps

- **KNOWN GAP — stage semantics:** current `createDeal` always persists `lead`
  for both deposits. Target no-deposit Booking/Case rule remains in SOT 03 §4
  and 05 §43; passing characterization does not accept the legacy mapping.
- **KNOWN GAP — front door:** actual LeadIntake action sends only
  `dmsCustomerId`; actual NewDeal ignores it, submits manual customer facts,
  defaults `auto_aging` even standalone, and has no enforced document checklist.
  Repeated customer IDs are not unique Lead/Prospect origins. SOT 08 §11 remains open.
- **KNOWN GAP — population/month:** effective
  [dashboard SQL](../supabase/migrations/20260511060000_sales_pipeline_foundation_fix.sql)
  counts nondeleted legacy SOs using only a lower local-booking-date bound;
  current hardening makes it SECURITY INVOKER. There is no official-source
  eligibility filter. Branch and trend use different predicates. SOT 02 Booking
  MTD / Cases Created and 05 §47 govern future parity, not this compatibility KPI.
- **KNOWN GAP — typed Case provenance:** catalog has no `deal_source_links`
  or typed raw-origin Deal columns/FKs. Existing accepted raw→SO backlink/match
  does not identify a Case. Target SOT 04 §7 and 05 §7 remain unimplemented.
- **HISTORICAL GAP, now guarded — ambiguous fallback:** the PR #130
  [normalizer](../supabase/migrations/20260511010000_normalize_dms_sales_order.sql)
  uses company-qualified ID/text lookups with `LIMIT 1` and no uniqueness/tie
  resolution for duplicated text. Historical CP-08 asserted candidate membership
  and actual company. The later forward function correction rejects ambiguity
  before writing; current CP-08 asserts 21000 and full unchanged state. No new
  constraint, candidate winner, conflict queue or historical repair is added.
- **KNOWN GAP — complete command:** number reservation, Deal insert and activity
  are separate requests. Atomic allocator acceptance is not atomic/idempotent
  Case creation, event/outbox or Case-source-link idempotency.

STATIC historical lineage:
[applied legacy migration](../supabase/migrations/20260621010000_deal_legacy_migration.sql)
copied `sales_orders.id` to `deals.id`, retained VSO/local display fields, mapped
“New without Deposit” to `lead` and “New with Deposit” to `booking`, and copied
order/VSO/DMS/status/date into activity metadata. Later migration joins on VSO
text are legacy evidence, not a current validated company-qualified Case→RO
relationship. The migration was inspected, never replayed or amended. No link
is inferred from a copied UUID, name, phone, customer, deposit, date or DMS text.

## Still-open policy versus source verification

| SOT decision | What remains OPEN; future work it blocks |
|---|---|
| 08 §4 | Payment-type deposit operating expectations, minimum/waiver/refund/forfeiture/transfer/approval/receipt treatment: blocks governed deposit/Accounts commands. **Optional deposit for Case existence is already confirmed**, not reopened. |
| 08 §11 | Creator capability/scope, sufficient information/documents, exceptional initiation without DMS Prospect, waiting-RO deadline/escalation: blocks the authoritative create-Case command/front-door cutover. Manager fixture behavior does not decide these. |
| 08 §33 | Cancelled/deleted/replaced/rebooked RO inclusion, gross/net headline and effective date: blocks official Booking KPI cutover. Legacy `is_deleted` behavior does not decide source status policy. |
| 08 §35 | Operational DMS creator, UBS completion attester/link capability, maker/checker and waiting-RO visibility: blocks authoritative official-RO attestation/link commands. Privileged test normalization approves no such capability. |

Separately verify official identifier/Booking No uniqueness and mapping,
authoritative source business date/status/codebook, freshness and live Master
RO parity before source/KPI cutover. Those are source facts to verify, not
owner policy choices. Neither open policies nor source verification block this
bounded characterization slice.

## Original PR #130 validation and preserved limits

Validation logs and synthetic manifests are under
`/home/flitadmin/.codex/artifacts/dmsv3-phase1c-implementation-2026-10-01/`.
The preceding Astra audit under
`/home/flitadmin/.codex/artifacts/dmsv3-case-ro-characterization-2026-10-01/`
supplied supporting external probes; those were not counted as committed tests.
The tracked scenarios, assertions and population values above remain usable
without either ephemeral directory.

- `npm ci`: PASS.
- Safe-placeholder `npm test -- src/pages/sales/CaseCreationCompatibility.test.tsx src/services/dealService.test.ts src/services/leadIntakeService.test.ts src/services/salesOrderService.test.ts`: **57 passed, 5 files, 0 skips** (the service file includes its existing companion tests).
- Focused owned copy of the unchanged readiness runner, port base 58120,
  selecting the new live spec: **14 passed, 1 file, 0 skips**, DB lint and all
  four security catalog audits passed; fixture assertions and `--no-backup`
  destruction passed. No remaining owned containers, volumes or workdir.
- Required full `npm run check:production-readiness`: **PASS**, one full run.
  Inputs: `RLS_E2E=0`, `VITE_SUPABASE_URL=https://ci-placeholder.supabase.co`,
  `VITE_SUPABASE_ANON_KEY=ci_placeholder_anon_key_do_not_use_in_production`,
  `VITE_HRMS_APP_URL=https://hrms.example.test`, `READINESS_PORT_BASE=58140`,
  `CP_EVIDENCE_FILE=/home/flitadmin/.codex/artifacts/dmsv3-phase1c-implementation-2026-10-01/live-manifest.json`.
  Repository hygiene, ESLint, four app/Node/HRMS TS projects and recovery-service
  typecheck, RPC/architecture boundaries, service-role/edge security, npm audit
  (0 vulnerabilities), UBS/HRMS web/mobile builds and bundle budget passed.
  Units: **1,393 passed / 192 skipped**, 203 passed / 19 skipped files;
  eight additional component cases and 14 additional live-only unit skips.
  Fresh migrations, DB lint and all four catalog audits passed. Expanded live
  suite: **304 passed / 0 skipped**, 20 files = 290 retained + 14 new cases.
  DB clock: UTC, today/current start 2026-10-01, prior last day 2026-09-30,
  next start 2026-11-01. Exact cleanup verified **17 owned tenants/users** and
  all owned business rows/counters before stack destruction; no backup retained.
  Logs: `production-readiness.log`; exact synthetic identity manifests:
  `live-manifest.json`. Focused logs: `focused-live.log`, `affected-tests.log`.
- Exact final-head required CI and browser counts: recorded in the published PR
  description and Astra handoff after commit. Optional RLS Matrix skips are not
  executed database evidence; live-only unit-mode skips are separate from live execution.

All 290 prior live cases remain intact (49 LP, 30 DN, 211 others). Allocator
limits remain UUID identity, gaps allowed, GEN fallback, literal-label/company/
YY-MM namespace, direct writers outside the allocator guarantee, retained
counter state and forward correction. Successful worker replay remains
separate from privileged normalizer replay and duplicate staging rejection.
Route/backend access convergence and Employee responsibility remain separate.
Same-company follow-up reattachment and `created_at` rewriting remain possible,
so neither immutable local history nor a fixed 24-hour correction window is
guaranteed. The original characterization implementation performed no lifecycle,
schema, metric or policy correction, migration/type churn, official KPI, production
mutation/deployment, merge or programme comment. Its later accepted merge is
recorded above. Known-gap expectations must change through governed corrections
while preserving the witness fixtures; the CP-08 correction awaits Astra review.
