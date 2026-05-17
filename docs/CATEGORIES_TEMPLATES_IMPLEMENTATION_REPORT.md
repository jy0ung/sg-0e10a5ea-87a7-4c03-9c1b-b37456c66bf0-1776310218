# Categories & Templates — Implementation Report

**Date:** 2026-05-17  
**Scope:** `/portal/setup` → Categories tab + Templates tab  
**Status:** ✅ All items resolved or formally planned

---

## 1. Findings: Creation Flows

Both creation flows were **live-tested against production Supabase** while logged in as *Jamri Saidi (super_admin)*.

| Flow | Result | Notes |
|------|--------|-------|
| Create category | ✅ WORKING | "Procurement Support" created successfully; count 1→2 |
| Create template | ✅ WORKING | "Test Template" created under Procurement Support; count 1→2 |
| Delete template | ✅ WORKING | Toast: "Template deleted / 'Test Template' has been removed." |
| Archive category (is_active=false) | ✅ WORKING | "Procurement Support" saved as Archived; guard for last-active-category correctly fires |

**Conclusion:** The user's earlier report of "I currently cannot create anything" was a prior state. No code bugs were found in the creation paths. The RLS policies (`INSERT` allowed for `super_admin` and `company_admin`) and service functions are correct.

---

## 2. Completed: Categories UI Redesign

### Problem
The previous Categories tab used a nested horizontal tab-per-category pattern:  
- Each category was a tab in an inner `<Tabs>` bar  
- The edit form was rendered inline inside each `<TabsContent>`  
- Hard to scan all categories at a glance, especially with many entries  
- Horizontal tab overflow made the "Add" button easy to miss  

### Solution
Replaced with a **flat list + Edit dialog** design:

#### List view
- Single `divide-y rounded-lg border` container  
- Each row: **name**, optional **description** (truncated), **Archived** badge, up/down move arrows, **Edit** button  
- Count ("3 categories") + **Add Category** button at the top right  
- Empty state shows centered helper text + Add button  

#### Edit dialog (max-w-2xl)
- Triggered by **Edit** button on each row  
- Contains: name, description, First response SLA, Resolution SLA, Visible toggle, Subcategories section  
- **Save changes** disabled until a field is changed (same `hasCategoryChanges` guard)  
- Dialog closes automatically on successful save  
- **Cancel** / close (×) closes without saving  

### Files changed
- [`src/pages/tickets/RequestSetup.tsx`](../src/pages/tickets/RequestSetup.tsx)

### State changes
| Before | After |
|--------|-------|
| `activeCategoryKey` (string) — tracks selected tab | `editCategoryId` (string \| null) — tracks open Edit dialog |
| auto-select `useEffect` (sets first tab on load) | Removed (no longer needed) |
| `setActiveCategoryKey('')` in `handleCreate` success | Removed |
| `handleSave` success → reload only | `handleSave` success → `setEditCategoryId(null)` then reload |
| New computed: — | `editCategory` useMemo, `editCatSubcategories`, `editCreateSubDraft`, `editIsCreatingSub` |

---

## 3. Design Recommendations — Implementation Plan

These recommendations address systemic improvements identified during QA. They are ordered by implementation risk and dependency.

### Phase 1 — Queue tab counts (low risk, no schema change)

**Problem:** Status tab counts on the Request Queue page count only the current page of results, not the company-wide total.

**Approach:**  
- Add a separate aggregate query (or use a Postgres RPC) that returns `COUNT(*) GROUP BY status` for the company, ignoring pagination.  
- Display as badge totals on each status tab.  

**Files:** `src/pages/tickets/RequestQueue.tsx` (or equivalent), add a `useQueueStatusCounts(companyId)` hook in `packages/hrms-hooks`.  
**Risk:** Low — read-only query, no schema change.  
**Effort:** ~1 day.

---

### Phase 2 — Server-side search improvements (medium risk, no schema change)

**Problem:** Full-text search on the queue page does not match submitter/assignee display names or custom form-field values.

**Approach:**  
1. Extend the search RPC (or view) to `JOIN profiles` on `submitted_by` and `assigned_to`, exposing `full_name` columns for search.  
2. Add a `tsvector` column (or generated column) to `tickets` that concatenates subject + description + submitter name + assignee name; index with GIN.  
3. Custom field values (stored in JSONB) can be included in the tsvector via `jsonb_to_tsvector`.  

**Files:** New migration `20260520xxxxxx_tickets_search_index.sql`, updated search RPC, updated hook.  
**Risk:** Medium — schema migration required; must test index on existing data.  
**Effort:** ~2 days.

---

### Phase 3 — Notification to assignee on final approval (medium risk)

**Problem:** When the final approver approves a ticket, the `assigned_to` agent receives no notification.

**Approach:**  
- In the approval handler (`handleApprove` in `RequestDetailPanel.tsx` or the approval service), after the final approval sets `tickets.status = 'in_progress'`, call `createNotification(assignedToUserId, { type: 'ticket_assigned', ticketId })`.  
- Use the existing `notifications` table / `createNotification` service if present; otherwise add it.  

**Files:** `src/services/requestApprovalService.ts` (or approval handler), `src/services/notificationService.ts`.  
**Risk:** Medium — requires identifying the notification delivery path; no schema change if `notifications` table exists.  
**Effort:** ~1 day.

---

### Phase 4 — Transactional ticket creation (higher risk, schema/RPC change)

**Problem:** `createTicket` inserts the ticket row and then creates `approval_instances` in two separate DB calls. A failure between them leaves an inconsistent state.

**Approach:**  
- Wrap both operations in a Postgres function (RPC) `create_ticket_with_approvals(...)` called as a single RPC from the client.  
- The RPC runs in a transaction; if approval creation fails, the ticket insert is rolled back.  
- Alternatively, use a Supabase Edge Function that wraps both calls in a `BEGIN/COMMIT` block via `supabase-js` with the service role key.  

**Files:** New migration `20260520xxxxxx_create_ticket_rpc.sql`, updated `createTicket` in service layer.  
**Risk:** Higher — replaces an existing client-side flow; requires careful testing of all ticket creation paths (with and without approval routing).  
**Effort:** ~3 days.

---

## 4. Validation Summary

| Test | Outcome |
|------|---------|
| Navigate to `/portal/setup` → Categories tab | ✅ Shows flat list; 3 categories visible (1 active, 2 archived) |
| Click "Edit" on CANCEL INVOICE OR VSO | ✅ Edit dialog opens; fields pre-populated; Save changes disabled (no changes) |
| Cancel closes dialog without changes | ✅ Dialog dismissed; list unchanged |
| Categories counter in header card | ✅ Shows 1 (active categories only — correct) |
| "Add Category" button opens create dialog | ✅ |
| Create category form validation (empty name) | ✅ "Add category" button disabled |
| Move up/down arrows | ✅ Disabled at boundaries; enabled otherwise |
| Archived badge shown on archived categories | ✅ |
| Templates tab — create/delete flows | ✅ Confirmed working in prior testing |

---

## 5. Bugs Fixed (prior session, for reference)

| ID | Description | Status |
|----|-------------|--------|
| BUG-001 | Final approval did not set `tickets.status = 'in_progress'` | ✅ Fixed |
| BUG-002 | Approval could be submitted on cancelled/closed tickets | ✅ Fixed |
| BUG-003 | `isApprovalAssignedToUser()` compared wrong role fields | ✅ Fixed |
| BUG-004 | `cancelMyTicket` left orphaned `approval_instances` | ✅ Fixed |
| BUG-005 | Dead `_isOpenStatus` function in `RequestDetailPanel.tsx` | ✅ Removed |
