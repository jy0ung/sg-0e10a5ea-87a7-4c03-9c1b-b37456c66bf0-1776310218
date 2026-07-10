# Core Ticket State Machine + Use-Case Interface

Status: Approved with minor refinements.
Baseline: `docs/UBS_MODERNIZATION_REPORT.md` captured the modernization analysis; this plan is the post-stabilization implementation spec for the Internal Requests ticket workflow.

## Summary
- Model `draft` as a separate request-draft lifecycle, not as `tickets.status`. Persisted ticket rows still start at `open`.
- Keep approval as a parallel gate: `approval_status = pending` blocks work/completion, but is not a ticket status.
- Make named workflow transitions the primary API; keep manual status override as an audited admin escape hatch only.
- Add first-class `reject_completion`, moving `completed_by_owner -> reopened`.
- Treat SLA pause/resume as first-class transition side effects, not page-local behavior.
- Keep `escalate` same-status for v1: escalation records intent, sends notification, and audits the event without forcing a lifecycle status change.

## Stabilized Baseline
- `ticket_collaborators` is the canonical collaborator model.
- Portal/request migrations, role support, ticket UI regressions, auto-close function coverage, and the RLS test harness have been stabilized.
- Verification baseline includes typecheck, lint, security scans, Vitest, build budget, RLS tests, and Playwright coverage.
- Push-to-deploy remains `main` based: CI runs first, then production deploy builds/pushes the GHCR image and swaps the container.
- App deploy does not apply Supabase migrations or deploy edge functions. Any DB or edge-function change in this workflow needs a coordinated production step outside the normal app image deploy.

## Core Types

```ts
export type PersistedTicketStatus =
  | 'open'
  | 'in_progress'
  | 'pending_requester'
  | 'pending_owner_review'
  | 'completed_by_owner'
  | 'closed'
  | 'reopened'
  | 'cancelled';

export type TicketLifecycleState = 'draft' | PersistedTicketStatus;

export type TicketApprovalStatus =
  | 'none'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type TicketCompletionCategory =
  | 'resolved'
  | 'partially_resolved'
  | 'escalated'
  | 'transferred'
  | 'no_action_needed'
  | 'other';

export type TicketTransitionAction =
  | 'save_draft'
  | 'discard_draft'
  | 'submit_request'
  | 'start_work'
  | 'request_more_info'
  | 'requester_reply'
  | 'complete_by_owner'
  | 'reject_completion'
  | 'close_by_requester'
  | 'auto_close'
  | 'reopen_by_requester'
  | 'cancel_by_requester'
  | 'approve_step'
  | 'reject_step'
  | 'reassign_owner'
  | 'escalate'
  | 'admin_override_status';

export interface TicketActor {
  userId: string | null;
  companyId: string;
  role: string | null;
  isRequester?: boolean;
  canManageQueue?: boolean;
  canAdminOverride?: boolean;
  isSystem?: boolean;
}
```

```ts
export interface TicketTransitionCommand {
  ticketId?: string;
  draftId?: string;
  action: TicketTransitionAction;
  actor: TicketActor;
  payload:
    | { kind: 'save_draft'; values: unknown }
    | { kind: 'discard_draft' }
    | { kind: 'submit_request'; input: CreateTicketInput }
    | { kind: 'start_work'; note?: string }
    | { kind: 'request_more_info'; message: string; pauseSla?: boolean }
    | { kind: 'requester_reply'; message: string }
    | { kind: 'complete_by_owner'; resolutionNote: string; completionCategory: TicketCompletionCategory; checklistConfirmed: boolean; slaBreachReason?: string | null }
    | { kind: 'reject_completion'; reason: string }
    | { kind: 'close_by_requester'; confirmedResolved: true; satisfactionRating: number; feedbackComment?: string | null }
    | { kind: 'auto_close'; autoCloseDays: number }
    | { kind: 'reopen_by_requester'; reason: string }
    | { kind: 'cancel_by_requester'; reason?: string | null }
    | { kind: 'approve_step'; note?: string | null }
    | { kind: 'reject_step'; note?: string | null }
    | { kind: 'reassign_owner'; newOwnerId: string | null; transitionNote: string }
    | { kind: 'escalate'; reason: string; escalationOwnerId?: string | null }
    | { kind: 'admin_override_status'; targetStatus: PersistedTicketStatus; reason: string };
}

export interface TicketTransitionResult {
  ticket: TicketRecord | null;
  draftId?: string | null;
  previousStatus: TicketLifecycleState | null;
  nextStatus: TicketLifecycleState;
  activities: TicketActivityEventType[];
  notificationsQueued: boolean;
}
```

SLA payload rules:
- `request_more_info` defaults to `pauseSla: true` unless explicitly overridden by a future policy.
- `requester_reply` always resumes SLA.
- `complete_by_owner` requires `slaBreachReason` when the ticket is already breached.

```ts
export interface TicketWorkflowUseCases {
  getAvailableActions(ticketOrDraft: TicketRecord | TicketDraftRecord, actor: TicketActor): TicketTransitionAction[];
  canTransition(command: TicketTransitionCommand): Promise<{ ok: true } | { ok: false; reason: string }>;
  transition(command: TicketTransitionCommand): Promise<TicketServiceResult<TicketTransitionResult>>;
}
```

## Transition Table

| Action | From | To | Actor | Required guards |
|---|---|---|---|---|
| `save_draft` | none / `draft` | `draft` | requester | valid user + company |
| `discard_draft` | `draft` | none | requester | draft owned by requester |
| `submit_request` | `draft` | `open` | requester | valid form, category/subcategory active, approval route resolvable |
| `start_work` | `open`, `reopened` | `in_progress` | owner/manager/admin | `approval_status !== 'pending'` and not rejected |
| `request_more_info` | `open`, `in_progress`, `pending_owner_review`, `reopened` | `pending_requester` | owner/manager/admin | message required; pause SLA by default |
| `requester_reply` | `pending_requester` | `pending_owner_review` | requester | message required; resume SLA |
| `complete_by_owner` | `in_progress`, `pending_owner_review`, `reopened` | `completed_by_owner` | owner/manager/admin | approval approved/none, resolution note, category, checklist, breach reason if breached |
| `reject_completion` | `completed_by_owner` | `reopened` | requester | reason required; notify owner/collaborators |
| `close_by_requester` | `completed_by_owner` | `closed` | requester | confirmed resolved, rating 1-5 |
| `auto_close` | `completed_by_owner` | `closed` | system | elapsed configured auto-close days |
| `reopen_by_requester` | `closed` | `reopened` | requester | within `reopen_window_days`, reason required |
| `cancel_by_requester` | `open` with no work started | `cancelled` | requester | allowed if unassigned or approval pending; cancel approval instance |
| `approve_step` | any nonterminal | same status | assigned approver | current approval step pending |
| `reject_step` | any nonterminal | `cancelled` | assigned approver | current approval step pending |
| `reassign_owner` | any nonterminal | same status | manager/admin/current owner | transition note required |
| `escalate` | any nonterminal | same status | owner/manager/admin | reason required; notify/escalate/audit without forcing status change in v1 |
| `admin_override_status` | any | any persisted status | admin | reason required; audited |

SLA pause/resume is a first-class side effect in this table. The transition helper should expose enough metadata for orchestration to record SLA events, queue notifications, and update timestamps consistently.

## Implementation Shape
Phase A - Pure helpers:
- Add a package-owned workflow module under internal requests.
- Implement the transition table, `canTransition`, status normalization, guard helpers, side-effect descriptors, and `getAvailableActions()` as pure functions.
- Exhaustively test action/from-state/actor/payload combinations before touching page flows.

Phase B - Use-case orchestration:
- Add the async `transition()` method and route side effects through one use-case layer: activity, notification, SLA pause/resume, approval integration, owner/collaborator updates, and auto-close metadata.
- Keep approval as a parallel gate by querying/updating `approval_instances`, not by inventing ticket statuses.

Phase C - Compatibility layer:
- Keep `src/services/ticketService.ts` as a compatibility facade initially; it should delegate named transitions to the new workflow module.
- Keep existing `usePersistedDraft` behavior for v1 draft UX, but expose it through draft-facing types so a later server-backed draft store can replace it without changing the workflow API.
- Keep DB triggers/RPCs compatible during migration; do not remove `cancel_own_ticket`, `ticket_reply_and_wait`, or `auto_close_resolved_tickets` until callers are rewired.

Phase D - UI integration:
- Convert UI action availability to `getAvailableActions()` instead of page-local status checks.
- Replace scattered status mutation code with named workflow commands.
- Keep admin override visible only to authorized admin roles and require an audit reason.

Later refinements:
- Consider intention-revealing admin actions such as `force_close` and `force_reopen`, implemented through the same audited override path.
- Revisit escalation only after v1 data shows whether escalation needs to force `in_progress` or `pending_owner_review`.

## Test Plan
- Unit-test every transition: allowed from-states, blocked from-states, actor restrictions, required payload validation.
- Add approval-gate tests: pending approval blocks `start_work` and `complete_by_owner`; rejection cancels the ticket.
- Add SLA tests: pending requester pauses, requester reply resumes, completion requires breach reason when breached.
- Add requester outcome tests: close, reject completion, reopen within/outside window, cancel before work starts.
- Add compatibility tests for legacy status normalization: `awaiting_requester` and `resolved`.
- Add side-effect descriptor tests so transition metadata covers activity events, notifications, approval updates, SLA events, and auto-close scheduling.
- Add facade tests proving existing `ticketService.ts` entry points still call the expected RPCs/use cases during migration.
- Keep Playwright coverage focused on requester, owner/manager, approver, admin override, and auto-close-visible flows.

## Production Rollout Notes
- Ship pure helpers and compatibility facade changes behind existing route behavior first where practical.
- Apply Supabase migrations in a coordinated production step; the app image deploy will not do this for us.
- Deploy/register edge functions, including auto-close changes, as a separate production step and verify `supabase/config.toml` remains exhaustive.
- Refresh generated Supabase types after migrations settle.
- Run the standard gates before merge: typecheck, lint, security scans, Vitest, build budget, RLS tests, and Playwright coverage.
- After merging to `main`, monitor CI, production deploy, production verification/canaries/smoke, and any edge-function smoke relevant to auto-close.

## Assumptions
- `draft` is not added to `tickets.status` in the first implementation.
- `approval_pending` is not a status; it means `approval_status === 'pending'`.
- `auto_close_days` should come from request module settings, not remain hard-coded.
- Manual status override remains available only for admin roles with an audit reason.
- `admin_override_status` is retained as the low-level escape hatch, even if future UI actions expose more intention-revealing names.
