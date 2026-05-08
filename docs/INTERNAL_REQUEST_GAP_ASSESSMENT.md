# Internal Request GAP Assessment

Date: 2026-05-08

## Assessment Baseline

Enterprise request-management systems generally converge on the same operating model:

- A service catalog with clear request types, eligibility, required fields, and expected turnaround.
- Structured intake forms that collect enough information for first-touch triage.
- Assignment, ownership, priority, status, and SLA visibility for the operations team.
- Conversation, attachments, and audit history inside the request record.
- Approval and escalation paths for requests with financial, compliance, or policy impact.
- Reporting on volume, backlog, aging, SLA breaches, requester experience, and team performance.

The current Internal Request module already has a stronger foundation than a basic ticket form: company-scoped categories, subcategories, templates, custom form fields, routing rules, attachments, activity tracking, and an admin queue exist. The largest gap is turning those pieces into a complete operating workflow for collaboration, measurement, and governance.

## Current Strengths

- Configurable categories and subcategories for each company.
- Request templates for common intake patterns.
- Dynamic form fields, including database-backed lookup fields.
- Auto-routing rules by category, subcategory, priority, and requester role.
- Attachment upload settings with per-company limits.
- Activity history for status, owner, priority, and resolution note changes.
- Requester and admin views with operational context fields such as business impact, desired outcome, due date, and VSO number.

## Critical Gaps

- Collaboration: requesters and owners could not discuss clarifications inside the request record.
- Attachment visibility: uploaded documents were not visible in the requester/admin review surfaces.
- Audit depth: the activity component only showed three recent events.
- Queue operations: no export for operational review or external reporting.
- SLA maturity: overdue exists only as requested-date logic; there are no category-level response/resolution SLA targets.
- Approval governance: baseline integration is now present; category/template-specific approval rules and escalation policies remain to be added.
- Analytics: no trend, backlog, aging, SLA, or category performance dashboard.
- Self-service lifecycle: requester actions are still limited; cancellation and follow-up uploads remain missing.

## UI/UX Audit

- The Request Workbench already uses an effective master-detail layout, but the detail panel lacked collaboration and document context.
- My Requests was readable but too passive; requesters could not help resolve their own ticket after submission.
- Request Setup is powerful but too large and dense. It should eventually be decomposed into focused setup sections for catalog, forms, routing, attachments, and SLA.
- The queue needs stronger operational affordances: saved views, owner workload, aging buckets, and bulk actions.
- Status language should stay outcome-focused: triage, in progress, awaiting requester, resolved, closed. The current hardcoded status set does not yet support awaiting requester/vendor states.

## Implemented Slice

The first production-safe slice adds essential visibility and collaboration without replacing existing functions:

- Request comments are stored as `ticket_activity` events with `comment_added`.
- RLS now allows scoped activity inserts by the requester, assigned owner, or company admin.
- Request Queue and My Requests both show attachments with signed download links.
- Request Queue and My Requests both include discussion composers.
- Activity history now shows five events by default with an expand control for the full timeline.
- Request Queue can export the current filtered view to CSV.
- Category-level response and resolution SLA targets can be configured for new requests.
- Request Queue and My Requests now show SLA health for first response and resolution targets.
- Queue filtering/export now includes SLA state so breached, at-risk, and unconfigured work can be managed directly.
- Requesters can cancel open, unassigned requests through a scoped self-service action.
- Internal Requests can use the shared approval flow engine via the `internal_request` entity type.
- Requests created while an active Internal Request approval flow exists automatically receive an approval instance.
- Request Workbench and My Requests show approval state; assigned approvers can approve/reject from the workbench.
- Final resolution/closure is blocked while a required approval is pending or rejected.
- Deactivated account deletion was corrected separately by archiving the auth account/profile instead of hard-deleting historical rows.

## Next Enterprise Slices

1. Approval Governance Refinement
   - Link request categories/templates to specific approval flows instead of using only the company-wide active Internal Request flow.
   - Add escalation/delegation policies for overdue approval steps.
   - Add approval history timeline display in the request detail panel.

2. Queue Scale
   - Add pagination/server-side filters for large ticket volumes.
   - Add saved views: My Queue, Unassigned, Breached, High Priority, Awaiting Requester.
   - Add bulk assignment, bulk status update, and CSV export from selected rows.

3. Requester Self-Service
   - Allow follow-up attachments after submission.
   - Add satisfaction rating after resolution.

4. Analytics
   - Add dashboards for volume by category, average resolution time, backlog aging, SLA breaches, and owner workload.

5. Notifications
   - Extend in-app notifications with email copies for assignment, comments, SLA breach, and closure.

## Risk Notes

- `RequestSetup.tsx` is large and should be decomposed before adding more setup complexity.
- Routing rules currently evaluate client-side; a server-side RPC or Edge Function would make routing consistent across all entry points.
- Ticket list calls should be paginated before high-volume rollout.
- Custom field values are JSONB; advanced filtering will need indexes or generated search columns for high-volume use.