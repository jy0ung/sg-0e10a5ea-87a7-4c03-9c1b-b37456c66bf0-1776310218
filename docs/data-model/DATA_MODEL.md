# UBS v2 Data Model (Phase 0 Skeleton)

**Status**: Initial design — based on 109 existing migrations + discovered tables (vehicles, profiles, employees, sales_orders, tickets, approval_flows, hrms_*, payment_events, dms_raw_*, etc.).
**Goal**: Normalized, RLS-ready, immutable-ledger-first schema. Fresh migrations (no reuse of old numbers).
**Tenant**: `company_id` primary + branch/self refinements.
**Immutability**: payment_events / supplier_payment_events append-only with triggers.

## Core Identity & Tenant
- companies (id, name, branding_id, ...)
- branches (company_id, name, code, ...)
- profiles (id=auth.uid(), email, name, role AppRole, company_id, branch_id, access_scope, status ProfileStatus, employee_id, portal_access_only, ...)
- employees (company_id, branch_id, manager_employee_id, primary_role, status, staff_code, department_id, job_title_id, legacy_profile_id, ...)
- user_groups, role_sections, column_permissions, audit_logs, notifications, push_tokens, dashboard_preferences, module_settings

## Vehicle Domain (Central)
- vehicles (chassis PK, engine_no, colour, model_id, branch_id, salesman_id/employee_id, status, stage, milestones JSONB?, KPIs computed, import_batch_id, source (dms|ubs|legacy), soft_delete, commission fields, ...)
- import_batches, quality_issues, sla_policies, branch_mappings, payment_method_mappings, commission_rules, commission_records, vehicle_transfers

## Sales
- customers (dedup), sales_orders (vehicle_id or chassis link, customer_id, advisor_id, amounts, dates, stage), invoices, sales_advisors (unique code+company), salesman_targets, dealer_invoices, official_receipts

## Finance / GL (Immutable First)
- purchase_invoices
- payment_events (append-only AR: id, company_id, sales_order_id/invoice_id, amount, method, date, created_by, ...)
- supplier_payment_events (append-only AP)
- accounting_periods, chart_of_accounts, journal_entries
- Triggers: AFTER INSERT/DELETE on events → recompute paid_amount + payment_status on parent

## HRMS
- departments, job_titles, public_holidays
- leave_types (requires_balance, min_advance_notice_days, ...)
- leave_balances, leave_requests (day_part, attachments JSONB)
- attendance_records, payroll_runs, payroll_items, appraisals, appraisal_items, announcements
- hrms_roles (code, category, scope, authority_level, capabilities JSONB)
- employee_hrms_role_assignments (employee_id, hrms_role_id, is_active, assigned_at, expires_at)
- company_branding (logo_url, favicon_url, primary/accent colors, display_name, storage bucket)

## Requests / Approvals
- tickets (category_id, subcategory_id, template_id, custom_fields JSONB, requester_profile_id, assigned_to, status, ...)
- ticket_activity (event_type incl. comment_added), ticket_attachments
- request_categories (approval_flow_id FK), request_subcategories, request_templates, request_routing_rules, request_form_fields, request_attachment_settings
- approval_flows (conditions JSONB, match_priority, name, ...)
- approval_steps, approval_instances, approval_decisions, approval_requests

## Integration / Staging (Multi-Source)
- sync_runs, dms_raw_sales_orders, dms_raw_vehicle_stock, dms_raw_collections, dms_raw_order_vehicle_matches, dms_raw_deliveries, dms_raw_leads, dms_raw_prospects, dms_raw_soa_snapshots, dms_raw_master_data
- legacy_staging_customers, legacy_staging_sales_invoices, legacy_staging_records
- source_reconciliation_matches, source_reconciliation_events

## Other Master Data
- models, colours, payment_types, suppliers, dealers, fees, deal_stages

## Patterns Enforced in v2
- Every table: company_id, created_at/updated_at/created_by/updated_by (triggers/defaults)
- RLS: company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) + branch/self helpers
- Helper functions: get_my_access_scope(), can_access_row()
- Advisory locks on batch ops
- CTEs for reports
- Full-text indexes on customers/vehicles where needed
- Generated columns / views for KPIs

**Next in Phase 0**: Detailed migration SQL + RLS policies + indexes + RPC contracts (after Supabase CLI availability confirmed).

**References**: Existing 109 migrations, vehicles table fields, payment_events pattern, approval_flows conditions, hrms_roles, dms_raw_* staging, source ledger RPC.
