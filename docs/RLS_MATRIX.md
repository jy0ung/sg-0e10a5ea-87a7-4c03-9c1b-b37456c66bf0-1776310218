# RLS Matrix

This document tracks row-level-security posture per table. Every tenant-scoped table must be `company_id`-scoped. Global master data is read-only to all authenticated users in the same company and write-restricted to admins.

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

| Function | Scope | Writes | Notes |
| -------- | ----- | ------ | ----- |
| `auto_aging_source_ledger` | Company | None | Read-only source ledger over UBS vehicles/orders, raw DMS staging, and legacy invoice evidence. Uses caller RLS through `security invoker`; it does not normalize, reconcile, or overwrite canonical rows. |
| `link_vehicle_to_sales_order` | Company | `sales_orders` update only | Links an existing same-company vehicle to a same-company sales order by vehicle id or chassis number. Does not create vehicle rows. |
| `unlink_vehicle_from_sales_order` | Company | `sales_orders` update only | Removes the vehicle link from a same-company sales order. Does not delete or modify vehicle rows. |

## Verification

An automated Vitest + Supabase integration suite signs in as user A (company X) and attempts every SELECT/INSERT/UPDATE/DELETE against rows owned by user B (company Y). Every attempt must fail. The suite also covers the Stage 2 Sales Order vehicle lifecycle: own-company order creation, `link_vehicle_to_sales_order`, `unlink_vehicle_from_sales_order`, and cross-company rejection. This is the acceptance gate for Phase 0 and the Stage 2 vehicle-linking boundary.

Production release sign-off is tracked in `docs/SECURITY_SIGNOFF.md`. The release cannot be approved until `npm run test:rls` passes against a dedicated local or isolated staging Supabase target and the evidence is recorded there. The live suite requires `SUPABASE_SERVICE_ROLE_KEY` so temporary Sales Order and vehicle rows can be cleaned up after the Stage 2 RPC lifecycle tests.
