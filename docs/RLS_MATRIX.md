# RLS Matrix

This document tracks row-level-security posture per table. Every tenant-scoped table must be `company_id`-scoped. Global master data is read-only to all authenticated users in the same company and write-restricted to admins.

Migration `20260915090000_production_readiness_security.sql` adds restrictive policies to every RLS table and every `company_id` table. These policies are ANDed with older permissive policies, so enabled-account and tenant checks cannot be bypassed by a legacy policy. PostgREST also rejects data and RPC requests from inactive/resigned profiles before executing a query.

## Scope legend

- **Company** — `company_id = (select company_id from profiles where id = auth.uid())`
- **Self** — `user_id = auth.uid()` or `profile_id = auth.uid()`
- **Admin** — caller is in an admin role within their company

## Matrix

| Table                         | SELECT            | INSERT            | UPDATE            | DELETE            | Notes                                    |
| ----------------------------- | ----------------- | ----------------- | ----------------- | ----------------- | ---------------------------------------- |
| `profiles`                    | Company           | `handle_new_user` | Self or Admin     | Admin             | Role/company upgrades via invite only    |
| `vehicles`                    | Company           | Company           | Company + column  | Admin             | Column-level gate via trigger/RPC        |
| `import_batches`              | Company           | Company           | Company           | Admin             | Transactional RPC wraps insert           |
| `quality_issues`              | Company           | Company           | Company           | Admin             |                                          |
| `sla_policies`                | Company           | Admin             | Admin             | Admin             |                                          |
| `audit_logs`                  | Company           | `user_id = auth`  | — (immutable)     | —                 | Append-only                              |
| `application_logs`            | Admin             | Service           | —                 | Admin             | Server-side rate limited                 |
| `notifications`               | Self              | Same-company check| Self              | Self              | Edge function validates target company   |
| `dashboard_preferences`       | Self              | Self              | Self              | Self              | user_id = auth                           |
| `companies`                   | Company           | Super admin       | Super admin       | Super admin       |                                          |
| `branches`                    | Company           | Admin             | Admin             | Admin             |                                          |
| `deal_number_sequences`       | Service only      | Service / authorized allocator | Service / authorized allocator | Service only | Private display-number reservations; no direct anon/authenticated CRUD, including company admins |
| `finance_companies`           | Company           | Admin             | Admin             | Admin             | Master data                              |
| `insurance_companies`         | Company           | Admin             | Admin             | Admin             | Master data                              |
| `vehicle_models`              | Company           | Admin             | Admin             | Admin             | Master data                              |
| `vehicle_colours`             | Company           | Admin             | Admin             | Admin             | Master data                              |
| `banks`                       | Company           | Admin             | Admin             | Admin             | Master data                              |
| `suppliers`                   | Company           | Admin             | Admin             | Admin             | Master data                              |
| `dealers`                     | Company           | Admin             | Admin             | Admin             | Master data                              |
| `dealer_invoices`             | Company           | Company           | Company           | Admin             |                                          |
| `official_receipts`           | Company           | Company           | Company           | Admin             |                                          |
| `tin_types`                   | Company           | Admin             | Admin             | Admin             | Master data                              |
| `registration_fees`           | Company           | Admin             | Admin             | Admin             | Master data                              |
| `road_tax_fees`               | Company           | Admin             | Admin             | Admin             | Master data                              |
| `inspection_fees`             | Company           | Admin             | Admin             | Admin             | Master data                              |
| `handling_fees`               | Company           | Admin             | Admin             | Admin             | Master data                              |
| `additional_items`            | Company           | Admin             | Admin             | Admin             | Master data                              |
| `payment_types`               | Company           | Admin             | Admin             | Admin             | Master data                              |
| `user_groups`                 | Company           | Admin             | Admin             | Admin             |                                          |
| `departments`                 | Company           | Admin             | Admin             | Admin             | HRMS                                     |
| `job_titles`                  | Company           | Admin             | Admin             | Admin             | HRMS                                     |
| `public_holidays`             | Company           | Admin             | Admin             | Admin             |                                          |
| `approval_flows`              | Company           | Admin             | Admin             | Admin             |                                          |
| `approval_steps`              | Company           | Admin             | Admin             | Admin             |                                          |
| `role_sections`               | Company           | Admin             | Admin             | Admin             | Replaces localStorage matrix             |
| `tickets`                     | Company           | Company           | Company or Portal-Admin/Manager | Admin + Portal-Admin/Manager | SELECT/UPDATE admin policies updated in migration 20260517120000 to include `portal_admin` + `portal_manager` |
| `sales_orders`                | Company           | Company           | Company           | Admin             |                                          |
| `invoices`                    | Company           | Company           | Company           | Admin             |                                          |
| `customers`                   | Company           | Company           | Company           | Admin             |                                          |
| `deal_stages`                 | Company           | Admin             | Admin             | Admin             |                                          |
| `vehicle_transfers`           | Company           | Company           | Company           | Admin             |                                          |
| `purchase_invoices`           | Company           | Company           | Company           | Admin             |                                          |
| `employees`                   | Company           | Admin             | Admin or Self     | Admin             | HRMS; self can update contact only       |
| `leave_requests`              | Company           | Self              | Self before approval; Approver after | Admin | No self-approval enforced DB-side        |
| `attendance_records`          | Company           | Self              | Self before lock  | Admin             |                                          |
| `sync_runs`                   | Company           | Service           | Service           | Service           | Backend source-sync audit trail          |
| `dms_raw_sales_orders`        | Company           | Service           | Service           | Service           | Raw DMS staging; no browser writes       |
| `dms_raw_vehicle_stock`       | Company           | Service           | Service           | Service           | Raw DMS staging; no browser writes       |
| `dms_raw_collections`         | Company           | Service           | Service           | Service           | Raw DMS collection snapshots             |
| `dms_raw_order_vehicle_matches` | Company         | Service           | Service           | Service           | Raw DMS allocation/registration links    |
| `dms_raw_deliveries`          | Company           | Service           | Service           | Service           | Raw DMS delivery/outbound staging        |
| `dms_raw_leads`               | Company           | Service           | Service           | Service           | Raw DMS lead staging                     |
| `dms_raw_prospects`           | Company           | Service           | Service           | Service           | Raw DMS prospect staging                 |
| `dms_raw_soa_snapshots`       | Company           | Service           | Service           | Service           | Raw DMS SOA finance snapshots            |
| `dms_raw_master_data`         | Company           | Service           | Service           | Service           | Raw DMS master-data staging              |
| `legacy_staging_customers`    | Company           | Service           | Service           | Service           | Legacy fookloi.net staging               |
| `legacy_staging_sales_invoices` | Company         | Service           | Service           | Service           | Legacy invoice evidence staging          |
| `legacy_staging_records`      | Company           | Service           | Service           | Service           | Generic legacy reference/evidence staging |
| `source_reconciliation_matches` | Company         | Admin             | Admin             | Admin             | Match decisions and review state         |
| `source_reconciliation_events` | Company          | Admin             | —                 | —                 | Append-only reconciliation audit events  |

## RPC Contracts

`deal_number_sequences` is private technical reservation state: RLS enabled,
no PUBLIC/anonymous/authenticated table privileges (including company admins),
and an intentional service-role ALL policy/grant. The existing
`generate_deal_no(text,text)` SECURITY DEFINER RPC retains its safe
`pg_catalog, public` search path and authenticated/service EXECUTE grants; anon
has none. Existing enabled-actor/company checks run before writes, retaining
global/service allocation semantics and the inactive-session pre-request gate.
Company + literal displayed branch label + database YY/MM scopes the atomic
counter; null/unresolved GEN and an actual GEN branch share it. Unresolved or
foreign branch IDs retain the existing own-company GEN fallback, without
granting access to that foreign branch. This is compatibility, not a new branch
permission policy. See [Deal-number evidence](DMSV3_DEAL_NUMBER_ALLOCATION_EVIDENCE.md)
and `src/test/deal-number-allocation.rls.spec.ts` DN-08/DN-09 for populated
authorization denials and privileged before/after counter equality across all
direct CRUD attempts. Deal uniqueness and existing Deal policies are unchanged.

`lead_followups` supports company-scoped reads (and existing global scope),
same-company authored inserts, and an original-author/nominal-24-hour UPDATE predicate;
authenticated DELETE has no policy. Migration
`20261001010000_dms_lead_followup_source_boundary.sql` also requires direct
INSERT/UPDATE to reference an existing same-company Lead or Prospect of the
specified kind. The restrictive enabled-user and tenant gates remain active.
Same-company source reattachment and `created_at` rewriting remain possible, so
this predicate does not guarantee immutable history or a fixed correction window.
`add_lead_followup` derives the author from `auth.uid()` and checks the source
company itself. `get_leads_feed` / `get_lead_detail` enforce their existing
company/global contract. See [DMSv3 Phase 1 evidence](DMSV3_PHASE1_SOURCE_BOUNDARY_EVIDENCE.md)
and `src/test/dms-lead-prospect-boundary.rls.spec.ts` for populated positive and
negative cases. Raw DMS Lead/Prospect rows remain service-write-only.

| Function | Scope | Writes | Notes |
| -------- | ----- | ------ | ----- |
| `normalize_dms_sales_order` | Service role only | Existing SO DMS fields, raw backlink, unresolved SO decision, normalized event | SECURITY DEFINER with `search_path=pg_catalog, public`; PUBLIC/anon/authenticated have no EXECUTE, including company admin/inactive sessions. Exactly one typed approved own-company/raw decision, valid declaration and one eligible explicit/ID/text target precede writes. Missing/foreign/deleted explicit target never falls back. Existing column authority/grants retained; no Case, money or other normalizer authorization change. |
| `auto_aging_source_ledger` | Company | None | Read-only source ledger over UBS vehicles/orders, raw DMS staging, and legacy invoice evidence. Uses caller RLS through `security invoker`; it does not normalize, reconcile, or overwrite canonical rows. |
| `link_vehicle_to_sales_order` | Company | `sales_orders` update only | Links an existing same-company vehicle to a same-company sales order by vehicle id or chassis number. Does not create vehicle rows. |
| `unlink_vehicle_from_sales_order` | Company | `sales_orders` update only | Removes the vehicle link from a same-company sales order. Does not delete or modify vehicle rows. |

[Sales Order guard evidence](DMSV3_SALES_ORDER_NORMALIZER_EVIDENCE.md) and
`src/test/dms-sales-order-normalizer-guards.rls.spec.ts` add actual anonymous,
active sales/company-admin and inactive-session denials for a fully eligible
fixture, catalog PUBLIC/role grants and safe-search-path checks, exact no-write
snapshots, privileged positive/replay/concurrency cases and owned cleanup.
This preserves the service-only execution boundary; the existing four database
security audits and unrelated regression suites remain mandatory.

## Verification

An automated Vitest + Supabase integration suite signs in as user A (company X) and attempts every SELECT/INSERT/UPDATE/DELETE against rows owned by user B (company Y). Every attempt must fail. The suite also covers the Stage 2 Sales Order vehicle lifecycle: own-company order creation, `link_vehicle_to_sales_order`, `unlink_vehicle_from_sales_order`, and cross-company rejection. This is the acceptance gate for Phase 0 and the Stage 2 vehicle-linking boundary.

Production release sign-off is tracked in `docs/SECURITY_SIGNOFF.md`. The release cannot be approved until `npm run test:rls` passes against a dedicated local or isolated staging Supabase target and the evidence is recorded there. The live suite requires `SUPABASE_SERVICE_ROLE_KEY` so temporary Sales Order and vehicle rows can be cleaned up after the Stage 2 RPC lifecycle tests.
