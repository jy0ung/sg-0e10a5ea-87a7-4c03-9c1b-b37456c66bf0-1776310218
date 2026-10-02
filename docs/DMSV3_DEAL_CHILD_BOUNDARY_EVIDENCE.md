# Deal child/parent company boundary — bounded Phase 1 evidence

Date: **2026-10-02 Asia/Kuala_Lumpur**. Refreshed main/base:
`988526f36d07061946f1d4c450449ac725b1f4a2`, independently accepted PR #131 squash.
No intervening main changes or overlapping DMS implementation PR were found.
This new prerequisite is **pending independent Astra review**. Phase 1 remains
partial; no Financing/LOU, official Registration, Case-source or metric acceptance.

[One forward migration](../supabase/migrations/20261002020000_deal_child_parent_company_boundary.sql)
adds only five `AS RESTRICTIVE FOR ALL TO authenticated` policies on the existing
loan, insurance, registration, activity and document metadata tables. Each USING
and WITH CHECK requires an existing visible `public.deals AS parent` with
`parent.id = child.deal_id` and `parent.company_id = child.company_id`, explicitly
qualified. Parent lookup uses ordinary caller RLS. Existing permissive, enabled,
tenant and author policies, SQL grants and table verbs remain. No application,
service/UI/type, table/index/constraint/trigger/helper/RPC change or data repair.

## Reproduced root cause and red/green evidence

Separate parent/company foreign keys prove existence independently, not their
coherence. Existing policies checked only child company (and activity actor or
document uploader). An active A caller could persist an A child pointing at B's
Deal, read that malformed child, or reattach an editable A row to B. Actual
setupLoan also created a foreign-parent loan and activity. This is unauthorized
cross-company provenance, not evidence of reading B's parent payload.

The [committed suite](../src/test/deal-child-boundary.rls.spec.ts) ran selected
target assertions against freshly reconstructed **unchanged base migrations**:
ten DC-02 inserts (all five tables for manager and company-admin), three DC-03
foreign reattachments and all three DC-05 foreign-argument setup services failed
their target assertions because writes actually succeeded. Full before/after rows
show the affected child table; service calls also added activity. **16 meaningful
product failures**, plus DC-10's absent-policy catalog failure. The other 94 cases
were intentionally unselected in this red run; they are not acceptance skips.
Fixture setup and exact cleanup succeeded, with no environment/fixture failure.

After the migration, fresh owned reconstruction passed **111 new DC cases plus
14 retained CP and seven pipeline cases = 132 passes, zero skips**. Foreign and
missing parents now fail **42501 RLS**, including otherwise editable own rows,
before FK persistence; rejected service writes return their existing Error and
append no activity. Valid operations retain exact child identities/payloads and
ordinary notes changes retain every other column except allowed `updated_at`.

Red/green catalog comparison proves all original child policies and grants byte
equal and public table/index/function inventories/definitions equal, with exactly
five new policies and retained service-role BYPASSRLS. DC-10 also commits exact
original predicate/grant assertions, distinct from the runtime write/read proofs.

## DC-01–DC-10 committed assertion mapping

Literal test prefixes below are in `src/test/deal-child-boundary.rls.spec.ts`,
registered in `vitest.rls.config.ts`. Parameter expansions produce **111 cases**.
All persistence checks use real Auth, PostgREST and PostgreSQL.

| Contract | Cases and concrete assertions |
|---|---|
| DC-01 | 25: `valid insert/read` (2 roles × 5 tables), `ordinary notes update retains ... identity and other fields` (2 × 3), `actual setup service persists ... and exactly one activity` (2 × 3), `same-company reattachment remains possible` (3). Exact full child rows, parent UUID/company, service activity actor/action/metadata, detail and timestamps; only allowed child/activity differences. Retained CP-01/02 and DN-01/10 execute actual createDeal and its normal child activity without duplicating that harness. |
| DC-02 | 10: `rejects foreign-parent INSERT ... with full no-write state`, manager/company-admin × all five. Own child company/current actor/uploader and otherwise valid inputs, foreign parent, 42501 and full unchanged state. All ten reproduce unsafe writes on unchanged base. |
| DC-03 | 19: `missing-parent INSERT ... is RLS denial before FK` (5), `forged-company INSERT ... cannot reference own parent` (5), `rejects ... reattachment of otherwise editable own row` (3 editable tables × foreign/missing/forged company). Privileged seed plus authenticated exact original read prove editable own-row eligibility; 42501 and full original rows/timestamps retained, not a foreign filtered-row/FK-only denial. |
| DC-04 | 6: `historical malformed ... stays stored but hidden` (5), `actual getDeal keeps absent subtracks null ...` (1). Distinct valid A/B and malformed A→B IDs; ordinary A/B and global direct/nested reads; hidden UPDATE/DELETE return zero rows, complete persisted state unchanged and privileged exact malformed reread. Actual getDeal returns null subtracks where none are visible, including global foreign detail. No array-position winner is invented. |
| DC-05 | 9: `actual ... service rejects ... tuple and appends no activity`, three services × foreign method argument/input.deal_id override/existing-row upsert. The actual spread tuple fails RLS even when method arguments name A's valid Deal. Error/null payload and complete unchanged state, including activity; direct reattachment covered independently by DC-03. |
| DC-06 | 20: `retains author denial ... even with valid own parent` (activity/document × own-peer/foreign-user/null); `has no ordinary DELETE on valid ...` (2 roles × 5); `has no ordinary UPDATE on valid ...` (2 × 2). Authors fail 42501; filtered forbidden mutations return zero rows and preserve exact stored fields/timestamps. DC-01 supplies both roles' current-author positives. Parent Deal deletion/cascades are not redefined. |
| DC-07 | 10: `foreign UUID/company/detail denial; global valid read retains no foreign write or mismatch bypass` (5); `service-role retains malformed inspection and valid write` (5). Ordinary foreign table/UUID/company and actual getDeal/nested denial; global exact valid A/B reads/detail but denied foreign insert/mismatch and filtered foreign editable update. Privileged malformed inspection plus valid foreign-company write, with only permitted child differences. |
| DC-08 | 10: `denied valid own read/write ... with full unchanged state`, anonymous/deactivated × 5. Real current session deactivated via privileged profile fixture; read/insert/update/delete each fail 42501 through existing pre-request gate. Restore active profile in finally. Inputs reference valid own parents and current actor/uploader, so failures are not mistaken parent denials. Existing enabled/pending and role semantics remain in unchanged catalog/functions. |
| DC-09 | 1 explicit complete-pagination/population case plus crosscut assertions in every rejected/hidden mutation and every successful direct/service operation. All 21 tables have populated independent A/B sentinels, full rows ordered by UUID, exact counts, checked range pages (page size 1 deliberately exercises multiple pages); two populated private counters and all timestamps retained. Successes allow only exact intended child/activity changes. Exact owned row/counter/Auth/period/company cleanup with visible errors and empty rereads. |
| DC-10 | 1 effective catalog case: five restrictive ALL authenticated policies, matching USING/CHECK, explicit outer child and parent ID/company references; exact original permissive/enabled/tenant/author predicate/role/verb checks and original anon/authenticated/service grants. Catalog inventory/comparison records no table/index/function change or privileged bypass change. All 363 baseline cases, including strengthened CP-08, and eight component witnesses remain unchanged. |

## State, fixture isolation and evidence strength

Protected populations are exactly CP's 20 plus document metadata: Deals, all five
children, SO/raw SO/raw Lead/raw Prospect, customers, invoices, dealer invoices,
AR/AP payment events, official receipts, purchase invoices/orders, journals and
reconciliation matches/events; private allocator counters are also compared.
Each company has independent nonempty sentinels, including financial/source
rows. Rejected writes compare entire snapshots, not just empty counts or one
target row. Successful operations compare exact permitted deltas and every
unrelated population/counter. Range counts detect truncation or duplicate IDs.

Only uniquely owned `ubs-readiness-<base>-<random>` stacks are accepted. Endpoint
must be HTTP 127.0.0.1 at base+1 and Docker container name must match exactly;
ordinary clients authenticate synthetic users with real sessions. The service
client getter binds those real clients; no service/RPC/network responses are
mocked. This is live service/database evidence, not browser-to-DB evidence.
Metadata has synthetic paths only: no Storage upload, real DMS or production
endpoint/data/query/count is involved. Cleanup deletes exact owned IDs in
dependency order, checks errors and empty rereads, removes only owned Auth users
and private counters, and stops only owned stacks with `--no-backup`.

Artifacts: `/home/flitadmin/.codex/artifacts/dmsv3-deal-child-implementation-2026-10-02/`:
`red.log`, `red-manifest.json`, `green.log`, `green-manifest.json`,
`catalog-comparison.json`, `affected.log`, full-gate/CI logs and final
`ASTRA_REVIEW_HANDOFF.md` hold exact synthetic UUIDs, responses, full snapshots,
catalog, cleanup and exact-head evidence. Astra's 12 external audit probes remain
supporting evidence, separate from these committed assertions.

## Validation

- `npm ci`: PASS; existing lockfile/dependencies unchanged.
- Affected `dealService.test.ts` and `CaseCreationCompatibility.test.tsx`: **24 passes, zero skips**, including eight retained component witnesses.
- Archived-base red runner: **17 expected failures** (16 unsafe product writes + absent policy), 94 unselected; setup/cleanup PASS.
- Fresh focused integration: **132 passes / three files / zero skips**; DB lint and four security audits PASS.
- Full `npm run check:production-readiness`: **PASS**, including its newly reconstructed `npm run test:integration`: **474 live passes / 22 files / zero skips** = 363 retained + DC111. Unit mode: **1,393 passes / 362 skips**, 203 passed/21 skipped files; the additional 111 skips are the DC live-only cases, all executed in integration. All explicit workspace typechecks plus recovery service, lint, architecture/RPC/security checks, dependency audit (zero vulnerabilities), builds/bundle budget, DB lint and four catalog audits passed.
- The first gate attempt stopped at a new fixture-helper TypeScript inference error before integration; a return-type annotation corrected it. The retained failed-attempt log is separate from the complete passing gate.
- Red, focused green and full stacks used distinct owned bases 58720/58740/58760. Each new suite cleaned exactly two synthetic companies/five Auth users, 21 business populations, two private counter namespaces and two owned accounting periods; no owned containers/volumes/workdirs remain.
- Exact final-head six-job CI and browser counts are recorded in the review handoff after execution. Optional skipped/credential-only RLS supplies no database acceptance. The historical browser baseline is 48 passes/two existing skips; no local browser result is inferred from this readiness command.

## Operational impact, remaining limits and later work

Already-invalid tuples become invisible to authenticated users, including global
readers and nested/getDeal detail. They remain stored byte equal. Operators need
separate controlled privileged inspection/repair; this PR performs no historical
backfill/delete/reattachment and estimates no production affected population.

This is authenticated relational access control. Service-role BYPASSRLS remains;
there is no universal composite FK, privileged parent-company retarget guarantee
or concurrent privileged-writer serialization. Same-company subtrack reattachment
remains allowed. Other bank/insurer/master FK coherence, immutable author/history,
Storage authorization, document requirements, application selection and atomic
multi-request services are not certified. Child failure currently stops setup
before its separate activity request; this does not make the service atomic.

The preceding audit's current Financing defects remain unresolved: repeated loan
saves create distinct rows; getDeal chooses one by array position; status updates
fan out over all applications by Deal; zero-row status updates report success and
append history. These are defects for a separate bounded Financing audit, not
approved business semantics. Multiple applications are confirmed, so imposing
uniqueness on deal_id/deduplicating applications would violate the target model.
Versioned LOU, selected/current disposition, aging/status, Cash, Stock Control,
Registration prerequisites/commands and official metrics remain separate work.

Retain all PR #131/prior limits: legacy lead/deposit/form/dashboard population
gaps; no authoritative Case creation/attestation/source link or official Master
RO parity/Booking KPI cutover; allocator gaps/GEN/literal namespace/separate
requests/counter retention; privileged phantom/retarget and other normalizers;
successful worker replay separate from privileged replay; route/backend access
convergence and Employee responsibility; same-company follow-up reattachment and
created_at rewriting, so the nominal 24-hour condition is neither immutable
history nor a fixed correction window. SOT 08 §§4,11,13,14,33,35 and all other
OPEN policies are unchanged; optional deposit remains confirmed. No Phase 1/2/3
completion, production acceptance, issue closure or next-slice implementation.
