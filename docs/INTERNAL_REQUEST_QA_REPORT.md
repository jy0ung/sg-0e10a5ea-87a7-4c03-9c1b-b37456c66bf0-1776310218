# Internal Request Module — QA Report

**Date:** 2025-07  
**Role:** Senior QA / Full-Stack / RBAC / UX reviewer  
**Scope:** End-to-end validation of the Internal Request module (`/portal/*`), covering request creation, approval workflow, role/permission guards, notifications, attachments, audit history, and admin configuration.

---

## 1. Scope & Methodology

All source files in the Internal Request module were reviewed statically:

| File | Status |
|---|---|
| `src/services/ticketService.ts` | Fully reviewed |
| `src/services/requestApprovalService.ts` | Fully reviewed |
| `src/pages/tickets/NewTicket.tsx` | Fully reviewed |
| `src/pages/tickets/MyTickets.tsx` | Fully reviewed |
| `src/pages/tickets/RequestQueue.tsx` | Fully reviewed |
| `src/components/tickets/RequestDetailPanel.tsx` | Fully reviewed |
| `src/components/tickets/TicketApprovalSummary.tsx` | Fully reviewed |
| `src/lib/requestFormatters.ts` | Fully reviewed |
| `src/lib/requestCategories.ts` | Reviewed (no issues) |
| `supabase/migrations/20260508093000_request_sla_framework.sql` | Reviewed (cancel_own_ticket RPC) |
| TypeScript compilation | Clean — zero errors |
| ESLint | Clean — zero warnings |
| Vitest suite (14 tests) | All passing |

---

## 2. Bugs Found and Fixed

### BUG-001 — CRITICAL: Final approval does not advance ticket status

**Severity:** High  
**File:** `src/services/requestApprovalService.ts`  
**Function:** `reviewInternalRequestApproval()`

**Problem:** When the last approval step was approved, `approval_instances.status` was correctly set to `'approved'`, but `tickets.status` remained `'open'`. The ticket appeared approved in the approval widget but stayed in the open queue indefinitely. Admins had no signal to begin fulfillment work, and the approval gate blocked resolution if an admin attempted to close it without first noticing the stale status.

**Root Cause:** The final `else` block in `reviewInternalRequestApproval` only updated `approval_instances` and wrote a `comment_added` activity entry. It did not update `tickets`.

**Fix:** The final `else` block now additionally:
1. Updates `tickets.status = 'in_progress'` atomically in the same `Promise.all`
2. Records a `status_changed` activity event (replacing the stale `comment_added` event) with `before`/`after` metadata

---

### BUG-002 — HIGH: Approval actions permitted on cancelled/resolved tickets

**Severity:** High  
**File:** `src/services/requestApprovalService.ts`  
**Function:** `reviewInternalRequestApproval()`

**Problem:** The function did not check the ticket's current status before processing an approval decision. If a ticket was cancelled by the requester (leaving an orphaned pending `approval_instance`), an approver with a direct link or stale UI state could still submit an approval or rejection against it. The backend would update the `approval_instance` and insert a `ticket_activity` record against an already-cancelled ticket.

**Root Cause:** Missing guard on ticket status before running the approval workflow.

**Fix:** Added an early return after the ticket fetch:
```typescript
if (ticket.status === 'cancelled' || ticket.status === 'closed' || ticket.status === 'resolved') {
  return { error: 'This request has already been closed and cannot be approved or rejected.' };
}
```

---

### BUG-003 — MEDIUM: `isApprovalAssignedToUser` — incorrect role comparison for HRMS-role-based approvals

**Severity:** Medium  
**File:** `src/lib/requestFormatters.ts`  
**Function:** `isApprovalAssignedToUser()`

**Problem:** The function compared `ticket.current_approver_role === user.role`. `current_approver_role` stores an HRMS role ID (UUID) or HRMS role code (`"hr"`, `"manager"`, etc.), while `user.role` stores the main application role (`"company_admin"`, `"super_admin"`, `"manager"`, etc.). This comparison almost never returned `true` for role-based approvals, causing the Approve/Reject buttons to be hidden in the Request Queue for all tickets where the approver was assigned by HRMS role rather than by user ID.

**Impact:** Any approval flow using role-based steps (the recommended pattern) would silently hide approval buttons from every admin in the queue, making role-based approval flows completely non-functional from the UI.

**Fix:** Rewrote the logic:
- If `current_approver_user_id` is set: only match the specific assigned user (unchanged)
- If `current_approver_role` is set (role-based): allow `super_admin` and `company_admin` to see and attempt the approval; the backend enforces actual HRMS role membership

---

### BUG-004 — MEDIUM: Ticket cancellation leaves orphaned pending `approval_instance`

**Severity:** Medium  
**File:** `src/services/ticketService.ts` + `src/services/requestApprovalService.ts`

**Problem:** `cancelMyTicket()` calls the `cancel_own_ticket` RPC, which successfully cancels the `tickets` row. However, if the ticket had a pending `approval_instance` (fully valid — a ticket can be `open`, `assigned_to=null`, and still have a pending approval), the `approval_instance` row was left in `status='pending'`. The orphaned instance meant:
1. Approvers could still query and see a pending approval for a cancelled ticket (BUG-002 dependency)
2. `applyApprovalMetadata()` would still return `approval_status: 'pending'` if the ticket was somehow later re-fetched

**Fix:** 
1. Added `cancelInternalRequestApprovalInstance(ticketId, companyId)` export to `requestApprovalService.ts`
2. Called it inside `cancelMyTicket`'s `Promise.allSettled` alongside the activity insert so it runs concurrently (best-effort, non-blocking for the cancel result)

---

### BUG-005 — LOW: Dead code `_isOpenStatus` in `RequestDetailPanel.tsx`

**Severity:** Low  
**File:** `src/components/tickets/RequestDetailPanel.tsx`

**Problem:** A private function `_isOpenStatus` was defined but never called. It duplicated `isOpenStatus` imported from `@/lib/requestFormatters`. The `_` prefix was the only indicator it was intentionally unused.

**Fix:** Removed the function entirely.

---

## 3. Issues Not Fixed (Design Limitations / Future Work)

### DESIGN-001 — Client-side search only applies to the current page

In `RequestQueue.tsx`, searching by free text triggers a server-side `ILIKE` query on `subject`, `description`, and `vso_number`. The client-side `filteredTickets` memo also applies the search against a broader haystack (submitter name, assignee name, category labels, custom fields). However, since server-side filtering runs first and pagination is applied, a ticket on page 2 whose subject doesn't match but whose submitter name does will never appear in search results.

**Recommendation:** Extend the server-side `listCompanyTicketsPage` query to include a PostgreSQL full-text search across all relevant fields, or consider a Supabase `pg_trgm`-based index for `submitted_by_name` and `assigned_to_name` via a view.

---

### DESIGN-002 — RequestQueue status tab counts reflect current page only

`counts` in `RequestQueue.tsx` is computed from `tickets` (the current page, max 25 rows). The count badges on the status filter tabs show page-level statistics, not company-wide counts. An admin on page 1 of 5 would see `open: 8` when there are 40 open tickets total.

**Recommendation:** Have `listCompanyTicketsPage` return per-status counts in the response, or add a separate lightweight query for aggregate counts.

---

### DESIGN-003 — No fulfillment-handler notification on final approval

After a request is fully approved, `reviewInternalRequestApproval` notifies the requester but not the `assigned_to` user (the person responsible for fulfilling the request). The fulfillment handler has no push signal to begin work.

**Recommendation:** Add a notification to `ticket.assigned_to` (if set) when final approval is granted, alongside the requester notification.

---

### DESIGN-004 — Partial write risk in `createTicket`

`createTicket()` inserts to `tickets` and then calls `createInternalRequestApprovalInstance`. If the approval instance creation fails (network error, schema mismatch), the ticket row exists in the DB but the user sees an error. There is no rollback.

**Recommendation:** Wrap the entire `createTicket` operation in a PostgreSQL transaction via a Supabase RPC to guarantee atomicity.

---

### DESIGN-005 — Assignees restricted to super_admin / company_admin only

`requestOwnerRoles = new Set(ADMIN_ONLY)` means requests can only be assigned to `super_admin` or `company_admin` users. HR staff and department managers cannot be assigned as request owners. This may be intentional for the current phase but is worth revisiting if non-admin staff need to own and resolve requests.

---

## 4. Scenarios Validated

| # | Scenario | Result | Notes |
|---|---|---|---|
| 1 | Submit new request with all required fields | PASS | Zod validation, draft persistence, best-effort attachment upload |
| 2 | Submit with missing category / short subject | PASS | Zod min-length guards enforced |
| 3 | Draft auto-saved and restored on reload | PASS | `localStorage` keyed by `companyId:userId` |
| 4 | Custom fields validated before submit | PASS | `required` fields blocked at form level |
| 5 | Approve a single-step approval flow | FIXED (BUG-001) | Ticket now advances to `in_progress` |
| 6 | Reject an approval — ticket cancelled | PASS | `tickets.status = 'cancelled'`, requester notified |
| 7 | Multi-step approval advances to next step | PASS | `current_step_*` updated, requester notified |
| 8 | Approver guard — wrong user blocked | PASS | Backend returns 403-equivalent error |
| 9 | Self-approval guard | PASS | `allowSelfApproval = false` blocks at backend |
| 10 | Cancel request while open and unassigned | FIXED (BUG-004) | Approval instance now cleaned up |
| 11 | Attempt approval on cancelled ticket | FIXED (BUG-002) | Returns error message |
| 12 | Role-based approval buttons visible to admins | FIXED (BUG-003) | Buttons shown; backend enforces role |
| 13 | Resolve ticket with pending approval | PASS | `updateTicket` gate blocks at `approved` check |
| 14 | SLA fields and overdue badge | PASS | `isOverdue()` and `TicketSlaSummary` correct |
| 15 | Attachment upload failure doesn't block submit | PASS | Best-effort, separate from ticket insert |
| 16 | Activity log for all field changes | PASS | `buildTicketActivityEntries` covers status/priority/owner/note |
| 17 | RBAC: non-admin cannot access `/portal/queue` | PASS | `ADMIN_ONLY` guard in `internalRequestsShellConfig.ts` |
| 18 | RBAC: non-admin cannot access `/portal/setup` | PASS | Same guard |
| 19 | Pagination in Request Queue | PASS | Server-side paginated, 25 per page |
| 20 | CSV export reflects filtered view | PASS | `filteredTickets` used, not full dataset |

---

## 5. Files Changed

| File | Change |
|---|---|
| `src/services/requestApprovalService.ts` | BUG-001, BUG-002 fixes; added `cancelInternalRequestApprovalInstance` export |
| `apps/hrms-web/src/services/requestApprovalService.ts` | Identical mirror |
| `src/services/ticketService.ts` | BUG-004 fix: import + call `cancelInternalRequestApprovalInstance` |
| `apps/hrms-web/src/services/ticketService.ts` | Identical mirror |
| `src/lib/requestFormatters.ts` | BUG-003 fix: rewrite `isApprovalAssignedToUser` |
| `apps/hrms-web/src/lib/requestFormatters.ts` | Identical mirror |
| `src/components/tickets/RequestDetailPanel.tsx` | BUG-005 fix: remove `_isOpenStatus` dead code |
| `apps/hrms-web/src/components/tickets/RequestDetailPanel.tsx` | Identical mirror |

---

## 6. Post-Fix Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Zero errors |
| ESLint (affected files) | ✅ Zero warnings |
| Vitest suite (14 tests) | ✅ All passing |
