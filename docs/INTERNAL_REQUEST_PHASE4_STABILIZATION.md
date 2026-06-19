# Internal Request Module - Phase 4 Stabilization

Phase 4 is a stabilization, governance, adoption, and continuous-improvement phase. It should not introduce a new feature wave. The objective is to prove that Phase 1 through Phase 3 work reliably across roles, that accountability is visible, and that admins can operate the module without developer intervention.

## 1. End-to-End Workflow Test Matrix

Run this matrix in a pilot company with seeded categories, subcategories, owners, backup owners, managers, and escalation owners.

| Scenario | Expected Result | Evidence |
| --- | --- | --- |
| Requester submits a new request | Ticket starts as `Open`; requester sees it in Pending Requests | Ticket row, activity `request_created` |
| Category selected without subcategory | Description uses category description | New Request form value |
| Subcategory selected | Description uses subcategory description | New Request form value |
| Routing rule matches | Owner / PIC is assigned and responsible queue is `Owner` | Ticket owner, activity owner event |
| No routing rule matches | Ticket appears under `Unassigned` | Queue filter Unassigned |
| Owner or manager opens unassigned ticket | Status changes `Open` to `In Progress`; first response timestamp is set | Ticket status, activity `status_changed` |
| Owner requests more information | Chat message is added; status becomes `Pending Requester` | Chat, activity `owner_requested_more_information` |
| Requester replies | Status becomes `Pending Owner Review` | Chat, activity `requester_update_submitted` |
| Owner marks completed | Resolution summary, completion category, checklist confirmation required; status becomes `Completed by Owner` | Ticket fields, activity `owner_completed_request` |
| Requester closes | Resolution confirmation and satisfaction rating required; status becomes `Closed` | Completed Requests page, closure feedback row |
| Completed separation | Only `Closed` appears in Completed Requests; `Completed by Owner` remains pending requester confirmation | Pending and Completed lists |
| SLA countdown | Response and resolution timers render in queue/detail | SLA summary |
| SLA pause/resume | Pending Requester pauses SLA when configured; requester reply resumes | Activity `sla_paused` / `sla_resumed` where configured |
| SLA at risk | At-risk badge appears below configured threshold | Queue badge, dashboard metric |
| SLA breach | Breached badge appears; breach reason required before completion/closure | Queue badge, completion validation |
| Reopen | Requester provides reason; status becomes `Reopened`; request returns to active queue | Activity `request_reopened`, Pending / Active Requests |
| Chat unread badge | Non-actor sees unread count; opening chat marks read | Chat icon badge and `ticket_chat_reads` |
| Internal notes | Internal users see notes; requester does not | Owner detail vs requester detail |
| Audit trail | System events are separate from chat and include actor/date/metadata | Activity timeline |
| Reporting/export permission | Queue roles can access reports; requester-only users cannot | Route access, report export |

Automated coverage added in Phase 4:

- `ticketService.test.ts`: responsible party and next-action mapping, completion guardrails, closure guardrails, reopen reason guardrail.
- `requestManagementService.test.ts`: aging/bottleneck indicator calculations and bulk-action governance requirements.
- `e2e/tickets.spec.ts`: requester pending page and new request submission across desktop, mobile, and tablet.

## 2. Permission and Accountability Audit

| Action | Requester | Owner / PIC | Backup Owner | Manager | Admin | Escalation Owner | Audit Requirement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create requests | Yes | Yes | Yes | Yes | Yes | Yes | `request_created` |
| View own requests | Yes | Yes | Yes | Yes | Yes | Yes | Route access |
| View department requests | No by default | If queue role | If queue role | Yes | Yes | Yes if configured | Route access |
| View all requests | No | If queue role | If queue role | Yes | Yes | Yes if queue role | Route access |
| Assign owner | No | Queue role only | Queue role only | Yes | Yes | Yes if queue role | `owner_changed` |
| Reassign owner | No | Queue role only | Queue role only | Yes | Yes | Yes if queue role | `owner_changed` |
| Mark completed | No | Yes when managing workflow | Yes when acting as owner | Yes | Yes | Yes if assigned/escalated | `owner_completed_request` |
| Close request | Requester only | No | No | No | Admin override only | No | `requester_closed_request` |
| Reopen request | Requester only, within window | No | No | No | Admin override/manual future policy | No | `request_reopened` |
| View internal notes | No | Yes | Yes | Yes | Yes | Yes | RLS and UI separation |
| Add internal notes | No | Yes | Yes | Yes | Yes | Yes | `internal_note_added` |
| Export reports | No | Queue role only | Queue role only | Yes | Yes | Yes if queue role | Report/export audit recommended |
| Configure SLA rules | No | No | No | No | Yes | No | Configuration audit |
| Configure assignment rules | No | No | No | No | Yes | No | Configuration audit |
| Override status manually | No | No | No | Admin only by policy | Yes with reason | No | `admin_manual_override` |
| Access admin configuration | No | No | No | No | Yes | No | Route access |

Route-level enforcement currently uses:

- `PORTAL_QUEUE_ROLES` for Manager Dashboard, Pending / Active Requests, Completed Requests admin history, and Reports.
- `PORTAL_SETUP_ROLES` for Request Setup and module configuration.
- Supabase RLS policies for requester-owned data, internal notes, saved filters, and tenant scoping.

## 3. Data and Configuration Review

Review these before pilot launch:

- Categories and subcategories: remove duplicate categories, ensure labels match how users describe work.
- Descriptions: category descriptions should be short enough to work as default request descriptions.
- Smart form fields: keep Phase 1 pilot forms minimal; mark fields required only when they materially improve routing or resolution.
- SLA rules: start with fewer SLA tiers, then tune after pilot metrics show actual handling time.
- SLA pause rules: keep Pending Requester pause enabled for the pilot unless management wants elapsed customer-wait time included.
- Assignment rules: each active category should have a primary owner or a clear fallback queue.
- Backup and escalation rules: configure for high-priority categories first.
- Priority matrix: define examples for low, medium, and high so requesters do not over-select high.
- Notification templates: avoid duplicate alerts; prioritize assignment, requester action needed, SLA at-risk, SLA breached, owner completed, requester closed.
- Reopen window: recommended pilot default is 14 days.
- Closure rules: require satisfaction rating; require breach reason on breached requests.

## 4. Pilot Rollout Plan

Start with a narrow pilot:

- Departments: 1-2 high-volume departments.
- Categories: 3-5 categories with clear owners.
- Owners: primary and backup owner for each pilot category.
- Managers: one operational manager to review workload and SLA dashboard daily.
- Requesters: limited requester group that submits real requests for two weeks.

Track these metrics weekly from Manager Dashboard and Reports:

- Total submitted requests.
- Unassigned requests.
- Average first response time.
- Average resolution time.
- SLA breached requests.
- At-risk requests.
- Pending Requester requests.
- Pending Owner Review requests.
- Completed requests.
- Reopened requests.
- Requester satisfaction.
- Most common request categories.
- Most common bottlenecks: stuck, inactive, handovers, pending requester, pending owner.

Pilot operating cadence:

1. Daily owner review: clear Unassigned, SLA breached, and At Risk first.
2. Twice-weekly manager review: inspect workload by owner and oldest pending requests.
3. Weekly admin review: tune routing, required fields, SLA thresholds, and templates.
4. End-of-pilot review: compare metrics to qualitative feedback and approve wider rollout or another tuning cycle.

## 5. User Guides

### Requester Guide

- Use New Request to submit work to an internal owner.
- Request title is configured as Customer Name by default.
- Choose category and subcategory carefully; these drive description defaults, smart fields, SLA, and ownership.
- Use chat for human conversation and attachments.
- When status is `Pending Requester`, you must reply or amend the request.
- When status is `Completed by Owner`, review the resolution and click Close if resolved.
- Closed requests move to Completed Requests.
- Reopen only when the issue returns within the configured reopen window; a reason is mandatory.

### Owner / PIC Guide

- Open tickets from Pending / Active Requests.
- Opening an unassigned Open ticket can assign it and move it to In Progress.
- Use Need more information when requester input is required; this moves the request to Pending Requester.
- Keep internal notes for owner/manager-only context. Do not put requester-facing messages in internal notes.
- Mark as completed only after resolution summary, completion category, checklist confirmation, and breach reason where required.
- Monitor SLA badges, stuck indicators, inactive indicators, and oldest pending requests.

### Manager Guide

- Use Manager Dashboard for daily visibility into workload and SLA exposure.
- Review Unassigned, SLA breached, At Risk, Pending Requester, and Pending Owner Review.
- Use workload by owner to rebalance assignments.
- Use reports to inspect category volume, aging, owner performance, breach reasons, reopen rates, and satisfaction.
- Use bulk notifications sparingly and only with clear action-oriented messages.

### Admin Guide

- Configure categories, descriptions, smart forms, routing, SLA rules, fallback queue, reopen window, closure rules, notification templates, priority matrix, allowed file types, and role permissions in Request Setup.
- Keep smart forms concise during pilot.
- Every category should have primary owner, backup owner, escalation owner, or explicit fallback queue.
- Manual status override should be rare and must include a reason.
- Review audit trail after configuration changes and bulk operations.

## 6. Post-Pilot Optimization Review

After pilot feedback, recommend changes in these areas:

- Workflow clarity: statuses users misunderstand, missing next-action language, unclear ownership.
- User experience: fields that requesters skip or repeatedly misinterpret.
- Assignment accuracy: categories falling to Unassigned, frequent reassignments, owner workload imbalance.
- SLA effectiveness: unrealistic thresholds, frequent pauses, repeated breaches, missing breach reasons.
- Notification frequency: alerts users ignore, missing alerts that caused delays.
- Dashboard usefulness: metrics managers use daily vs metrics that add noise.
- Report accuracy: reports that need additional filters, grouping, or exported columns.
- Permission control: users who need queue access vs users with excessive access.
- Audit trail completeness: actions missing actor, reason, previous value, or new value.

## 7. Phase 4 Success Criteria

Phase 4 is complete when:

- Requests move correctly through the automated status flow.
- Every active request has Current Responsible Party and Next Action.
- SLA tracking, pause, resume, at-risk, and breach indicators work.
- Audit trail records important workflow, ownership, SLA, note, closure, reopen, bulk, and override actions.
- Requesters can submit, reply, close, and reopen with minimal support.
- Owners can resolve requests without manual status edits.
- Managers can monitor workload and SLA performance from dashboard and reports.
- Admins can maintain core configuration without developer support.
- Pilot users confirm the module is usable and reliable.
