/**
 * Pre-defined glossary of terms used across the app.
 * Add new terms here to keep tooltip text consistent.
 */
export const GLOSSARY = {
  // Deals
  deal_stage: 'The current position of a deal in the sales lifecycle (Lead → Prospect → Booking → Finance → Registration → Delivery → Disbursement)',
  days_in_stage: 'Number of calendar days since the deal entered its current stage. Deals stuck >7 days are flagged as stalled.',
  pipeline_value: 'Total selling price of all active (non-completed) deals.',
  disbursement: 'The final payment stage where the bank releases loan funds to the dealership.',
  lou: 'Letter of Undertaking — a bank document confirming loan approval and terms.',

  // Vehicles
  days_in_stock: 'Calendar days since the vehicle was received at the outlet. Vehicles >180 days are considered aged.',
  bg_date: 'Bank Guarantee date — when the dealership took financial responsibility for the vehicle.',
  chassis_no: 'Vehicle Identification Number (VIN) — the unique 17-character identifier stamped on the vehicle frame.',
  aging_threshold: 'Vehicles exceeding this age (default 180 days) are flagged for promotion or discount consideration.',

  // Internal Requests
  sla_status: 'Service Level Agreement tracking. Green = on track, Amber = approaching deadline, Red = breached.',
  ticket_priority: 'Urgency level: Low (7 days), Medium (3 days), High (1 day), Critical (4 hours) response targets.',
  auto_routing: 'Tickets are automatically assigned to the right team based on category, branch, and routing rules configured in Request Setup.',

  // Purchasing
  grn: 'Goods Receipt Note — documents received goods against a Purchase Order. Creates stock entries automatically.',
  three_way_match: 'Compares Purchase Order, GRN, and Invoice to verify quantities and amounts match before payment.',
  po_line: 'Individual item on a Purchase Order. Each line has a model, quantity, unit price, and optional chassis number.',

  // Finance
  gl_code: 'General Ledger account code — the accounting classification for this transaction.',
  trial_balance: 'Summarizes all GL account balances to verify debits equal credits for a given period.',
  ap_aging: 'Accounts Payable aging — tracks how long each supplier invoice has been outstanding.',

  // System
  rls: 'Row-Level Security — database policies that ensure users can only see data belonging to their company.',
  feature_flag: 'A toggle that enables/disables features. Some modules are behind feature flags until fully tested.',
  audit_log: 'Immutable record of all changes made in the system, including who changed what and when.',
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
