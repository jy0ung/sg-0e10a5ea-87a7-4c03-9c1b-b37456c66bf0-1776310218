# UBS web application UAT checkpoint

**Assessment:** 2026-09-27, `main@5fe80d9401cd3c893e3b20d90e4c626dc0fef9e0`. This is an implementation inventory, not a claim that end-to-end UAT has passed.

**2026-09-28 update:** PR #108 merged at `6cbe01c`: posted customer-payment reversal now creates an append-only balancing Finance adjustment and an Accounts reversal event in one transaction. The current Admin integrity slice removes self-service branch editing and narrows personal profile writes. End-to-end settlement UAT and the other Admin integrity findings remain open.

**Admin integrity follow-up:** PR #109 merged at `8212ef1`. The next bounded slice makes Vehicle Permission Editor saves atomic and audited across general and column grants, in both UBS and HRMS web. It does not complete the role matrix, webhook secret protection, or Admin information architecture.

**Admin permissions follow-up:** PR #110 merged at `5325754`. The webhook-secret slice now moves endpoint keys into Supabase Vault, removes direct browser table access and plaintext edit fields, and changes the deliverer to fetch signing keys through a service-role-only RPC. This is a pending implementation and test checkpoint, not evidence of production deployment or end-to-end webhook delivery.

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
| Purchasing | PO, GRN, purchase invoice and three-way-match pages exist; invoice receipt atomically records the Inventory Vehicle; AP lifecycle and payment commands enforce actor, role, receipt, settlement and audit guards | Verify broader PO/GRN/match/AP handoff, payment correction, Finance posting and full UAT cases |
| Accounts and Finance | Aging/cash and GL, journal, period-close and statement pages exist; Accounts can post AP and AR payments from period-close to balanced Finance journals with idempotent source tracking; AR settlement is role- and balance-guarded | Complete posted-payment correction/reversal, settlement and close/report UAT scenarios |
| Analytics, Admin, responsive UX | Reports, KPI, audit, user and settings pages exist; Admin Backup & Recovery has a configurable server-side manual encrypted export slice | Canonical cross-domain read models, role/RLS scenarios, responsive workflow UAT; backup destination adapters, scheduling and controlled restore remain |

Presence of a route or table is not evidence of a complete day-to-day workflow. The older roadmap labels some epics “Not Started” to mean *convergence has not been measured*, not that the feature has no implementation.

## Dependency-ordered implementation backlog

1. **Commission UAT and payout contract:** Employee links, guarded backend calculation, rule/source snapshots and audited transitions are implemented in the Commission slices. Validate FLC rule definitions, effective dates, corrections/reversals and actual payout/Finance handoff; review unresolved historical rows explicitly. Sales Target/report ID work is already merged.
2. **Workflow and Internal Requests:** Assigned Internal Request approvals now appear in the Inbox and open a ticket workspace under reviewer RLS. Aggregate other actionable records and connect approved outcomes to owning-domain commands, with no page-level cross-domain writes.
3. **Purchasing → Accounts → Finance:** Invoice receipt and Vehicle handoff are atomic, branch-scoped and audited. AP verification, approval and supplier payment have server-side role and state guards, including a match check for PO-linked approvals. Finance can post AP and AR payment events to balanced journals from the period-close queue; reversed unposted events no longer block close. Test and close the remaining requisition/PO/GRN/invoice/match/AP/AR/settlement chain and controlled posted-payment corrections.
4. **Sales/Inventory and Analytics:** Complete deterministic Vehicle ownership and reconcile imported evidence; use canonical read models for management reporting.
5. **Admin Backup & Recovery product capability:** The provider-neutral worker, super-admin page, status/history, checksum and manual encrypted export are implemented; add configured destination adapters, scheduling/retention and controlled restore. Unconfigured destinations remain visibly unavailable. Keep secrets out of client state and database-readable settings. This proceeds alongside business modules without assuming this Dev/UAT host is the final production topology.
6. **UAT closure:** Exercise complete role/RLS, audit, mobile/responsive and day-to-day scenarios on isolated UAT infrastructure. Record failures and resolve them before calling the web application complete.

## Separate production work

Selection of final backup destination and key escrow, production secrets and topology, WAL/PITR, Storage versioning, retention, off-site copies, and real restore evidence remain under #48. The repository currently has a GitHub Actions backup/restore mechanism tied to a configured transport; that mechanism is infrastructure automation, not the requested in-app Admin Backup & Recovery capability. No current host/container name or Cloudflare route should become an application-level assumption.

The current technical debt most directly blocking wider feature convergence is absent cross-domain outcome commands and unverified Purchasing → Accounts → Finance handoff. The production recovery gaps block a production promotion claim, not Dev/UAT application development.
