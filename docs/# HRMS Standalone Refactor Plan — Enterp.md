# HRMS Standalone Refactor Plan — Enterprise-Safe Version

## Document Purpose

This document defines the corrected refactor plan for the HRMS architecture in the current repo.

The corrected product boundary is:

> HRMS is a standalone application.  
> The main app should only contain links, launcher cards, and navigation entries that bring users into the HRMS app.

This means the main app should **not** render HRMS modules internally. Clicking HRMS modules from the main app should route users into `apps/hrms-web`, either through same-domain routes such as `/hrms/leave` or through a separate deployment such as `https://hrms.company.com/leave`.

---

## Executive Summary

The HRMS refactor should not be treated as a visual redesign first. It should be treated as a controlled platform-boundary migration.

The target is to make HRMS:

- standalone
- independently routed
- independently deployable
- domain-owned by `apps/hrms-web`
- powered by shared HRMS services
- powered by shared HRMS hooks
- protected by a reusable approval engine
- type-safe at Supabase service boundaries
- reachable from the main app through links only

The main app becomes a **launcher shell** for HRMS. It should not own HRMS workflows, pages, settings, or approval inbox screens.

---

# Corrected Target Architecture

```txt
apps/
  main-app/
    HRMS launcher cards only
    HRMS sidebar/menu links only
    HRMS deep links only
    no HRMS module ownership
    no HRMS workflow rendering

  hrms-web/
    standalone HRMS application
    owns all HRMS pages
    owns HRMS routes
    owns HRMS layout
    owns HRMS module navigation
    owns HRMS settings UI
    owns HRMS approval inbox UI

  hrms-mobile/
    mobile HRMS consumer
    consumes shared HRMS packages

packages/
  hrms-services/
    shared HRMS domain logic
    approval engine
    service contracts
    database-facing operations

  hrms-hooks/
    shared React Query hooks
    query keys
    mutation hooks
    cache invalidation contracts

  hrms-schemas/
    shared validation schemas

  supabase/
    generated database types
    Supabase client helpers

  types/
    shared domain types

src/
  pages/hrms/
    temporary redirect wrappers only during migration
    should be removed after cutover if no longer needed

  services/hrms/
    temporary backward-compatible wrappers only during migration
    should be retired once HRMS consumers use packages/hrms-services
```

---

# Main App vs HRMS App Responsibility Matrix

| Area | Main App | HRMS App |
|---|---:|---:|
| HRMS dashboard rendering | No | Yes |
| Leave application page | No | Yes |
| Leave approval page | No | Yes |
| Attendance module | No | Yes |
| Payroll module | No | Yes |
| Appraisal module | No | Yes |
| Approval inbox | No | Yes |
| HRMS settings | No | Yes |
| HRMS role settings | No | Yes |
| HRMS module navigation | Link only | Full navigation |
| HRMS service calls | Avoid, except migration wrappers | Yes |
| Shared HRMS business logic | Consume via package only if needed | Consume via package |
| Main app shortcut cards | Yes | Optional |
| Deep links into HRMS | Yes | Yes |

---

# Approved Navigation Model

The main app may expose HRMS entry points such as:

```txt
Main App Dashboard
  ├── HRMS Overview card → /hrms
  ├── Leave Management card → /hrms/leave
  ├── Approval Inbox card → /hrms/approvals
  ├── Attendance card → /hrms/attendance
  ├── Payroll card → /hrms/payroll
  ├── Appraisals card → /hrms/appraisals
  └── HRMS Settings card → /hrms/settings
```

Depending on deployment, the URL target may be:

## Same-domain deployment

```txt
/main-dashboard
/hrms
/hrms/leave
/hrms/approvals
/hrms/attendance
/hrms/payroll
/hrms/appraisals
/hrms/settings
```

## Subdomain deployment

```txt
https://app.company.com
https://hrms.company.com
https://hrms.company.com/leave
https://hrms.company.com/approvals
https://hrms.company.com/attendance
https://hrms.company.com/payroll
https://hrms.company.com/appraisals
https://hrms.company.com/settings
```

The final deployment choice can be decided later. The architectural rule is the same:

> HRMS pages are owned by `apps/hrms-web`, not by the main app.

---

# Phase 0 — Baseline and Regression Lock

Before changing architecture, freeze the current behavior.

## Tasks

1. Run current checks:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm --filter hrms-web build
```

2. Document current HRMS routes in both:

```txt
main app
apps/hrms-web
```

3. Document every current HRMS import path used by `apps/hrms-web`.

4. Document all HRMS role flows:

```txt
Employee
Manager
General Manager
Director
HR
Admin
```

5. Document approval chains:

```txt
Employee → Manager → GM → HR
Manager → GM → HR
GM → Director → HR
```

6. Create a regression checklist for:

```txt
Leave request submission
Leave attachment upload
Leave approval
Leave rejection
Leave cancellation
Leave balance refresh
Approval inbox refresh
Payroll finalisation review
Payroll finalisation resubmission
Appraisal review
HRMS settings
Role permissions
RLS permission enforcement
```

7. Identify which main-app HRMS pages are true pages and which can become redirect wrappers.

## Done Criteria

```txt
Current build status is known.
Current failing tests, if any, are documented.
Current HRMS routes are mapped.
Current HRMS imports are mapped.
Existing approval behavior is documented.
Regression checklist exists before refactor begins.
```

---

# Phase 1 — Define Standalone HRMS Boundary

This phase creates the product and routing boundary before moving implementation details.

## Boundary Rules

The main app must not own HRMS module screens.

Forbidden long-term ownership in the main app:

```txt
LeaveManagement page
ApprovalInbox page
Attendance page
Payroll page
Appraisal page
HRMS Settings page
HRMS Role Settings page
HRMS Approval Flow Settings page
```

Allowed main-app HRMS behavior:

```txt
HRMS launcher card
HRMS sidebar link
HRMS module deep link
HRMS notification count link
redirect wrapper during migration
```

## Tasks

1. Define final HRMS route contract:

```txt
/hrms
/hrms/leave
/hrms/leave/apply
/hrms/leave/my-requests
/hrms/leave/approvals
/hrms/approvals
/hrms/attendance
/hrms/payroll
/hrms/payroll/approvals
/hrms/appraisals
/hrms/appraisals/reviews
/hrms/announcements
/hrms/employees
/hrms/settings
```

2. Decide whether the repo will support:

```txt
same-domain HRMS deployment
subdomain HRMS deployment
both through environment config
```

3. Add route config constants so main app links do not hardcode URLs everywhere.

Example:

```ts
export const hrmsRoutes = {
  root: '/hrms',
  leave: '/hrms/leave',
  approvals: '/hrms/approvals',
  attendance: '/hrms/attendance',
  payroll: '/hrms/payroll',
  appraisals: '/hrms/appraisals',
  settings: '/hrms/settings',
};
```

4. Convert main-app HRMS module buttons/cards to deep links, not internal module renders.

## Done Criteria

```txt
Main app HRMS responsibility is link-only.
HRMS route contract is documented.
Deep-link constants exist.
No new HRMS module UI should be added to the main app.
```

---

# Phase 2 — Create Modular HRMS Service Architecture

Do **not** move everything into `packages/hrms-services/src/index.ts`.

That would create a god-file and make the package harder to scale.

## Target Structure

```txt
packages/hrms-services/src/
  index.ts

  approval/
    approvalEngine.ts
    approvalRepository.ts
    approvalRouting.ts
    approvalTypes.ts
    approvalAudit.ts

  leave/
    leaveService.ts
    leaveMapper.ts
    leaveTypes.ts

  payroll/
    payrollService.ts
    payrollMapper.ts
    payrollTypes.ts

  appraisal/
    appraisalService.ts
    appraisalMapper.ts
    appraisalTypes.ts

  attendance/
    attendanceService.ts
    attendanceMapper.ts

  employee/
    employeeService.ts
    employeeMapper.ts

  announcement/
    announcementService.ts
    announcementMapper.ts

  settings/
    hrmsSettingsService.ts
    roleSettingsService.ts
    approvalFlowSettingsService.ts

  shared/
    errors.ts
    result.ts
    identity.ts
    supabaseClient.ts
```

## Export Pattern

`index.ts` should only export modules:

```ts
export * from './approval/approvalEngine';
export * from './leave/leaveService';
export * from './payroll/payrollService';
export * from './appraisal/appraisalService';
export * from './attendance/attendanceService';
export * from './employee/employeeService';
export * from './announcement/announcementService';
export * from './settings/hrmsSettingsService';
```

## Tasks

1. Create the folder structure.
2. Move shared identity helpers into `shared/identity.ts`.
3. Move common Supabase access into `shared/supabaseClient.ts`.
4. Keep public exports stable through `index.ts`.
5. Do not change UI yet.
6. Do not change routing yet unless required by Phase 1 launcher links.

> **Scope note — settings module:** `HrmsAdmin.tsx` in the main app embeds departments, leave types, public holidays, HRMS roles, approval flow config, and notification settings in a single file. Moving these to `packages/hrms-services/src/settings/` in Phase 4 will be broader than the payroll or leave domains. Budget extra time for this domain during Phase 4 service consolidation.

## Done Criteria

```txt
Package structure exists.
index.ts is not a dumping ground.
Existing imports still compile.
No behavior change yet.
```

---

# Phase 3 — Extract Approval Engine Properly

This is the highest-value refactor.

Approval should become a reusable HRMS domain capability, not duplicated inside leave, payroll, appraisal, or internal request services.

## Target Modules

```txt
approvalEngine.ts
  submitApprovalDecision()
  bootstrapApprovalInstanceForEntity()
  advanceApprovalStep()
  rejectApprovalInstance()
  cancelApprovalInstance()
  getApprovalInbox()

approvalRouting.ts
  resolveStepRouting()
  resolveRequiredProfileId()
  userHasAssignedHrmsRole()

approvalRepository.ts
  readApprovalInstance()
  readApprovalSteps()
  updateApprovalStep()
  updateApprovalInstance()
  updateEntityApprovalStatus()

approvalAudit.ts
  emitApprovalAuditEvent()
```

## Audit Logging Requirement

Do **not** silently strip audit logging.

Use an audit adapter or domain event pattern.

Example:

```ts
export type ApprovalAuditAdapter = {
  logApprovalAction(event: ApprovalAuditEvent): Promise<void>;
};
```

Example usage:

```ts
await submitApprovalDecision(input, {
  auditAdapter,
});
```

This keeps audit behavior portable across:

```txt
main app
hrms-web
hrms-mobile
tests
future backend API
```

## Concurrency Requirement

Approval decisions must be safe against:

```txt
double-click approval
stale browser tab approval
two managers approving the same step
rejection after approval
approval after cancellation
partial workflow update
```

Every approval update should be guarded by current state:

```sql
WHERE step_id = ?
AND status = 'pending'
AND assigned_reviewer_id = ?
```

Move the final approval decision into a PostgreSQL RPC (`submit_approval_decision()`) if QA regression testing surfaces a double-approval during Phase 3 verification. Until that trigger is hit, guarded client-side updates with explicit failure handling are sufficient. Do not defer indefinitely without a clear condition — if the RPC is not built during Phase 3, add it as a Phase 3 stretch task with a ticket so it cannot become a permanent `// TODO`.

## Done Criteria

```txt
Leave, payroll, appraisal, and internal request approval flows can call the same approval engine.
Approval routing logic is not duplicated.
Audit logging is preserved through adapter/event.
Double approval is blocked.
Rejected/cancelled records cannot be approved afterward.
```

---

# Phase 4 — Consolidate HRMS Services into `packages/hrms-services`

Move business operations from:

```txt
src/services/hrms/*
```

into:

```txt
packages/hrms-services/src/*
```

Keep wrappers in `src/services/hrms/*` only for migration compatibility.

## Pattern

Package service:

```ts
export async function reviewLeaveRequest(input: ReviewLeaveInput) {
  // throw-style service
}
```

Main-app wrapper:

```ts
export async function reviewLeaveRequestWrapper(input) {
  try {
    const data = await reviewLeaveRequest(input);
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
```

## Move Order

```txt
1. shared helpers
2. approval engine
3. leave service
4. payroll service
5. appraisal service
6. attendance service
7. employee service
8. announcement service
9. HRMS settings services
10. role settings services
11. approval flow settings services
```

## Important Rule

Because HRMS is standalone, do not keep adding new business logic into:

```txt
src/services/hrms/*
```

That directory should shrink over time.

## Done Criteria

```txt
packages/hrms-services owns HRMS domain logic.
src/services/hrms contains compatibility wrappers only.
Main app still works as a launcher.
hrms-web still works.
hrms-mobile still works.
No direct business logic remains duplicated in src/services/hrms.
```

---

# Phase 5 — Type Safety Hardening

This phase should run after the service structure is clean.

## Target

Replace unsafe mapper code like:

```ts
r as Record<string, unknown>
```

with generated Supabase row types.

## Add Exports

In `packages/supabase/src/index.ts` or a dedicated `rowTypes.ts`:

```ts
export type LeaveRequestRow =
  Database['public']['Tables']['leave_requests']['Row'];

export type PayrollRunRow =
  Database['public']['Tables']['payroll_runs']['Row'];

export type PayrollItemRow =
  Database['public']['Tables']['payroll_items']['Row'];

export type EmployeeRow =
  Database['public']['Tables']['employees']['Row'];

export type ProfileRow =
  Database['public']['Tables']['profiles']['Row'];

export type ApprovalInstanceRow =
  Database['public']['Tables']['approval_instances']['Row'];

export type ApprovalStepRow =
  Database['public']['Tables']['approval_steps']['Row'];
```

## Apply Order

```txt
1. approval mappers
2. leave mappers
3. payroll mappers
4. appraisal mappers
5. attendance mappers
6. employee mappers
7. announcement mappers
8. settings mappers
```

## Important Rule

`untypedSupabase` is allowed only as a temporary bridge.

Every usage must have a reason:

```ts
// TODO: Replace untypedSupabase after join shape is represented in Database types.
```

## Done Criteria

```txt
Core HRMS mappers use generated Database types.
Record<string, unknown> usage is reduced or justified.
Column rename errors surface at compile time.
TypeScript passes.
```

---

# Phase 6 — Create Shared `packages/hrms-hooks`

Do not put the final hook layer under:

```txt
src/hooks/hrms
```

That keeps it trapped inside the main app.

## Target Structure

```txt
packages/hrms-hooks/src/
  index.ts
  queryKeys.ts

  leave/
    useLeaveRequests.ts
    useLeaveBalances.ts
    useSubmitLeaveRequest.ts
    useReviewLeave.ts

  approval/
    useApprovalInbox.ts
    useApprovalDecision.ts

  payroll/
    usePayrollRuns.ts
    useReviewPayroll.ts

  appraisal/
    useAppraisals.ts
    useReviewAppraisal.ts

  attendance/
    useAttendanceLogs.ts
    useAttendanceSummary.ts

  employee/
    useEmployees.ts

  settings/
    useHrmsSettings.ts
    useRoleSettings.ts
    useApprovalFlowSettings.ts
```

## Query Key Factory

```ts
export const leaveKeys = {
  all: (companyId: string) => ['hrms', 'leave', companyId] as const,
  requests: (companyId: string, filters?: unknown) =>
    [...leaveKeys.all(companyId), 'requests', filters] as const,
  balances: (employeeId: string, year: number) =>
    ['hrms', 'leave', 'balances', employeeId, year] as const,
};

export const approvalKeys = {
  inbox: (companyId: string, reviewerId?: string) =>
    ['hrms', 'approval', 'inbox', companyId, reviewerId] as const,
};
```

## Mutation Invalidation Example

```ts
export function useReviewLeave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reviewLeaveRequest,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: leaveKeys.all(variables.companyId),
      });

      queryClient.invalidateQueries({
        queryKey: approvalKeys.inbox(
          variables.companyId,
          variables.reviewerId
        ),
      });
    },
  });
}
```

## Peer Dependency Requirement

`packages/hrms-hooks` imports React and `@tanstack/react-query`. These **must** be declared as `peerDependencies` in the package's `package.json`, not as direct `dependencies`. Consuming apps (`hrms-web`, main app) must provide them. Listing them as direct dependencies will result in two React instances at runtime — a hard-to-diagnose breakage with no obvious error message.

```json
"peerDependencies": {
  "react": ">=18",
  "@tanstack/react-query": ">=5"
}
```

## Done Criteria

```txt
Query keys are centralized.
Mutation invalidation is centralized.
Pages no longer manually invent query keys.
Approval inbox refresh is consistent.
Leave balance refresh is consistent.
hrms-web can share the same hooks across modules.
Main app does not need HRMS hooks except for launcher metadata or counts.
react and @tanstack/react-query are peerDependencies, not dependencies.
No duplicate React instance warning in browser console.
```

---

# Phase 7 — Complete Standalone `apps/hrms-web`

At this stage, `apps/hrms-web` becomes the owner of all HRMS module pages.

## Forbidden Imports

`apps/hrms-web` must not import:

```txt
@/pages/hrms/*
@/services/hrms/*
../../src/pages/hrms/*
../../src/services/hrms/*
```

## Required `hrms-web` Structure

```txt
apps/hrms-web/src/
  App.tsx
  routes.ts

  pages/
    dashboard/
      HrmsDashboard.tsx

    leave/
      ApplyLeave.tsx
      MyLeaves.tsx
      LeaveApprovals.tsx
      LeaveCalendar.tsx

    approvals/
      ApprovalInbox.tsx
      ApprovalDetails.tsx

    attendance/
      AttendanceDashboard.tsx
      AttendanceLogs.tsx

    payroll/
      PayrollDashboard.tsx
      PayrollApprovals.tsx

    appraisals/
      AppraisalDashboard.tsx
      AppraisalReviews.tsx

    announcements/
      AnnouncementsPage.tsx

    employees/
      EmployeeDirectory.tsx

    settings/
      HrmsSettings.tsx
      LeaveTypeSettings.tsx
      HolidaySettings.tsx
      ApprovalFlowSettings.tsx
      HrmsRoleSettings.tsx
      NotificationSettings.tsx

  components/
    layout/
    navigation/
    approvals/
    leave/
    payroll/
    attendance/
    appraisal/
    settings/
    shared/
```

## Alias Fix

Current risky area:

```txt
@/ alias in hrms-web points outside hrms-web
```

Target:

```ts
'@': path.resolve(__dirname, 'src')
'@hrms-web': path.resolve(__dirname, 'src')
```

## Stub Rule

Temporary re-export stubs are allowed only as a migration bridge.

Phase 7 is not complete until every stub is replaced with a real `hrms-web` page.

Track stubs explicitly:

```txt
LeaveManagement: stub / replaced
ApprovalInbox: stub / replaced
Payroll: stub / replaced
Appraisals: stub / replaced
Attendance: stub / replaced
Announcements: stub / replaced
Employees: stub / replaced
Settings: stub / replaced
```

## Alias Fix Ordering Rule

The `@/` alias change in `apps/hrms-web/vite.config.ts` is the **last action in Phase 7**, gated on zero stub re-exports. Any stub that still contains `export * from '@/pages/hrms/...'` when the alias is flipped will resolve to `apps/hrms-web/src/pages/hrms/` — which does not exist — and will break the build. Do not flip the alias until all stubs are confirmed replaced.

## Done Criteria

```txt
apps/hrms-web builds standalone.
apps/hrms-web owns all HRMS pages.
apps/hrms-web owns its own module navigation.
apps/hrms-web consumes packages/hrms-services and packages/hrms-hooks.
apps/hrms-web no longer imports main-app HRMS pages/services.
Main app build remains unaffected.
All stub tracking entries show 'replaced' before the @/ alias is changed.
The @/ alias fix is the final commit of Phase 7.
```

---

# Phase 8 — Convert Main App HRMS Areas into Launcher Links

After `hrms-web` owns all HRMS pages, convert the main app HRMS surfaces into launcher/deep-link surfaces only.

## Main App May Keep

```txt
HRMS dashboard shortcut card
HRMS sidebar menu item
Leave shortcut link
Approval Inbox shortcut link
Payroll shortcut link
Attendance shortcut link
Appraisal shortcut link
Settings shortcut link
Notification badge linking into HRMS
```

## Main App Must Not Keep

```txt
Full LeaveManagement page implementation
Full ApprovalInbox page implementation
Full Attendance page implementation
Full Payroll page implementation
Full Appraisal page implementation
Full HRMS settings implementation
HRMS role settings implementation
HRMS approval flow settings implementation
```

## Redirect Wrapper Pattern

During migration, main app routes may redirect:

```tsx
export function LegacyHrmsLeaveRedirect() {
  return <Navigate to={hrmsRoutes.leave} replace />;
}
```

Or for subdomain deployment:

```ts
window.location.href = `${HRMS_BASE_URL}/leave`;
```

## Done Criteria

```txt
Main app HRMS entries are links or redirects only.
Clicking any HRMS module from the main app opens the HRMS app.
Main app no longer renders HRMS workflows.
Legacy HRMS pages are removed or converted to redirects.
```

---

# Phase 9 — UI/UX Modular Split Inside HRMS App

Only after the architectural boundaries are clean.

## Leave Module Split

Replace one large role-mixed Leave page with:

```txt
ApplyLeave.tsx
MyLeaves.tsx
LeaveBalancePanel.tsx
LeaveRequestForm.tsx
LeaveApprovals.tsx
LeaveApprovalCard.tsx
LeaveApprovalDialog.tsx
LeaveStatusTimeline.tsx
```

## Approval Module Split

```txt
ApprovalInbox.tsx
ApprovalInboxFilters.tsx
ApprovalCard.tsx
ApprovalDetailsDrawer.tsx
ApprovalTimeline.tsx
ApprovalDecisionDialog.tsx
```

## HRMS Settings Split

```txt
HrmsSettings.tsx
LeaveTypeSettings.tsx
HolidaySettings.tsx
ApprovalFlowSettings.tsx
HrmsRoleSettings.tsx
NotificationSettings.tsx
```

## UX Standard

Every HRMS page should have:

```txt
consistent page header
clear primary action
clear module boundary
loading state
empty state
permission-denied state
error state
mobile/tablet responsive layout
no overflowing cards
no hidden destructive actions
approval timeline where relevant
clear back navigation to HRMS dashboard
```

## Done Criteria

```txt
Employee and manager flows are separated.
Admin settings are separated from employee flows.
Pages are smaller and easier to test.
UI is cleaner without changing workflow semantics.
HRMS feels like a standalone product, not an embedded module.
```

---

# CI and Governance Controls

Add checks so the architecture does not regress.

## Import Boundary Check

The bash `grep` below is useful for a one-time audit, but a lint rule enforces the boundary on every save and in CI without needing a manual step.

Add to `apps/hrms-web/eslint.config.js` (or `.eslintrc`):

```js
// Prevent hrms-web from importing main-app HRMS internals
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        '@/pages/hrms/*',
        '@/services/hrms/*',
        '../../src/pages/hrms/*',
        '../../src/services/hrms/*',
      ],
    }],
  },
}
```

One-time audit grep (still useful during migration to find remaining violations):

```bash
grep -r "from '@/pages/hrms\|from '@/services/hrms\|from '../../src/pages/hrms\|from '../../src/services/hrms" apps/hrms-web/src
```

Expected result:

```txt
zero matches
```

## Main App Ownership Check

Search for HRMS module implementations still owned by the main app:

```bash
grep -r "LeaveManagement\|ApprovalInbox\|PayrollSummary\|Appraisal\|Attendance" src/pages/hrms
```

Expected result after final cutover:

```txt
redirect wrappers only, or no legacy HRMS page implementations
```

## Required Verification After Each Phase

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter hrms-web build
```

## Functional Regression Checklist

After every phase, verify:

```txt
Main app HRMS links open HRMS app.
Employee can submit leave in HRMS app.
Employee can upload leave attachment in HRMS app.
Manager can approve leave in HRMS app.
Manager can reject leave in HRMS app.
GM approval path works in HRMS app.
Director approval path works in HRMS app.
HR approval path works in HRMS app.
Leave balance updates after approval.
Approval inbox updates after decision.
Payroll finalisation approval works.
Payroll resubmission works.
Appraisal review works.
RLS blocks unauthorized access.
Main app remains usable.
HRMS app remains usable standalone.
```

---

# Revised Implementation Sequence

```txt
Phase 0: Baseline and regression lock
Phase 1: Define standalone HRMS boundary
Phase 2: Modular HRMS service package structure
Phase 3: Approval engine extraction
Phase 4: HRMS service consolidation
Phase 5: Type safety hardening
Phase 6: Shared hrms-hooks package
Phase 7: Complete standalone hrms-web
Phase 8: Convert main app HRMS areas into launcher links
Phase 9: UI/UX modular split inside HRMS app
```

This sequence prevents the biggest failure modes:

```txt
main app still owning HRMS modules
god-file index.ts
lost audit logging
unsafe approval updates
permanent page stubs
hooks trapped in main app
hrms-web still coupled to main app
alias regression
silent type breakage
```

---

# Final Recommendation

Use this corrected standalone-HRMS plan instead of the earlier version.

The earlier plan was directionally right for service consolidation, type safety, and decoupling. This version is stricter about the product boundary:

> Main app links out.  
> HRMS app owns HRMS.  
> Shared packages power both current and future HRMS clients.
