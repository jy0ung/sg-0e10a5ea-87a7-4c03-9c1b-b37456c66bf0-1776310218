# Internal Request Module — Security Notes (OWASP Checklist)

Date: 2026-06-15

Scope: the Internal Request module — config services in `@flc/internal-requests`
(`requestCategoryService`, `requestSubcategoryService`, `requestFormFieldService`,
`requestTemplateService`, `requestRoutingService`), the `tickets`/request flow, and the
`/portal/setup` admin console. This records the state of each OWASP-relevant control and the
hardening applied in this pass.

## A01 Broken Access Control — tenant isolation

**Status: enforced at the data layer (authoritative), not just UI.**

- Every config table (`request_categories`, `request_subcategories`, `request_form_fields`,
  `request_templates`, `request_routing_rules`) has RLS: company-scoped `SELECT`
  (`is_same_company(company_id)`) and admin-role-gated `INSERT/UPDATE/DELETE`
  (`current_role() in ('super_admin','company_admin','portal_admin')` + `is_same_company`).
  See `supabase/migrations/20260502040000_*`, `20260517130000_*`.
- Every service query also chains `.eq('company_id', companyId)` as defense-in-depth.
- `super_admin` (`access_scope = 'global'`) is permitted cross-company by `is_same_company`;
  `company_admin` is confined to its own tenant. A Company Admin reaching another company's row
  gets an empty result (SELECT) or a 0-row mutation (INSERT/UPDATE/DELETE) — verified by the RLS
  matrix test (`src/test/rls-matrix.spec.ts`).
- UI: `/portal/setup` is wrapped in `RequireRole roles={PORTAL_SETUP_ROLES}` in `src/main.tsx`,
  which renders `UnauthorizedAccess` (not a blank page) for non-admins. UI gating is a usability
  layer; the DB RLS is the security boundary.

## A03 Injection

**Status: parameterized throughout; one raw PostgREST filter hardened in this pass.**

- All reads/writes use the Supabase query builder (parameterized) — no string-concatenated SQL.
- `requestFormFieldService.listRequestFormFields` interpolates `subcategoryKey` into a raw
  PostgREST `.or('subcategory_key.is.null,subcategory_key.eq.<key>')` filter. Subcategory keys are
  generated slugs, but the value is now validated against `^[a-z0-9_]+$` before interpolation and
  rejected otherwise, preventing PostgREST filter-injection (a value containing `,`/`)` could
  otherwise alter filter semantics). Covered by a service test with an injection payload.
- `ticketService` free-text search runs through `sanitizeTicketSearchTerm` before building its
  search filter. (ticketService consolidation is deferred — see GAP doc — but the existing
  sanitizer remains in force in both app copies.)

## A02 Broken Authentication / Session — role-change invalidation

**Status: satisfied at the data layer; documented mechanism, no token-version scheme needed.**

- Auth is Supabase JWT (bearer) with PKCE. Write authorization is decided by RLS `current_role()`,
  which reads the live `profiles.role` row on every request — so a demoted admin loses write access
  on their next query even with an unexpired JWT.
- `AuthContext` (`packages/auth/src/AuthContext.tsx`) re-fetches the profile on
  `onAuthStateChange` and forces sign-out/redirect for `inactive`/`resigned`/`pending` accounts.
- Residual (accepted): there is no proactive server push to kill an already-issued session on
  demotion; the user keeps a read session until their next auth event. Acceptable given write
  enforcement is live at the DB.

## A08 Data Integrity — optimistic locking (lost-update prevention)

**Status: added for all admin config entities in this pass.**

- Each config `update*`/`delete*` accepts an `expectedUpdatedAt` token (the `updated_at` the caller
  last read). When supplied, the mutation adds `.eq('updated_at', expected)`; a concurrent edit
  (which bumped `updated_at` via the table's BEFORE UPDATE trigger) makes the predicate match zero
  rows, and the service returns `{ conflict: true }` (a 409-equivalent) instead of silently
  clobbering. The UI surfaces this as an inline "record changed — reload" prompt.
- Reorder (`move*`) operations are intentionally token-free (they act on freshly-listed rows).
- Tickets themselves are intentionally **not** versioned in this pass (scoped to admin config).

## Audit & Monitoring

**Status: all config mutations log actor + before/after.**

- `update*`/`delete*` capture a before-snapshot and log `{ changedFields, before, after }` (or a
  before-snapshot on delete) via `logUserAction(actorId, action, entityType, entityId, metadata)`
  — replacing the prior field-count-only metadata. Actor and timestamp are recorded by the audit
  row itself.

## A05 Security Misconfiguration

- CORS is allowlist-based (`supabase/functions/_shared/cors.ts`, `ALLOWED_ORIGINS`), not wildcard.
- Rate limiting available via `supabase/functions/_shared/rateLimit.ts` (durable sliding window).
- Input/attachment bounds enforced by DB CHECK constraints
  (`20260528000000_ticket_input_bounds.sql`, `20260528010000_ticket_attachment_size_enforcement.sql`).

## CSRF

**Status: not applicable.**

- API auth is `Authorization: Bearer <jwt>` (PKCE), with the session persisted in **localStorage**
  (`packages/supabase/src/authStorage.ts`) — not an ambient cookie session, so PostgREST mutations
  cannot be driven by a cross-site request that lacks the bearer token. The only cookie path is
  SSO domain-sharing with `SameSite=Lax`, which itself blocks cross-site POST CSRF.

## XXE

**Status: not applicable** — the module processes no XML.

## Tracked follow-ups (not blocking this pass)

- Move routing evaluation server-side (RPC/Edge Function). Today `evaluateRoutingRules` runs in the
  browser; it is RLS-bounded and re-validates the assignee against live `profiles`, so it cannot
  assign cross-tenant or to an unprivileged user — auto-assignment is therefore advisory. See
  `docs/INTERNAL_REQUEST_GAP_ASSESSMENT.md` and `docs/INTERNAL_REQUEST_REFACTOR.md`.
- Consolidate `ticketService` into `@flc/internal-requests` (deferred: the two app copies have
  bidirectional drift with differing public signatures; merging requires per-call-site reconciliation
  and carries no hardening payload, since ticket versioning is out of scope this pass).
