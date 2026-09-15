/**
 * Declarative type augmentations for the Supabase generated types.
 *
 * This file is consumed by `scripts/gen-types.ts` to augment the raw output of
 * `supabase gen types typescript` with:
 *
 * 1. Enum unions — discovered automatically from migration CHECK constraints
 * 2. RPC return shapes — hand-declared structured types for RPCs that return Json
 * 3. Join shapes — hand-declared composed types for multi-table join queries
 *
 * The augmentations are applied as a post-generation pass. The raw
 * `database.types.ts` from `supabase gen types` is the base; this file and the
 * migration parser add layers on top.
 */

// ─── RPC Return Shape Overrides ───────────────────────────────────────────────
//
// These replace `Returns: Json` in the generated Database type with structured
// return types for RPCs that return jsonb. Each entry must match the actual
// JSON shape returned by the SQL function.
//
// To add a new override:
//   1. Read the RPC's RETURNS TABLE(...) or RETURNS jsonb definition in the
//      latest migration that defines it.
//   2. Declare the TypeScript shape here.
//   3. The augmentation script will rewrite `Returns: Json` → `Returns: { ... }`
//      in database.types.ts.
//
// Example (to be filled in Phase 3):
//
// export interface RpcReturns {
//   auto_aging_dashboard_summary: {
//     available_branches: string[];
//     available_models: string[];
//     kpi_summaries: Array<{
//       branch_code: string;
//       model: string;
//       count: number;
//       aging_bucket: string;
//     }>;
//     quality_issue_count: number;
//   };
//   search_vehicles: {
//     rows: Array<Record<string, unknown>>;
//     total_count: number;
//   };
// }
//
export type RpcReturns = Record<string, never>;

// ─── Join Shape Types ─────────────────────────────────────────────────────────
//
// These provide typed shapes for multi-table joins that `supabase gen types`
// cannot infer. The supabase-js client partially infers join types from
// `.select('*, fk_table(name)')` strings, but complex nested joins with
// aliases and specific FK constraint names need explicit declarations.
//
// To add a new join shape:
//   1. Find the `.select(...)` call in the service file.
//   2. Declare the composed type here as an intersection of the base Row type
//      and the joined fields.
//   3. Export it from `@flc/supabase/types`.
//   4. Replace the `as Record<string, unknown>` cast in the service with the
//      declared type.
//
// Example (to be filled in Phase 4):
//
// export type LeaveRequestWithEmployeeAndType = Tables<'leave_requests'> & {
//   employee: { name: string } | null;
//   leave_types: { name: string } | null;
// };
//
export type JoinShapes = Record<string, never>;

// ─── Enum Name Overrides ──────────────────────────────────────────────────────
//
// The gen-types script auto-generates enum names from `{singularized_table}_{column}`.
// If an auto-generated name is awkward or conflicts with an application type,
// override it here. The key is `table.column`, the value is the desired enum name.
//
// Example:
//   'approval_decisions.decision': 'approval_decision',
//
export const enumNameOverrides: Record<string, string> = {
  'approval_decisions.decision': 'approval_decision',
};

// SQL accepts NULL for these arguments; callers intentionally send it.
export const nullableRpcArgs: Record<string, string[]> = {
  "generate_deal_no": [
    "p_branch_id"
  ],
  "get_trial_balance": [
    "p_period_id"
  ],
  "create_grn": [
    "p_notes",
    "p_supplier_dn_no"
  ],
  "get_leads_feed": [
    "p_branch_code",
    "p_kind",
    "p_status"
  ],
  "add_lead_followup": [
    "p_next_action_date",
    "p_outcome"
  ],
  "create_purchase_order": [
    "p_expected_delivery_date",
    "p_notes"
  ],
  "get_reconciliation_queue": [
    "p_match_status",
    "p_object_type"
  ],
  "decide_reconciliation_match": [
    "p_notes"
  ],
  "get_three_way_match_queue": [
    "p_match_status"
  ],
  "cancel_own_ticket": [
    "p_cancellation_note"
  ],
  "upsert_webhook_endpoint": [
    "p_id"
  ],
  "record_supplier_payment_event": [
    "p_notes",
    "p_payment_method",
    "p_reference_no"
  ],
  "reverse_supplier_payment_event": [
    "p_reason"
  ],
  "transition_pi_lifecycle": [
    "p_actor_id"
  ],
  "record_payment_event": [
    "p_notes",
    "p_official_receipt_id",
    "p_payment_method",
    "p_receipt_reference"
  ],
  "reverse_payment_event": [
    "p_reason"
  ],
  "get_sales_dashboard_summary": [
    "p_branch_code"
  ],
  "transition_sales_order_stage": [
    "p_actor_id",
    "p_stage_id"
  ],
  "get_sales_pipeline_summary": [
    "p_branch_code",
    "p_from_date",
    "p_to_date"
  ],
  "search_vehicles": [
    "p_bg_date_from",
    "p_bg_date_to",
    "p_branch",
    "p_has_delivery_date",
    "p_model",
    "p_payment",
    "p_search",
    "p_stage"
  ],
  "vehicle_kpi_summary": [
    "p_branch"
  ]
};
