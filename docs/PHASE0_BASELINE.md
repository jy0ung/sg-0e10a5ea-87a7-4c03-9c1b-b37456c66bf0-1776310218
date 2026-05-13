# Phase 0 — Baseline Regression Lock

> Generated during Phase 0 of the HRMS Standalone Refactor Plan.
> **Do not modify this file after Phase 1 begins** — it is the frozen baseline used to verify each phase leaves behaviour unchanged.

---

## Build Baseline

| Check | Status |
|---|---|
| `npx tsc --noEmit` (main app) | **PASS** — 0 errors |
| `npm test` (main app) | **PASS** — 419 passed, 28 skipped, 0 failed (57 test files, 3 skipped) |
| `npx tsc --noEmit` (hrms-web) | **27 pre-existing errors** (all in main-app `../../src/` files) |

### hrms-web pre-existing TypeScript errors (baseline — do not regress further)

These errors exist **before** the refactor begins and must be fixed by Phase 5 (type safety hardening).

| File | Error summary |
|---|---|
| `src/services/hrms/leaveService.ts:531` | Insert missing `approval_request_id` field |
| `src/services/hrms/payrollService.ts:222, 258, 375` | `fallback_approver_user_id` not in `approval_steps` generated types; `approval_request_id` missing in insert |
| `src/services/hrms/shared.ts:270` | `fallback_approver_user_id` column not in generated types |
| `src/pages/hrms/HrmsAdmin.tsx:1220–1222` | `CreateHrmsRoleInput` requires `name` to be required, not optional; `.data` accessed on error union |
| `src/pages/hrms/LeaveManagement.tsx:356` | `CreateLeaveRequestInput` requires `leaveTypeId`, called with it optional |
| `src/services/approvalEngineService.ts` | (multiple — see full tsc output) |
| `src/services/approvalFlowService.ts` | (multiple — see full tsc output) |
| `src/services/hrmsAdminService.ts:344` | `"company_id"` not valid column name in that query |
| `src/services/hrms/appraisalService.ts` | (multiple — see full tsc output) |

---

## Main App HRMS Routes (src/main.tsx)

All HRMS routes in the main app delegate to `hrms-web`. The main app owns **no HRMS pages directly** — only redirect/launcher entries.

```
/hrms          → HrmsWorkspaceRedirect (redirects to hrms-web iframe/window)
/hrms/*        → HrmsWorkspaceRedirect (catch-all)
/hrms/admin    → LocationPreservingNavigate → /hrms/settings  (legacy redirect)
/hrms/leave-calendar → LocationPreservingNavigate → /hrms/leave/calendar  (legacy redirect)
```

`HrmsWorkspaceRedirect` is the only true HRMS "page" in the main app — it is a launcher, not a feature page.

---

## hrms-web Routes (apps/hrms-web/src/App.tsx)

`hrms-web` owns all HRMS feature routes. Base path is determined at runtime by `getHrmsRouterBaseName`.

| Route | Component | Role guard |
|---|---|---|
| `/` (index) | `Navigate → /leave` | (none) |
| `/profile` | `ProfilePage` (local) | (none) |
| `/leave` | `LeaveManagement` | `HRMS_LEAVE` |
| `/leave/calendar` | `LeaveCalendar` | `MANAGER_AND_UP` |
| `/attendance` | `AttendanceLog` | `MANAGER_AND_UP` |
| `/approvals` | `ApprovalInbox` | `HRMS_APPROVAL_INBOX` |
| `/appraisals` | `PerformanceAppraisals` | `HRMS_APPRAISALS` |
| `/announcements` | `HrmsAnnouncements` | `MANAGER_AND_UP` |
| `/employees` | `EmployeeDirectory` | `MANAGER_AND_UP` |
| `/payroll` | `PayrollSummary` | `HRMS_PAYROLL` |
| `/settings` | `HrmsAdmin` | `HRMS_ADMIN` |
| `/unauthorized` | `UnauthorizedAccess` | (none) |
| (compatibility redirects) | `LocationPreservingNavigate` | (none) |

---

## hrms-web Cross-App Import Paths (MUST become zero by Phase 7)

All 9 HRMS feature page components are lazy-imported from the **main app's** `@/pages/hrms/*` via the `@/` alias (which resolves to `../../src/`):

```
@/pages/hrms/ApprovalInbox          → ../../src/pages/hrms/ApprovalInbox.tsx
@/pages/hrms/LeaveManagement        → ../../src/pages/hrms/LeaveManagement.tsx
@/pages/hrms/LeaveCalendar          → ../../src/pages/hrms/LeaveCalendar.tsx
@/pages/hrms/AttendanceLog          → ../../src/pages/hrms/AttendanceLog.tsx
@/pages/hrms/PayrollSummary         → ../../src/pages/hrms/PayrollSummary.tsx
@/pages/hrms/PerformanceAppraisals  → ../../src/pages/hrms/PerformanceAppraisals.tsx
@/pages/hrms/Announcements          → ../../src/pages/hrms/Announcements.tsx
@/pages/hrms/EmployeeDirectory      → ../../src/pages/hrms/EmployeeDirectory.tsx
@/pages/hrms/HrmsAdmin              → ../../src/pages/hrms/HrmsAdmin.tsx
```

Non-page imports via `@/` (shared infrastructure — must be provided by hrms-web locally after Phase 7):

```
@/components/ui/*                   (shadcn — will remain shared via monorepo pkg or copied)
@/components/ErrorBoundary
@/components/shared/*
@/components/theme/ThemeProvider
@/contexts/AuthContext
@/contexts/ModuleAccessContext
@/config/env
@/config/routeRoles
@/lib/queryClient
@/services/errorTrackingService
@/pages/ForgotPasswordPage          (auth pages — remain shared)
@/pages/ResetPasswordPage
@/pages/SignUpPage
@/pages/AccountPending
@/pages/NotFound
```

---

## Approval Engine Architecture

### Approver types (from `leaveService.ts`, `shared.ts`)

| `approver_type` value | Resolution |
|---|---|
| `specific_user` | Uses `step.approver_user_id` directly |
| `direct_manager` | Resolves via `resolveDirectManagerApproverUserId(requesterId, companyId)` |
| `role` (default) | Matches users with HRMS role matching `step.approver_role` + company scope |

### Step fields (from `approval_steps` select pattern)

```
id, step_order, name,
approver_type, approver_role, approver_user_id, fallback_approver_user_id,
escalation_rule, condition_rule, is_active, allow_self_approval
```

> **NOTE:** `fallback_approver_user_id` appears in service code but not in generated database types — this is one of the 27 baseline TypeScript errors. The column either does not exist in the DB schema or is missing from the generated types.

### Approval guard pattern (concurrent decision protection)

Every decision `UPDATE` is guarded:

```sql
WHERE step_id = ?
AND status = 'pending'
AND assigned_reviewer_id = ?
```

This pattern exists in `leaveService.ts`, `payrollService.ts`, and `appraisalService.ts` — currently duplicated across all three. Phase 3 will consolidate this into a single `ApprovalEngine` abstraction.

### Services that implement `review*` (all duplicates of the same engine logic)

| Service | Function |
|---|---|
| `src/services/hrms/leaveService.ts` | `reviewLeaveRequest` |
| `src/services/hrms/payrollService.ts` | `reviewPayrollRunFinalisation`, `resubmitPayrollRunFinalisation` |
| `src/services/hrms/appraisalService.ts` | `reviewAppraisal` (inferred) |

### Approval state machine

```
submitted → pending (step N)
  ├─ approved → pending (step N+1) if more steps remain
  │                └─ approved (final) → status = 'approved' on entity
  └─ rejected → status = 'rejected' on entity
  └─ cancelled → status = 'cancelled' on entity (blocks further approval)
```

---

## Phase 0 Stub Tracking Table (Phase 7 gate)

Track each page migration. The `@/` alias flip is **blocked** until all entries show `replaced`.

| Page | Status |
|---|---|
| `LeaveManagement` | stub (still imports `@/pages/hrms/LeaveManagement`) |
| `LeaveCalendar` | stub |
| `ApprovalInbox` | stub |
| `AttendanceLog` | stub |
| `PayrollSummary` | stub |
| `PerformanceAppraisals` | stub |
| `HrmsAnnouncements` | stub |
| `EmployeeDirectory` | stub |
| `HrmsAdmin` | stub |

---

## Regression Checklist

Run after **every phase** before merging. All items must pass.

### Build & types

```bash
npx tsc --noEmit                         # main app — must stay 0 errors
cd apps/hrms-web && npx tsc --noEmit     # hrms-web — must not exceed 27 errors
npm test                                 # must stay 419 passed, 0 failed
npm run build                            # main app production build must succeed
cd apps/hrms-web && npm run build        # hrms-web build must succeed
```

### Functional flows — Leave

```
[ ] Employee can view leave balance
[ ] Employee can submit a full-day leave request
[ ] Employee can submit a half-day leave request
[ ] Employee can attach a file to a leave request
[ ] Employee can cancel a pending leave request
[ ] Manager can view pending leave requests in approval inbox
[ ] Manager can approve a leave request
[ ] Manager can reject a leave request with a note
[ ] Leave balance decreases after approval
[ ] Multi-step approval: step 1 approved → moves to step 2 approver
[ ] GM approval path works end-to-end
[ ] Director approval path works end-to-end
[ ] HR role approval path works end-to-end
[ ] Double-click approval does not create duplicate decisions
[ ] Rejected/cancelled leave cannot be approved
[ ] Leave calendar shows approved leave entries
```

### Functional flows — Payroll

```
[ ] Payroll run list loads for HR role
[ ] Payroll finalisation can be submitted for approval
[ ] Payroll approver can approve finalisation
[ ] Payroll approver can reject finalisation
[ ] Payroll run status updates after decision
[ ] Resubmit after rejection works
```

### Functional flows — Appraisals

```
[ ] Employee can view their appraisal
[ ] Employee can submit self-assessment
[ ] Manager can view team appraisals
[ ] Manager can submit appraisal review
[ ] Appraisal approval flow works end-to-end
```

### Functional flows — Attendance

```
[ ] Manager can view attendance log
[ ] Attendance records load and paginate correctly
```

### Functional flows — Settings (HrmsAdmin)

```
[ ] Department list loads
[ ] Department can be created and edited
[ ] Leave types load
[ ] Leave type can be created and edited
[ ] Public holidays load and can be edited
[ ] HRMS roles load and can be created
[ ] Approval flow configurations load
[ ] Notification settings save correctly
```

### Main app launcher

```
[ ] Main app /hrms route opens HRMS workspace
[ ] Main app legacy /hrms/admin redirect → /hrms/settings works
[ ] Main app legacy /hrms/leave-calendar redirect → /hrms/leave/calendar works
```

---

## Notes for Phase 1

- `HrmsWorkspaceRedirect` in the main app must remain untouched until Phase 8 converts it to an explicit launcher link.
- Do not move any `src/pages/hrms/` files during Phase 1 — Phase 1 is route constants + link surface only.
- The `@/` alias in `apps/hrms-web/vite.config.ts` currently resolves to `../../src`. This is the root cause of the cross-app coupling. **Do not change this alias until Phase 7 step 10, gated on all stub entries above showing `replaced`.**
