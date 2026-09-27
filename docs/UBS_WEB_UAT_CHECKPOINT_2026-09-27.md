# UBS web application UAT checkpoint

**Assessment:** 2026-09-27, `main@5fe80d9401cd3c893e3b20d90e4c626dc0fef9e0`. This is an implementation inventory, not a claim that end-to-end UAT has passed.

## Scope and issue accuracy

- [#47](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/issues/47) remains the architecture and web-app completion programme. Its old linear sequence overstates the dependency on final production recovery; business-feature work can proceed with disposable UAT infrastructure.
- [#48](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/issues/48) remains the production release/recovery tracker. Branch protection, explicit deployment, migration gate, and repository backup/restore workflows exist. A real production backup, restore drill, PITR, and off-site Storage evidence do not. These are not prerequisites for ordinary Dev/UAT feature implementation.
- [#94](https://github.com/jy0ung/sg-0e10a5ea-87a7-4c03-9c1b-b37456c66bf0-1776310218/issues/94) has its Employee-backed Sales Target and report implementation merged in PR #95. Its remaining full authoritative reconciliation depends on a later compatible database rollout; it is not a reason to reimplement the feature.

## Web application inventory

| Area | Current repository capability | Remaining UAT/convergence work |
|---|---|---|
| Core identity and HRMS | Employee/Profile distinction, Employee-backed Deal and Sales assignment, HRMS workforce integrity commands, HRMS web/mobile surfaces | Reconcile legacy Advisors and Profile workforce copies, finish lifecycle contracts and role/scope UAT |
| Workflow, Inbox, Requests | Canonical approval runtime and Internal Request routing/review; Inbox and request pages exist | Unified cross-domain action inbox, owning-domain outcome commands, complete lifecycle/SLA UAT |
| Sales and Inventory | Deal/customer/vehicle routes, DMS import/reconciliation, Employee-backed targets and salesperson reports | Resolve legacy name-only ownership, deterministic Vehicle ownership, end-to-end Deal/stock operational UAT |
| Commission | Rule/record page and tables exist | Replace name-keyed rules and browser-computed earnings with Employee IDs and backend-owned, auditable calculation |
| Purchasing | PO, GRN, purchase invoice and three-way-match pages exist | Verify server-enforced lifecycle, AP handoff, permissions, audit and UAT cases |
| Accounts and Finance | Aging/cash and GL, journal, period-close and statement pages exist | Verify subledger settlement and Finance-owned posting contracts, close and reports against UAT scenarios |
| Analytics, Admin, responsive UX | Reports, KPI, audit, user and settings pages exist | Canonical cross-domain read models, role/RLS scenarios, responsive workflow UAT; no Admin Backup & Recovery product area exists yet |

Presence of a route or table is not evidence of a complete day-to-day workflow. The older roadmap labels some epics “Not Started” to mean *convergence has not been measured*, not that the feature has no implementation.

## Dependency-ordered implementation backlog

1. **Commission identity and calculation:** Add nullable Employee links to rule/earning records, preserve unresolved legacy rows, make new writes use stable IDs, and calculate through a Commission-owned backend command. Sales Target/report ID work is already merged. Validate duplicate names, branch/company scope, historical rule version and concurrent calculation in disposable Supabase.
2. **Workflow and Internal Requests:** Aggregate actionable records in one Inbox and connect approved outcomes to owning-domain commands, with no page-level cross-domain writes.
3. **Purchasing → Accounts → Finance:** Test and close the requisition/PO/GRN/invoice/match/AP/settlement/posting chain using server-side transitions and Finance-owned journals.
4. **Sales/Inventory and Analytics:** Complete deterministic Vehicle ownership and reconcile imported evidence; use canonical read models for management reporting.
5. **Admin Backup & Recovery product capability:** Design a provider-neutral, backend-controlled job and destination interface; add authorized status/history, checksum, manual encrypted export and controlled restore. Unconfigured destinations must be visibly unavailable. Keep secrets out of client state and database-readable settings. This can proceed alongside business modules, without assuming this Dev/UAT host is the final production topology.
6. **UAT closure:** Exercise complete role/RLS, audit, mobile/responsive and day-to-day scenarios on isolated UAT infrastructure. Record failures and resolve them before calling the web application complete.

## Separate production work

Selection of final backup destination and key escrow, production secrets and topology, WAL/PITR, Storage versioning, retention, off-site copies, and real restore evidence remain under #48. The repository currently has a GitHub Actions backup/restore mechanism tied to a configured transport; that mechanism is infrastructure automation, not the requested in-app Admin Backup & Recovery capability. No current host/container name or Cloudflare route should become an application-level assumption.

The current technical debt most directly blocking feature convergence is name-keyed Commission identity, missing backend-owned Commission calculation, and absent cross-domain outcome commands. The production recovery gaps block a production promotion claim, not Dev/UAT application development.
