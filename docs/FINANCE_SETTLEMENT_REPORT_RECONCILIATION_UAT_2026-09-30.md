# AR/AP settlement and report reconciliation UAT

Date: 2026-09-30
Baseline: `main@f9441f29d06ef7f1b35c4cc6ca175e3c60b559f8` (Admin lifecycle PR #120 merged)

## Scope and evidence

This is a disposable local Supabase test of the Accounts payment-event → Finance journal → period-close summary → Trial Balance / Profit & Loss / Balance Sheet path. It does not use or change a production tenant.

The new `finance-settlement-reconciliation.rls.spec.ts` fixture creates two accounting periods in one seeded test company. It records a 50,000 customer payment and a 30,000 supplier payment in January, then posts both through the authenticated Finance RPCs. Before posting, the period-close queue lists both events. After posting, the queue excludes them, the summary reports two journals with 80,000 debits and 80,000 credits, and the January Trial Balance nets Cash +20,000, AR −50,000 and AP +30,000. A separate 7,000 February revenue journal checks that January reports exclude later lines while February reports include them. The test also checks the balance-sheet cut-off, Profit & Loss period isolation, cross-company denial, and an authenticated close of the now-posted January period.

## Confirmed defect and correction

The original Trial Balance, Profit & Loss, and Balance Sheet RPCs joined `accounts` to **all** matching journal lines before joining the journal header with a period or date condition. Their sums used the line columns even when that later join found no matching header. A January report could therefore include February activity.

The failing run against the pre-correction migrations returned **27,000** for January Cash, while the January AR/AP journals netted to **20,000**; the extra 7,000 was the February fixture. This was a real disposable database RPC result, not a mocked UI assertion. The migration `20260930010000_finance_report_period_scoping.sql` restricts the journal-line relation by company and requested period (Trial Balance and Profit & Loss) or by company and period end date (Balance Sheet) **before** aggregation. RPC signatures and return columns remain the same. It preserves the existing authorization checks and applies an explicit safe function `search_path`.

After the migration, the isolated readiness run passed **203/203 live tests**, including the new full-chain case. January and February totals, Profit & Loss, and Balance Sheet cut-offs matched the fixture expectations; the period-close summary remained balanced before and after closing. The test uses the repository's `scripts/test-production-readiness.sh`, which rebuilds a temporary Supabase stack, seeds test actors, runs database lint/security checks, and destroys the stack.

## Interpretation and remaining UAT

The defect and fix are proven for the two-period fixture and the exact RPC path. Existing posted-payment correction tests separately cover AR and AP reversal invariants; this case does not represent a browser-visible, real-user close workflow. The existing Playwright Finance pages use mocked data and protect UI rendering, not live reconciliation. In the first local 12-case Finance browser run, 10 cases passed and two pages stayed blank until timeout; both timed-out cases passed when rerun alone, and a subsequent complete run passed 12/12. The intermittent blank-page result was not diagnosed here and does not change the passing live RPC evidence.

The positive close case establishes the reported state after all seeded payment events were posted. Static review shows the current `closeAccountingPeriod` service updates the period row directly while the readiness summary is displayed separately; this slice did not prove that an attempted premature close is rejected atomically. That close-control question, wider PO/GRN/match handoff, aging/cash statements, different fiscal calendars, legacy historical journal review, and production release/recovery evidence remain open. No production deployment, data repair, production period close, or live tenant mutation was performed.

The function replacement intentionally changes historical report numbers where the earlier queries included other-period lines. Production rollout requires normal migration compatibility and review gates under #48. A client rollback is compatible with the unchanged RPC contract; rolling back the function body would restore the incorrect report totals, so retain the corrected functions during an application rollback.
