# Bounded Deal-number allocation evidence

Date: 2026-10-01. Implementation baseline: accepted PR #128 squash,
`2d744dbbc16410a7762abf7bcb16974b000590d6`. This is a technical prerequisite
and partial Phase 1 checkpoint, pending independent review; it does not complete
the DMSv3 programme or Phase 2 foundation.

## Implementation and upgrade

[Additive migration](../supabase/migrations/20261001020000_deal_number_allocation.sql)
replaces only the existing `generate_deal_no(text,text) -> text` body and adds the
planned private `deal_number_sequences` table. No applied migration, application
service/UI behavior, historical number or Deal UUID is changed.

The primary key is company + literal displayed branch label + database YY/MM,
matching the emitted unique-number namespace. Null/unresolved GEN and a real GEN
branch share a counter. Branch UUID/text ID remains canonical branch identity.
After existing authorization, initialization and a row lock serialize allocation;
the transaction updates the bigint high-water before returning. Every allocation
also checks existing numeric suffixes for the exact literal prefix, including
later higher inserts. Leading zeroes are normalized as text; malformed strings
are ignored; an out-of-capacity numeric suffix fails explicitly before a cast.
Minimum three-digit padding grows to 1000 and beyond without truncation.

Upgrade bootstraps lazily from existing numbers. No backfill rewrites Deals.
Reservations survive abandonment, failed INSERTs and Deal deletion; gaps are
intentional. Retain allocation state and forward-correct after rollout. Returning
to unsafe MAX+1 or clearing/decrementing counters is not an acceptable normal
rollback after allocation begins. Counter table privileges are revoked from
PUBLIC/anon/authenticated, RLS is enabled, and only intentional service access
remains. Existing authenticated/service RPC grants, company/global checks,
inactive-session gate, safe definer search path and Deal uniqueness remain.

## Committed live coverage

[Suite](../src/test/deal-number-allocation.rls.spec.ts), explicitly registered in
[live configuration](../vitest.rls.config.ts), contains **30 cases**. It uses real
Auth/PostgREST/PostgreSQL on the readiness runner. Before any fixture mutation it
requires loopback URL **and** `supabase_db_ubs-readiness-` container prefix.
Synthetic tenants/actors and exact fixture IDs are owned and cleaned by the
suite; only the owned inactive actor is restored in `finally`.

The actual TypeScript `createDeal` is dynamically imported with its client export
replaced by the actual authenticated disposable Supabase client. No `.rpc`,
`.from`, network results, returned rows or creation implementation are mocked.
Privileged access is confined to fixture preparation, persisted verification and
cleanup. No live acceptance case is skipped.

| Contract | Searchable committed assertions |
|---|---|
| DN-01 | `DN-01 / DN-10 real createDeal twice`: omitted branch, deposits 0/500, successful results, distinct UUIDs/numbers, complete row rereads equal service results, unchanged legacy `lead`, exactly one authored `deal_created` activity per Deal with matching metadata. |
| DN-02 | `DN-02 sequential valid-branch`: exact label and 001/002 padding, distinct UUIDs despite identical customer evidence, complete persisted rows and counter 2. |
| DN-03 | Two `DN-03 independent sessions concurrently reserve` cases: separate authenticated clients, null and explicit same-company branch, all responses awaited before any insertion, distinct numbers, all ordinary authenticated INSERTs persist distinct UUIDs and expected numbers. No sleep oracle. |
| DN-04 | `DN-04 reservations survive`: abandonment, controlled 23502 INSERT rejection, successful fixture insertion/deletion by authenticated company admin; counter 1/2/3/4 is reread, no reservation reused, business populations return to exact prior state. |
| DN-05 | `DN-05 valid historical suffixes`: valid padded suffixes establish 700, malformed/unrelated/other-period strings do not crash or advance incorrectly, later null-metadata 1300 establishes 1301, every full historical row unchanged. Additional huge valid suffix case fails clearly and rolls back counter initialization. |
| DN-06 | `DN-06 existing 100 and 999`: database-derived YY/MM, seeded 100 prevents false truncation success, inserts 1000 then 1001. Additional signed-32-bit growth, exact final bigint reservation and exhausted-counter unchanged-state assertions; oversized historical numeric suffix fails 22003. |
| DN-07 | Three `DN-07` cases: concurrent null/real GEN share state; unresolved/foreign branch retain own-company GEN fallback; distinct labels/companies allocate independently; literal `%`, `_`, regex and slash characters do not match a misleading higher prefix. |
| DN-08 | Three denial cases: anonymous, inactive existing session, forged foreign company; positive controls, 42501, null result, unchanged full counter snapshots and scoped business populations, owned status restored. Separate positive global/service cross-company allocation remains successful. |
| DN-09 | Twelve cases: anon/manager/company-admin × read/INSERT/UPDATE/DELETE; 42501/no returned state, populated privileged counter snapshots and business populations equal before/after. Equality detects hidden mutation even where an RLS response alone would be inconclusive. |
| DN-10 | Allocation alone only persists its counter; precise tenant-scoped IDs/counts unchanged in all 17 checked tables. Actual zero/positive-deposit service calls add exactly two Deals/two normal activities and leave all other populations unchanged. |

The 17 checked populations are Deals, Deal activities/loan/insurance/registration,
Sales Orders, raw DMS Sales Orders/Leads/Prospects, Customers, invoices/dealer
invoices/purchase invoices, payment/supplier-payment events, Official Receipts
and journal entries. Population checks compare full persisted rows as well as
IDs/counts, so denied writes cannot hide edits to existing business rows.
Bigint counter snapshots cast to text to avoid JavaScript precision loss.

## Before/after execution

The first four committed cases (DN-01, both DN-03 variants and DN-06) ran on a
fresh reconstruction **before the new migration was copied into a stack**:

- DN-01: second real service INSERT failed `23505` on duplicate Deal number.
- DN-03: both null and explicit-branch request pairs returned one distinct
  number instead of two, before any INSERT.
- DN-06: with 100/999 already persisted, allocator returned
  `DEAL/GROWTH/26/10/100` instead of `DEAL/GROWTH/26/10/1000`.

All four failed as expected; this was a failing run, not acceptance PASS.
The full pre-migration invocation reported 257 passed/7 failed across 19 files:
three existing normalizer cases also timed out, and the source-boundary cleanup
hook timed out. These are recorded separately from the four number defects.
No unrelated code or timeout setting was changed. A fresh post-migration
reconstruction passed **290/290 across 19 files**, including those existing
cases and all 49 PR #128 cases. The same four number scenarios are now green.

Commands and retained local evidence:

- `npm ci`: exit 0, lockfile unchanged, 976 packages audited, zero vulnerabilities.
- `READINESS_PORT_BASE=57820 npm run test:integration`: red evidence above;
  database lint and four security catalog audits passed.
- `READINESS_PORT_BASE=57840 npm run test:integration`: exit 0, 290 tests/19
  files, no skips; database lint and four security audits passed.
- Affected `dealService.test.ts`: 16/16 passed, exit 0.
- Full `npm run check:production-readiness`, with `RLS_E2E=0`,
  `VITE_SUPABASE_URL=https://ci-placeholder.supabase.co`,
  `VITE_SUPABASE_ANON_KEY=ci_placeholder_anon_key_do_not_use_in_production`,
  `VITE_HRMS_APP_URL=https://hrms.example.test`, and `READINESS_PORT_BASE=57880`:
  exit 0 after final full-row assertion strengthening. Repository hygiene,
  lint, four application TypeScript configs plus recovery, RPC/architecture
  checks, security scans, zero-vulnerability audit, all three builds and bundle
  budget passed. Unit mode: 1,385 passed/178 skipped, 202 passed files/18 skipped
  files (220 total); 30 of those skipped unit cases are this explicitly live
  suite. The runner's fresh live stage: **290/290, 19 files, zero skips**,
  database lint and all four security audits passed.
- `git diff --check`: passed; migration versions unique.

All six required jobs must be verified against the published final head in the
PR: Lint, Web App, Mobile App, Security Audit, Production Readiness and E2E.
Standard browser smoke checks are compatibility evidence. Optional skipped RLS
Matrix jobs supply no additional executed database evidence; the required
Production Readiness job executes the disposable suite.

Local logs: `/home/flitadmin/.codex/artifacts/deal-number-allocation-2026-10-01/`
(`npm-ci.log`, `red-before.log`, `green-integration-1.log`,
`service-tests.log`, `production-readiness-final.log`). They supplement,
and do not replace, the committed suite and exact-head CI.

## Identity, compatibility and remaining target gaps

Governed local identity is the Deal UUID. Local display numbers are references;
official Proton Booking No/RO and source lineage remain distinct. The retained
same-company branch lookup and unresolved/foreign GEN fallback describe current
compatibility only, not a new branch permission or production Case policy.

The real service still hard-codes legacy stage `lead`, computes its legacy total,
and performs separate number/Deal/activity requests. This proof certifies number
allocation and current service compatibility, not atomic/idempotent FLC Case
creation, a gapless sequence or a financial/document numbering scheme.
Concurrent direct Deal writers deliberately bypassing the allocator are not
certified; the unchanged unique `(deal_no, company_id)` constraint is the final
backstop. Counter capacity is bigint; exhaustion fails rather than wrapping.

Production Case creators, required documents, deposit/waiver/refund policy,
official Booking metrics, Case-source linking and official RO reconciliation,
Employee responsibility, lifecycle/event/outbox rollout and pricing authority
remain outside this correction. Successful worker replay, route/backend access
convergence and the preexisting note-history limitation also remain separate:
same-company reattachment and `created_at` rewriting still make the nominal
24-hour condition insufficient for immutable history/fixed correction windows.
No production deployment, production mutation, merge or issue closure is part
of this slice.
