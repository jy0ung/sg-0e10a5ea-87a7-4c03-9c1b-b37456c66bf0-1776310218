## DMSv3 Sales lifecycle SOT checkpoint — 2026-10-01

A new authoritative documentation set now lives under [docs/DMSv3 Refactor Plan/](DMSv3%20Refactor%20Plan/README.md). It records the current governed FLC workflow and KPI/rule evidence from the live Master Data, Master Booking & Stock and FLC Master Report Plan workbooks, separates current rules from target DMSv3 normalization, freezes the target additive schema, and maintains an explicit open-policy register. Future Sales/DMS lifecycle work must use that folder as its SOT. This documentation checkpoint changes no production data and authorizes no production deployment.

# UBS web application UAT checkpoint

**Assessment:** 2026-09-27, `main@5fe80d9401cd3c893e3b20d90e4c626dc0fef9e0`. This is an implementation inventory, not a claim that end-to-end UAT has passed.

**2026-09-28 update:** PR #108 merged at `6cbe01c`: posted customer-payment reversal now creates an append-only balancing Finance adjustment and an Accounts reversal event in one transaction. The current Admin integrity slice removes self-service branch editing and narrows personal profile writes. End-to-end settlement UAT and the other Admin integrity findings remain open.

**Admin integrity follow-up:** PR #109 merged at `8212ef1`. The next bounded slice makes Vehicle Permission Editor saves atomic and audited across general and column grants, in both UBS and HRMS web. It does not complete the role matrix, webhook secret protection, or Admin information architecture.

**Admin permissions follow-up:** PR #110 merged at `5325754`. The webhook-secret slice now moves endpoint keys into Supabase Vault, removes direct browser table access and plaintext edit fields, and changes the deliverer to fetch signing keys through a service-role-only RPC. This is a pending implementation and test checkpoint, not evidence of production deployment or end-to-end webhook delivery.

**Admin secret follow-up:** PR #111 merged at `1f2125d`. The next bounded slice makes the role-section matrix save transactional and versioned, and keeps dirty edits safe from background refetch. It does not establish the reported form-loss root cause or complete Admin information architecture.

**Admin matrix follow-up:** PR #112 merged at `c021d35`. The next navigation slice adds a real Admin landing route and System Health navigation, with role-aware links. Personal account separation, form-loss diagnosis, and broader Admin workflow UAT remain open.

**Admin navigation follow-up:** PR #113 merged at `1b07c6c`. A bounded account-route slice now moves personal Profile, Security, and Notifications out of Admin for normal users, while keeping administrator access to the legacy Settings page. Dedicated Modules and Organization routes, Admin workbench operational data, and form-loss root-cause evidence remain open.

**Personal account follow-up:** PR #114 merged at `f6f408a`. The next bounded Admin slice gives Roles & Permissions its own guarded route, connects the Users page and old role-permissions redirect to it, and protects dirty role drafts on navigation. Modules, Organization, and operational workbench slices remain open.

**Roles route follow-up:** PR #115 merged at `e8b0d27`. A recovery-invariant slice now prevents role-matrix edits from removing Admin access from the Super Admin and Company Admin roles and repairs any existing denied rows while advancing the version. This addresses a confirmed UI lockout path; it does not establish the reported general form-loss root cause.

**Role recovery follow-up:** PR #116 merged at `206a87e`. The next bounded Admin slice adds a dedicated Modules route, points the Home Administration card to `/admin`, and sends disabled-module administrators to the new controls. Organization/Branding and operational workbench data remain open.

**Modules route follow-up:** PR #117 merged at `eba3b1f`. The next Admin slice gives Organization & Branding its own guarded route, redirects legacy Settings to My Profile, removes the duplicate Settings editors, protects unsaved branding drafts, and connects asset uploads to the company branding row. Admin operational workbench data and the reported general form-loss diagnosis remain open.

**Organization route follow-up:** PR #118 merged at `4fc9033`; the Admin configuration routes now separate Roles, Modules, and Organization from personal Profile. The next Finance slice adds a controlled posted AP supplier-payment correction: it mirrors the original journal in an open period, appends the reversal event and audit in one transaction, and reopens a previously paid invoice for settlement. Full AP settlement UAT and the wider operational checks remain open.

**Admin reliability diagnostic checkpoint — 2026-09-30:** PR #120 adds an opt-in, metadata-only lifecycle trace and mocked-session Chromium regressions. Normal dispatched visibility and explicit `TOKEN_REFRESHED` paths preserved a dirty Profile; hard reload classified as a new document. The intermittent report did not reproduce, and neither browser discard nor deployed service-worker update was proven. Keep the diagnostic flag dormant until Dev/UAT reproduction. After this PR, the next high-value slice is AR/AP settlement-chain and period-close/report reconciliation UAT; #48 production recovery remains separate.

**Finance reconciliation UAT follow-up — 2026-09-30:** PR #121 adds a disposable two-period, authenticated AR/AP payment-to-journal-to-close regression that confirmed three GL report RPCs included later-period journal lines in earlier reports. A bounded migration filters lines before aggregation without changing the RPC contract. The failing pre-migration run showed January Cash at 27,000 instead of 20,000 after a 7,000 February journal; the corrected local readiness run passed 203 live tests. See `docs/FINANCE_SETTLEMENT_REPORT_RECONCILIATION_UAT_2026-09-30.md`. This is Dev/UAT evidence, not production financial reconciliation or #48 recovery evidence.

**Finance period-close authority follow-up — 2026-09-30:** A new live negative regression proved the old browser-facing update closed a period with unposted AR/AP payments. A separate Finance migration moves close and lock transitions to authenticated, same-company server commands, removes direct authenticated period updates, validates posting and exact journal balance under the period row lock, stamps closure metadata and audit evidence, and blocks new source payments dated in closed/locked periods. The corrected disposable readiness run passed 208 live tests; see the appended close-control evidence in `docs/FINANCE_SETTLEMENT_REPORT_RECONCILIATION_UAT_2026-09-30.md`. This does not change #48 production release/recovery status.

**Purchasing → AP → Finance handoff UAT — 2026-10-01:** PR #123 merged at `854baeb71164d590da830891173c91f45cc137e8` after all six required CI jobs passed. An authenticated disposable Supabase fixture now proves PO approval, partial and complete GRN, all four three-way-match states, canonical PI→PO-line identity, physical invoice receipt/Vehicle reconciliation, AP approval and payment, balanced and idempotent Finance posting, AP aging, authoritative close, and a posted-payment correction in an open period. It reproduced a missing user PI-link path and a concurrent GRN over-receipt; Purchasing-owned commands/UI and a PO-row receipt lock correct them. The final local rebuild passed 211 live tests, and 17 relevant mocked Chromium tests passed. See `docs/PURCHASING_AP_FINANCE_UAT_2026-09-30.md` for exact evidence and policy limits. This is local Dev/UAT evidence; production deployment, historical reconciliation and #48 recovery remain separate.

## Scope and issue accuracy

- [#47](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/issues/47) remains the architecture and web-app completion programme. Its old linear sequence overstates the dependency on final production recovery; business-feature work can proceed with disposable UAT infrastructure.
- [#48](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/issues/48) remains the production release/recovery tracker. Branch protection, explicit deployment, migration gate, and repository backup/restore workflows exist. A real production backup, restore drill, PITR, and off-site Storage evidence do not. These are not prerequisites for ordinary Dev/UAT feature implementation.
- [#94](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/issues/94) has its Employee-backed Sales Target and report implementation merged in PR #95. Its remaining full authoritative reconciliation depends on a later compatible database rollout; it is not a reason to reimplement the feature.

## Web application inventory

| Area | Current repository capability | Remaining UAT/convergence work |
|---|---|---|
| Core identity and HRMS | Employee/Profile distinction, Employee-backed Deal and Sales assignment, HRMS workforce integrity commands, HRMS web/mobile surfaces | Reconcile legacy Advisors and Profile workforce copies, finish lifecycle contracts and role/scope UAT |
| Workflow, Inbox, Requests | Canonical approval runtime and Internal Request routing/review; Inbox includes assigned Internal Request approvals with matching ticket-read RLS | Broader cross-domain action aggregation, owning-domain outcome commands, complete lifecycle/SLA UAT |
| Sales and Inventory | Deal/customer/vehicle routes, DMS import/reconciliation, Employee-backed targets and salesperson reports | Resolve legacy name-only ownership, deterministic Vehicle ownership, end-to-end Deal/stock operational UAT |
| Commission | Rule/record page, Employee-backed rule entry, backend-owned calculation and audited approval/payment commands | Validate business rule catalogue, corrections/reversals, payout evidence and Finance/Payroll handoff; reconcile legacy name-only records |
| Purchasing | PO, GRN, PI and three-way-match pages and commands exist; users can select a canonical PI→PO line through an audited command; an authenticated disposable fixture proves the PO→GRN→PI→AP→Finance handoff, receipt concurrency guard, period close and posted-payment correction | Decide per-unit chassis identity, partial/multiple invoice and variance-override policy; reconcile supplier identity and historical data; complete deployed role/responsive UAT |
| Accounts and Finance | Aging/cash and GL, journal, period-close and statement pages exist; Accounts can post AP and AR payments from period-close to balanced Finance journals with idempotent source tracking; AR/AP posted-payment corrections are present | Complete wider settlement-chain and close/report UAT, including production rollout and historical reconciliation |
| Analytics, Admin, responsive UX | Reports, KPI, audit, user and settings pages exist; Admin Backup & Recovery has a configurable server-side manual encrypted export slice | Canonical cross-domain read models, role/RLS scenarios, responsive workflow UAT; backup destination adapters, scheduling and controlled restore remain |

Presence of a route or table is not evidence of a complete day-to-day workflow. The older roadmap labels some epics “Not Started” to mean *convergence has not been measured*, not that the feature has no implementation.

## Dependency-ordered implementation backlog

1. **Commission UAT and payout contract:** Employee links, guarded backend calculation, rule/source snapshots and audited transitions are implemented in the Commission slices. Validate FLC rule definitions, effective dates, corrections/reversals and actual payout/Finance handoff; review unresolved historical rows explicitly. Sales Target/report ID work is already merged.
2. **Workflow and Internal Requests:** Assigned Internal Request approvals now appear in the Inbox and open a ticket workspace under reviewer RLS. Aggregate other actionable records and connect approved outcomes to owning-domain commands, with no page-level cross-domain writes.
3. **Purchasing residual convergence:** The authenticated disposable PO→GRN→PI→match→AP→Finance chain, period close and posted-payment correction are now verified. Resolve the documented per-unit chassis and partial/multiple invoice policies, any controlled variance override, supplier identity and historical reconciliation, then run broader deployed role/responsive UAT. Requisition and other upstream sourcing flows remain outside this proof.
4. **Sales/Inventory and Analytics:** Complete deterministic Vehicle ownership and reconcile imported evidence; use canonical read models for management reporting.
5. **Admin Backup & Recovery product capability:** The provider-neutral worker, super-admin page, status/history, checksum and manual encrypted export are implemented; add configured destination adapters, scheduling/retention and controlled restore. Unconfigured destinations remain visibly unavailable. Keep secrets out of client state and database-readable settings. This proceeds alongside business modules without assuming this Dev/UAT host is the final production topology.
6. **UAT closure:** Exercise complete role/RLS, audit, mobile/responsive and day-to-day scenarios on isolated UAT infrastructure. Record failures and resolve them before calling the web application complete.

## Separate production work

Selection of final backup destination and key escrow, production secrets and topology, WAL/PITR, Storage versioning, retention, off-site copies, and real restore evidence remain under #48. The repository currently has a GitHub Actions backup/restore mechanism tied to a configured transport; that mechanism is infrastructure automation, not the requested in-app Admin Backup & Recovery capability. No current host/container name or Cloudflare route should become an application-level assumption.

The current technical debt most directly blocking wider feature convergence is absent cross-domain outcome commands, unresolved Purchasing policy/model choices and historical reconciliation. The production recovery gaps block a production promotion claim, not Dev/UAT application development.
