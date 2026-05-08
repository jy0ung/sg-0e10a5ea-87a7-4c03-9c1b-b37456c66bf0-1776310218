# Internal Request Module Layout Audit And Redesign Plan

Date: 2026-05-08  
Status: Responsive workbench foundation and workbench component extraction implemented.

## Executive Summary

The Internal Request module is functionally mature enough for daily operations, but its layout maturity is uneven. The request intake and requester history pages are usable on mobile and desktop. The operational Request Workbench is the primary layout risk because it combines queue scanning, filtering, SLA/approval state, ownership controls, attachments, comments, and activity history in one dense page.

The redesign should keep the module as an enterprise work surface rather than a marketing-style page. The goal is dense, predictable, scannable operations: more queue rows visible, fewer vertical blockers, detail views that work on tablet/mobile, and configuration pages that remain navigable as setup grows.

## Framework And UI Stack

- Frontend: React with Vite.
- Styling: Tailwind CSS with local shadcn/Radix-style UI primitives.
- Existing responsive primitives: `Dialog`, `Drawer` from `vaul`, `Tabs`, `Select`, `Card`, `Badge`, and `ResizablePanel` wrappers already exist.
- Routes are lazy-loaded from [src/main.tsx](src/main.tsx).
- Internal Request shell is [src/components/layout/CustomerServiceLayout.tsx](src/components/layout/CustomerServiceLayout.tsx).

## Module Map

| Area | File | Current responsibility |
|---|---|---|
| Request intake | [src/pages/tickets/NewTicket.tsx](src/pages/tickets/NewTicket.tsx) | Role-aware request form, templates, categories, custom fields, attachment upload, submission. |
| Requester history | [src/pages/tickets/MyTickets.tsx](src/pages/tickets/MyTickets.tsx) | Submitted request cards, cancellation for open unassigned work, comments, attachments, SLA and approval state. |
| Operator workbench | [src/pages/tickets/RequestQueue.tsx](src/pages/tickets/RequestQueue.tsx) | Queue filtering, metrics, CSV export, ownership/status/priority controls, approval review, comments, attachments, activity. |
| Admin setup | [src/pages/tickets/RequestSetup.tsx](src/pages/tickets/RequestSetup.tsx) | Categories, subcategories, templates, custom fields, attachment settings, routing rules, SLA targets. |
| Shared ticket UI | [src/components/tickets](src/components/tickets) | Activity timeline, attachment list, approval summary, SLA summary. |
| Request services | [src/services/ticketService.ts](src/services/ticketService.ts) | Ticket create/list/update/comment/cancel/activity APIs. |
| Attachments | [src/services/ticketAttachmentService.ts](src/services/ticketAttachmentService.ts) | Upload, listing, signed download URLs. |
| Approval integration | [src/services/requestApprovalService.ts](src/services/requestApprovalService.ts) | Approval review actions for Internal Request records. |

## Page Audit

### Request Workbench

Strengths:

- Uses a master-detail model that fits operator work on large screens.
- Shows SLA, approval, priority, owner, attachments, comments, and activity in one place.
- Has CSV export and reload controls for queue operations.

Layout problems:

- Header and metric cards consume too much vertical space before operators reach the queue.
- Filters scroll away during long queue review.
- Summary cards were not collapsible, so dense operations could not reclaim the vertical space.
- Mobile and tablet users had to rely on a stacked detail pane below the queue, making selection feel disconnected and pushing details below the fold.
- Queue rows showed useful context but needed tighter row height and better mobile behavior.

Implemented first slice:

- Added a compact responsive header that hides explanatory copy below desktop.
- Added a persisted Summary toggle to collapse or restore workbench metrics.
- Changed summary metrics to `sm:grid-cols-2 xl:grid-cols-5` so tablet widths no longer squeeze five cards.
- Made the filter bar sticky within the module page.
- Added a mobile/tablet detail drawer for queue item selection, while keeping the desktop detail pane for large screens.
- Reduced the queue scroll height dependency so more rows remain visible after the header and filter changes.

Implemented second slice:

- Extracted the shared `RequestDetailPanel` used by both the desktop pane and the mobile/tablet drawer.
- Restored parity between desktop and drawer detail views, including resolution note editing and the same approval/status/owner/comment controls.
- Extracted `RequestQueueMetricGrid`, `RequestQueueFilters`, and `RequestQueueList` so the workbench page owns data orchestration while focused components own layout surfaces.

Remaining redesign work:

- Add true desktop resizable panes using the existing resizable primitive after detail extraction.
- Add saved views and selected-row bulk actions once server-side pagination lands.
- Move queue list filtering/pagination server-side before high-volume rollout.

### My Requests

Strengths:

- Card layout is readable and naturally responsive.
- Requesters can see attachments, approval/SLA state, activity, resolution notes, and comments.
- Cancellation is scoped to open unassigned requests.

Layout problems:

- High-volume requesters will render every request card at once.
- Cards are detailed by default, which is useful for a few requests but heavy for dozens.
- Follow-up attachment upload after submission is still missing.

Recommended redesign:

- Add list/detail or accordion behavior when request count exceeds a threshold.
- Add client-visible filters for active, awaiting requester, resolved, and cancelled.
- Add pagination or infinite loading backed by service-level query limits.
- Add follow-up attachment upload in the detail area.

### New Request

Strengths:

- Role-aware page copy and placeholders are already good.
- Category/template selection, dynamic fields, and attachment validation are well integrated.
- Form layout narrows cleanly on mobile.

Layout problems:

- Attachment drop zone is mouse-friendly but can be less obvious on touch devices.
- Long template/category sets can become visually busy before the form.
- Dynamic fields can make the page long without a clear section summary.

Recommended redesign:

- Keep the single-page form, but make the upload affordance explicitly tap-first on small screens.
- Add compact section headers for Request, Context, Attachments, and Review.
- Consider a sticky submit bar only after validating that it does not cover mobile form fields.

### Request Setup

Strengths:

- Setup functions are complete enough for category, template, custom field, attachment, routing, and SLA administration.
- Tabs are the right high-level mental model.

Layout problems:

- File size is now a maintainability risk; the page is doing too much in one component.
- The main tab list can overflow on narrow screens.
- Adding approval flow mapping, escalation, delegation, or template-specific rules will make the page harder to reason about.

Implemented first slice:

- Wrapped the main tab list in a horizontal overflow container so setup navigation remains accessible on narrow screens.

Recommended redesign:

- Decompose setup into focused components: catalog, templates, form builder, attachments/settings, routing, SLA, approval governance.
- Keep shared category/template state in the page shell until service boundaries are clean enough for deeper extraction.
- Add per-section dirty state and validation summaries before adding more governance fields.

### Internal Request Shell

Strengths:

- Provides a dedicated module shell separate from the main app.
- Navigation is role-aware and keeps admin pages out of requester-only views.

Implemented first slice:

- Reduced mobile sidebar width with a viewport cap so the overlay is less cramped on 375px devices.

Remaining redesign work:

- Add an active module breadcrumb or page action slot if the module grows beyond the current four routes.
- Consider a compact desktop sidebar mode only if future pages make horizontal space tight.

## Redesign Principles

1. Keep operator pages dense and scannable.
2. Put working controls near the data they affect.
3. Avoid hiding critical state, but allow summary sections to collapse when operators need workspace.
4. Use drawers for mobile detail review and panes for desktop detail review.
5. Keep setup screens modular before adding more governance complexity.
6. Use server-side pagination and filters before designing for very large request volumes.

## Implementation Roadmap

### Slice 1: Responsive Workbench Foundation

Status: Implemented.

- Compact header and collapsible summary metrics.
- Tablet-friendly summary metric grid.
- Sticky filters.
- Mobile/tablet detail drawer.
- Narrower mobile module sidebar.
- Scroll-safe Request Setup tabs.

### Slice 2: Workbench Component Extraction

Status: Implemented.

- [x] Extract `RequestDetailPanel` and use it in both desktop pane and mobile drawer.
- [x] Extract `RequestQueueMetricGrid`.
- [x] Extract `RequestQueueFilters`.
- [x] Extract `RequestQueueList`.
- [ ] Add focused component tests where behavior can be isolated.

### Slice 3: Queue Scale

Status: Planned.

- Add service-level pagination and server-side filters.
- Add saved views for My Queue, Unassigned, Breached, High Priority, and Awaiting Requester.
- Add bulk assignment and status updates.
- Keep CSV export scoped to current filtered/selected rows.

### Slice 4: Setup Decomposition

Status: Planned.

- Split [src/pages/tickets/RequestSetup.tsx](src/pages/tickets/RequestSetup.tsx) into tab components.
- Add approval governance configuration by category/template.
- Keep routing-rule evaluation migration to server-side logic as a separate backend slice.

### Slice 5: Requester Experience

Status: Planned.

- Add follow-up attachments after submission.
- Add satisfaction rating after resolution.
- Add filters or compact list/detail behavior for requesters with high request volume.

## Validation Plan

- Run `npm run typecheck` after layout changes.
- Run `npm run test -- src/services/ticketService.test.ts` after ticket service or approval behavior changes.
- Run `npx playwright test e2e/tickets.spec.ts` for route-level request flows.
- Manually verify Request Workbench at 1920px, 1440px, 1024px, 768px, and 375px.
- Verify mobile drawer open/close, keyboard focus, and scroll behavior.
- Verify Summary collapse persists and does not hide filters or selected queue state.

## Open Product Decisions

- Should summary metrics default to expanded for all users, or remember per-user preference in profile settings rather than local storage?
- Should mobile operators be allowed to perform approval/status/owner edits from the drawer, or should mobile be view/comment only?
- Which saved views are mandatory for launch: My Queue, Unassigned, Breached, Awaiting Requester, High Priority, or custom user-defined views?
- What request volume threshold requires server-side pagination before launch?