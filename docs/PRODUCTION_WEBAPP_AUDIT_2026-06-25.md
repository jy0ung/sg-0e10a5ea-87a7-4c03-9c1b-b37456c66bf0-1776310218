# Production WebApp Audit — 2026-06-25

## 0. Scope and guardrails

Target: `https://ubs.protonfookloi.com` production WebApp and same-origin Supabase API proxy.

Guardrails:
- Audit first, fix second. No code fixes until route/workflow/API evidence is collected and prioritized.
- Production-sensitive: do not run destructive Docker/DB/deploy commands. Do not bulk-modify production data.
- Workflow tests that create records must use clearly prefixed audit test data (`AUDIT-20260625`) and avoid deleting or mutating real user records.
- Existing unrelated dirty file `supabase/.temp/cli-latest` is generated local state and must not be staged.

## 1. Pages and modules to audit

### Platform / shell
- `/`, `/home`, `/modules`, `/notifications`, invalid route/404 behavior
- Sidebar, route chrome, refresh/back/forward, focused mode route titles

### Auto Aging / vehicle lifecycle
- `/auto-aging`
- `/auto-aging/vehicles`
- `/auto-aging/vehicles/:chassisNo` using a real sample chassis
- `/auto-aging/import`
- `/auto-aging/review`
- `/auto-aging/sla`
- `/auto-aging/mappings`
- `/auto-aging/commissions`
- `/auto-aging/quality`
- `/auto-aging/history`
- `/auto-aging/reports`
- `/auto-aging/lifecycle/:chassisNo`

### Sales / Deals canonical workflow
- `/sales`
- `/sales/pipeline`
- `/sales/deals`
- `/sales/deals/new`
- `/sales/deals/:id` using a real sample deal
- legacy `/sales/orders` redirect to `/sales/deals`
- `/sales/customers`, `/sales/customers/:id`
- `/sales/invoices`
- `/sales/performance`
- `/sales/advisors`
- `/sales/margin`
- `/sales/outstanding`, `/sales/outstanding-new`
- `/sales/dealer-invoices`
- `/sales/verify-or`
- `/sales/lead-intake`, `/sales/lead-intake/:kind/:rawId` when sample exists

### Inventory / Purchasing / Finance / Reports
- Inventory: stock, transfers, chassis, chassis-filter
- Purchasing: invoices, invoice detail, orders, order detail/new, GRN list/new/detail, 3-way match
- Finance: chart, periods, trial balance, P&L, balance sheet, aging, cash, close, journal
- Reports center: tabs, CSV/PDF export controls, scheduled reports tab

### Internal Requests / Portal
- `/portal`, `/portal/tickets/new`, `/portal/tickets`, `/portal/tickets/completed`, `/portal/tickets/:id`
- `/portal/dashboard`, `/portal/queue`, `/portal/history`, `/portal/reports`
- `/portal/setup`, `/portal/announcements`, `/portal/documents`

### Admin
- `/admin/activity`, `/admin/kpi-studio`, `/admin/webhooks`, `/admin/dms-sync`
- `/admin/reconciliation`, `/admin/reconciliation/:matchId`
- `/admin/users`, `/admin/audit`, `/admin/settings`, `/admin/branches`, `/admin/master-data`, `/admin/suppliers`, `/admin/dealers`, `/admin/user-groups`, `/admin/health`

### HRMS ingress
- `/hrms` redirect/hand-off behavior in main app; production HRMS domain smoke separately if reachable.

## 2. User roles to test

Primary browser session:
- Admin/company-level user: `flit092023@gmail.com` (existing production account).

Role/access audit methods:
- Browser-visible admin role for route loading/action availability.
- Database/RLS/route config inspection for requester/owner/manager/admin rules.
- If existing safe non-admin accounts are discoverable with known credentials, run second browser smoke. Otherwise record this as a remaining risk and verify backend policies from source/migrations.

Roles to reason/test where applicable:
- Requester
- Owner/PIC
- Manager
- Admin
- Escalation owner
- Backup owner

## 3. Critical workflows to test

Non-destructive browser workflows:
1. Login/session persistence and direct-route refresh.
2. Navigation through every major sidebar/module route.
3. Legacy Sales Orders redirect to Deals.
4. Deal list → deal detail → tabs → stage/action controls present and defensive rendering.
5. Deal dashboard/pipeline counts vs list/report samples.
6. Vehicle list/detail/lifecycle → Create Deal path.
7. Portal new request form validation and draft persistence.
8. Create one audit-tagged request if category metadata allows safe submission.
9. Ticket list/queue → workspace → comments/internal note/resolution draft persistence where safe.
10. Reports filters/export controls and scheduled report form validation.
11. Admin users/audit/system health filters and empty/error states.
12. Browser tab switch / visibilitychange draft and route state persistence.
13. Mobile viewport smoke on the major layouts.

## 4. Frontend routes to verify

Route inventory comes from:
- `src/main.tsx`
- `packages/shell/src/platformRegistry.ts`
- production smoke registry
- dynamic sample IDs from production DB (deal, ticket, vehicle, customer, invoice, PO/GRN/reconciliation where available)

Per-route checks:
- Initial navigation, reload, browser back/forward on route subset
- Blank screen / error boundary detection
- Console errors and page errors
- Failed network requests (HTTP 4xx/5xx, aborted non-analytics API calls)
- Main content non-empty
- Route title/chrome consistency
- Load time budget: warning > 5s, high > 10s

## 5. Backend/API endpoints to verify

API/API-like surfaces:
- Supabase Auth login/session refresh/logout path
- REST calls for each page (profiles, module settings, vehicles/search RPCs, deals, tickets, reports, admin metadata)
- RPC canary surfaces already used by CI/deploy plus route-specific RPCs from browser network logs
- Edge functions: invite/status only inspected, not invoked destructively
- Storage signed URL/attachment paths where existing attachments exist

Backend checks:
- DB counts and sample IDs
- Data consistency SQL for dashboard/list/report mismatch candidates
- RLS/policy coverage inspection for Deals, tickets, reports, admin tables
- Production application logs where available

## 6. Known risk areas

- Recent canonical Deals redirect and route registry changes.
- Recent DataContext split-query optimization.
- Large-data pages: vehicles, deals, ticket queue, reports.
- Portal workflow permissions and internal notes visibility.
- Scheduled reports UI exists; delivery infrastructure may still require Edge Function/SMTP.
- Sales Orders legacy pages/links may remain in copy or tests.
- Feature-flagged purchasing GRN flow.
- Browser service worker/stale chunks after deploy.
- Dynamic imports/lazy route chunk failures.
- Direct-route refresh behind nginx/Supabase proxy.
- Mobile density and horizontal overflow in tables/forms.

## 7. Testing method

1. Build route/sample inventory from source + production DB.
2. Run automated Playwright production route audit:
   - Login once
   - Visit each route
   - Capture console/page/network failures, load timing, title/main text, screenshots for failures
   - Repeat selected routes with reload/back/forward
   - Run mobile viewport subset
3. Run targeted workflow scripts for Portal, Deals, Reports, Admin Health.
4. Run SQL/API consistency checks for counts/statuses/permissions.
5. Manually inspect representative failing or suspicious pages with browser snapshots/screenshots.
6. Produce prioritized issue list.
7. Only after the issue list is complete, fix Critical issues first with tests and browser verification.

## 8. Priority order for fixes

1. Critical app crashes, blank screens, route failures, chunk/runtime errors.
2. Security/permission/RLS issues and data leakage.
3. Core workflow blockers: login, request creation, ticket workspace, deal lifecycle, reports.
4. Data accuracy mismatches: dashboards vs lists vs reports, status/SLA inconsistencies.
5. Severe performance/repeated-fetch issues.
6. State loss/random refresh/draft persistence defects.
7. Medium UX consistency and enterprise-readiness issues.
8. Low polish/copy/spacing/accessibility improvements.

## 9. Audit status log

- Plan created: 2026-06-25.
- Audit execution: pending.
- Critical fixes: pending audit findings.

## 10. Audit execution evidence — initial production pass

Automated Playwright route audit executed against production after logging in as the existing admin account.

Coverage:
- 84 desktop routes / route variants
- 8 mobile viewport route checks
- 7 reload/back/forward checks
- 1 draft-persistence workflow probe

Raw evidence before fixes:
- `.audit/audit-results-before-fixes.json` (local audit artifact, not intended for production docs commit unless explicitly staged)
- `/tmp/prod-webapp-audit-20260625/screenshots/` on the production host session

Benign noise filtered from findings:
- Cloudflare analytics script blocked by current CSP (`static.cloudflareinsights.com`). This is noisy but not app-breaking. Treat as a CSP/analytics configuration cleanup, not a core WebApp failure.
- `ErrorTracking running in local-only mode (no DSN)` info logs. This is a production-readiness observability issue, but not a runtime crash.
- `net::ERR_ABORTED` profile requests caused by rapid route navigation during automated audit.

## 11. Prioritized findings

| ID | Severity | Area | Finding | Root cause | Fix priority | Status |
|---|---|---|---|---|---|---|
| AUD-001 | High | Admin Audit / Activity | `/admin/audit` and `/admin/activity` issue 400 responses when loading audit logs. Pages render partial/zero data and log errors. | Audit service selected `profiles(full_name, email, role)`, but production `profiles` schema uses `name`, not `full_name`. | P1 governance/data visibility | Fixed in branch |
| AUD-002 | Medium | Admin System Health | `/admin/health` shows usable metrics but emits a 404 for DMS sync status. | Health service queried non-existent `dms_sync_runs`; production table is `sync_runs`. | P1 production readiness | Fixed in branch |
| AUD-003 | High | HRMS production runtime | `https://hrms.protonfookloi.com/dashboard` logs Auto Aging summary RPC errors from copied stale DataContext. | `apps/hrms-web` retained stale `DataContext`/`autoAgingDataService` copy instead of the split-query DataContext now used by root app. | P1 cross-app runtime stability | Fixed in branch |
| AUD-004 | Medium | New Request draft persistence | Initial automated draft workflow probe failed to restore a typed value after route away/back. Manual confirmation was interrupted by a browser connection timeout; needs targeted retest after deployment. | Possible probe targeting wrong input or actual draft timing/restore gap in `NewTicket` / `usePersistedDraft`. | P2 data-loss risk investigation | Needs retest |
| AUD-005 | Medium | Observability | Production logs say error tracking is local-only/no DSN. | Sentry/DSN not configured for production client or intentionally disabled. | P2 production operations | Not fixed |
| AUD-006 | Low | CSP/Analytics | Cloudflare Insights beacon is blocked by CSP on every page, producing console error noise. | CSP `script-src` does not allow Cloudflare analytics domain. | P3 console hygiene | Not fixed |
| AUD-007 | Medium | Route content heuristics | Some pages contain normal empty-state text like "No records found", which the initial script flagged as not-found route text. | Audit heuristic too broad; not an app defect. | N/A | Reclassified benign |
| AUD-008 | Medium | Role coverage | Full requester/owner/manager/browser matrix was not completed in this pass because only admin credentials are known. | Production role accounts/passwords not available in the audit session; backend/source policy checks still required. | P2 security verification | Remaining risk |

## 12. Fixes applied in this branch

### AUD-001 — audit profile join fix

Changed profile joins/display fields from `full_name` to `name` in:
- `packages/platform-services/src/auditService.ts`
- `src/pages/admin/ActivityDashboard.tsx`
- `src/components/admin/AuditLogViewer.tsx`
- `src/components/vehicles/VehicleDetailPanel.tsx`
- `src/services/inventoryService.ts`
- HRMS-web copied equivalents

Regression coverage:
- `src/services/auditService.test.ts`
- `apps/hrms-web/src/services/auditService.test.ts`

### AUD-002 — System Health sync table fix

Changed DMS sync health query from `dms_sync_runs` to production `sync_runs` filtered by `source_system='dms'`.

Regression coverage:
- `src/services/systemHealthService.test.ts`

### AUD-003 — HRMS stale DataContext fix

Synced HRMS-web DataContext and Auto Aging data service with root app split-query implementation:
- `apps/hrms-web/src/contexts/DataContext.tsx`
- `apps/hrms-web/src/services/autoAgingDataService.ts`

Regression coverage:
- `apps/hrms-web/src/contexts/DataContext.test.tsx`
- root `src/contexts/DataContext.test.tsx`

## 13. Remaining planned audit work after deployment

1. Rerun production Playwright audit after fixes deploy and compare:
   - `/admin/audit`
   - `/admin/activity`
   - `/admin/health`
   - `https://hrms.protonfookloi.com/dashboard`
2. Re-run New Request draft persistence with explicit field selectors (`Request title`, `Description`) and a wait for draft save.
3. Add browser E2E regression for:
   - `/admin/audit` loads without 400
   - `/admin/health` loads without `dms_sync_runs` 404
   - `/sales/orders` redirects to `/sales/deals`
   - New Request draft persists across route changes/tab visibility
4. Complete role matrix once safe test credentials are available for requester/owner/manager/backup owner.
5. Decide whether to configure Sentry/DSN and/or remove/allow Cloudflare Insights to eliminate production console noise.
