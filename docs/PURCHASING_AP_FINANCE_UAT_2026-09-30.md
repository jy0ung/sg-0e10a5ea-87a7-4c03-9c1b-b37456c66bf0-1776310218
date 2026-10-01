# Purchasing → AP → Finance disposable UAT

**Baseline:** `main@9962a9c9f34db98a8feb38aab71c08b6dccf9fb6` (PR #122). All mutations in this report used a rebuilt, disposable local Supabase stack. No production Purchase Order, GRN, invoice, Vehicle, payment, journal, period, or tenant data was changed.

## Fixture and authority

`src/test/purchasing-ap-finance-uat.rls.spec.ts` signs in a Company A administrator and a separate Accounts user. A Company B user exercises tenant denials. Service role creates isolated actors, a branch, system Cash/AP accounts, an open period and cleanup data; the business chain uses authenticated product RPCs. The PO has one line of quantity 2 at RM 40,000 per unit and an explicit chassis. Two GRNs receive 1 each. The linked PI is RM 80,000 after a deliberately introduced RM 2 variance, followed by invoice receipt, AP approval, supplier payment, GL posting and close. A current open period supports a posted-payment correction after the historical period closes.

## Reproduced defects and corrections

| Pre-fix live evidence | Owning correction | Post-fix evidence |
|---|---|---|
| Ordinary authenticated PI creation produced `po_line_id = NULL` and `unmatched`. The next call failed with PostgREST `PGRST202`: `link_purchase_invoice_po_line` did not exist. The first disposable run passed 208 other live tests and failed this new UAT test. | Purchasing adds an audited, actor-derived, company-checked PO-line link RPC; an atomic linked PI create RPC; a direct authenticated link-write guard; and a PO/line selector on create and pending-invoice detail. | The same fixture reaches `pending_receipt`, `amount_variance`, and `matched` using the canonical line ID. Browser coverage sends that ID from the invoice form. |
| A test-only trigger delayed two authenticated GRN inserts after the cumulative read. Both calls succeeded and the line received quantity 2 against an order for 1. | Purchasing locks the PO row before reading cumulative GRN quantities in `create_grn`, serializing receipts for the PO. | The unchanged race barrier allows one GRN and rejects the other; cumulative received is 1. |

The link command rejects foreign-company invoice/line identity, inactive or unauthorized roles, non-approved POs, mismatched chassis, and invoice relinking once it is received or in AP settlement. It records actor and before/after line IDs in `audit_logs`. Direct authenticated PO-link writes cannot bypass the command. The live test proves linked invoice creation and link audit commit atomically, including rollback of a rejected foreign line.

## Chain verified on live disposable rows

- PO creation records company, actor, line ownership and server-computed RM 80,000. Invalid jump, Accounts approval, foreign-company transition, foreign-company read, and draft GRN are rejected.
- Partial GRN leaves the PO approved; over-receipt is rejected. Final GRN fulfills it. The GRN Vehicle side effect and invoice receipt reconcile to one same-company chassis, and invoice receipt records the explicit branch and received state.
- The match RPC reports `unmatched`, `pending_receipt`, `amount_variance` at RM 2 difference, and `matched` at RM 0 difference. SQL and existing UI use RM 1 tolerance. A foreign actor cannot read the match. Backend AP approval refuses both pending receipt and amount variance; verification before physical invoice receipt fails.
- Accounts verifies and management approves the matched invoice. Foreign-company AP and payment calls, unauthorized approval, overpayment and direct payment-event mutation are rejected. Supplier settlement records RM 80,000 and aging becomes zero.
- Finance posts that payment once as a journal sourced from the supplier event: RM 80,000 debit to AP (`2100`) and RM 80,000 credit to Cash (`1000`). Replay returns the same journal. The period close summary moves from one unposted AP event to zero and balances exactly. Trial Balance includes both the AP debit and Cash credit. The authoritative close records actor, timestamp and audit while the period has no unposted AR or AP source events.
- A posted-payment reversal leaves the closed historical journal header and lines intact, writes the offsetting RM 80,000 debit/credit adjustment in a current open period, reopens the invoice to approved/unpaid, and restores RM 80,000 AP aging.
- A separate full-quantity fixture exercises the deterministic two-caller GRN race. Another approved PO/PI fixture proves tenant link denial and backend refusal of `pending_receipt` and `amount_variance` at AP approval and payment.

## Validation

- Fresh isolated Supabase rebuild, schema lint and four RLS/security audits: passed.
- Live suite: **17 files, 211 tests passed**, including the new three-test UAT spec, existing PI receipt, AP and Finance settlement suites.
- `npm run check:baseline`: passed (repository hygiene, lint, TypeScript and architecture checks, unit tests, security checks, dependency audit, bundle budget and UBS/HRMS builds).
- Relevant Chromium browser suite: **17 passed**, covering PO list/create/detail, three-way match, invoice linking and Finance period close. The focused invoice-link test checks required PO-line selection, visible order/receipt data, and the canonical ID sent by the form. Mocked browser tests establish UI behavior only; they are not database evidence.

## Remaining limits

- A quantity-2 PO line with one chassis produces one canonical Vehicle. The fixture proves no duplicate Vehicle on the GRN/PI handoff, but it does not establish per-unit chassis identity for quantity-based purchasing. Automotive unit modeling needs a separate decision.
- One PI references one PO line. Whether partial receipts may be invoiced/paid, multiple invoices may cover a line, or variances may be approved by an explicit override requires business policy. Current backend approval safely requires `matched` for a linked invoice. Standalone invoices remain an existing separate AP path.
- PO and PI supplier text remains descriptive; this work does not claim supplier-master reconciliation. No name, model or chassis string is used as the authoritative PI→PO relationship.
- This is local disposable UAT, not deployed-tenant, real-user, supplier, bank, production Finance, or #48 recovery evidence. Broader browser role/responsive and historical data reconciliation remain open.
