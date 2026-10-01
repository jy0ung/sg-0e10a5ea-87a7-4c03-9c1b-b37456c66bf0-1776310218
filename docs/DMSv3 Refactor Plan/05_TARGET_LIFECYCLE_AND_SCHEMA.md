# 05 — DMSv3 Target Lifecycle and Schema

**Status:** TARGET DMSv3 schema contract  
**Effective design date:** 2026-10-01

This is the implementation target. It is additive: current fields/tables remain until reconciliation and caller migration are complete.

## 1. Target business lifecycle

### Upstream DMS funnel

**DMS Lead → DMS Prospect**

No canonical UBS Deal is required merely because a Lead/Prospect exists.

### Canonical FLC Deal

A Deal begins at **Booking**.

High-level Deal workflow:

- booking
- financing
- registration
- delivery
- settlement
- completed
- cancelled

Not all Deals visit every state.

### Financed path

**Booking → Financing → Registration → Delivery → Settlement/Disbursement → Completed**

### Non-financed path

**Booking → Registration → Delivery → Settlement if required → Completed**

No fake Loan, LOU or bank Disbursement state is created for a non-loan Deal.

## 2. Parallel sub-workflows

### Financing

- draft
- submitted
- approved
- rejected
- cancelled
- lou_received
- lou_verified
- disbursing
- disbursed

### Vehicle

Inventory-owned events:

- allocation/reservation
- shipment
- ETA update
- outlet receipt
- registration readiness
- release/reallocation
- customer delivery reaction

### Registration

- pending
- documents_ready
- submitted
- registered
- plate_received
- cancelled

### Insurance

- pending
- cover_note_issued
- policy_active
- expired
- cancelled

### Delivery

- planned
- ready
- delivered
- cancelled

### Payments

Accounts-owned events for:

- booking deposit
- refund
- forfeiture where applicable
- customer receipt
- deposit application
- bank proceeds reconciliation
- adjustments/reversals.

## 3. Keep existing canonical foundations

Do not recreate:

- companies
- branches
- profiles
- employees
- employee_module_assignments
- customers
- banks
- payment_types
- vehicles
- invoices
- payment_events
- official_receipts
- accounts
- accounting_periods
- journal_entries / lines
- approval_instances / approval_decisions
- audit_logs
- sync_runs
- dms_raw_*
- source_reconciliation_matches/events
- normalizer_column_authority.

## 4. deals — canonical commercial aggregate

Keep deals as the canonical Sales aggregate.

Target authoritative fields for new V2 Deals:

| Column | Type / relationship | Meaning |
|---|---|---|
| id | uuid PK | internal Deal identity |
| company_id | FK companies | tenant |
| branch_id | FK branches | Booking transaction outlet |
| deal_no | text | UBS display/business number |
| booking_date | date | canonical Booking business date |
| customer_id | FK customers | canonical customer |
| sales_advisor_employee_id | FK employees | canonical Sales Advisor |
| requested_model_id | FK vehicle_models nullable | intended model |
| requested_model_name | text snapshot | display/source snapshot |
| requested_variant | text | requested variant |
| requested_colour | text | requested colour |
| selling_price | numeric | commercial amount |
| discount_amount | numeric | discount |
| accessories_amount | numeric | accessories |
| total_amount | numeric | derived commercial total |
| payment_type_id | FK payment_types | current selected payment path |
| booking_source | text | dms / ubs_manual / legacy / migration |
| notes | text | local notes |
| created_by | FK profiles | creator |
| created_at / updated_at | timestamps | system timestamps |

Compatibility fields such as old stage, sales_advisor_id/name, deposit_amount/date, chassis_no and vso_no stay temporarily but are not new-write authority.

## 5. deal_workflow_state

One current-state row per Deal:

- deal_id PK/FK
- company_id
- workflow_version = 2
- status
- status_entered_at
- state_version
- updated_by
- updated_at.

Allowed V2 states:

- booking
- financing
- registration
- delivery
- settlement
- completed
- cancelled

Direct authenticated UPDATE prohibited.

## 6. deal_status_events

Immutable Deal state history:

- id
- company_id
- deal_id
- from_status
- to_status
- reason_code
- reason_text
- actor_profile_id
- source
- idempotency_key
- occurred_at
- created_at.

Sources:

- user_command
- dms_reconciliation
- migration
- system.

## 7. deal_source_links

Explicit provenance:

- id
- company_id
- deal_id
- source_system
- source_kind
- source_table
- source_record_id
- external_id
- relationship_type
- reconciliation_match_id
- is_primary
- linked_by
- linked_at.

Source kinds include:

- lead
- prospect
- sales_order / retail_order
- collection
- vehicle_match
- delivery
- soa.

Relationship types include:

- origin
- booking_evidence
- customer_evidence
- payment_evidence
- allocation_evidence
- registration_evidence
- delivery_evidence.

## 8. lead_followups v2

Lead/Prospect remains DMS-owned.

Local CRM follow-up records should carry:

- company_id
- source_kind lead/prospect
- source_external_id
- source_raw_id
- sales_advisor_employee_id where resolved
- notes
- outcome
- next_action_date
- author_profile_id
- created_at
- corrected_at.

DMS source status is not rewritten.

## 9. sales_workflow_policies

Version/effective-date configuration by company/payment type:

- company_id
- payment_type_id
- effective_from / effective_to
- financing_required
- financing_registration_gate
- delivery_payment_gate
- registration_requires_vehicle
- delivery_requires_registration
- delivery_requires_insurance
- delivery_requires_vehicle_receipt
- completion_requires_disbursement
- completion_requires_customer_settlement
- deposit_required
- active/version metadata.

Deposit defaults to **not required** unless an approved payment-type policy says otherwise.

Possible financing registration gates:

- none
- loan_approved
- lou_received
- lou_verified.

The selected value is an OPEN POLICY until management confirms it.

## 10. deal_workflow_requirements

Snapshot policy values onto the Deal so future policy changes do not rewrite historical meaning.

One row per Deal containing:

- policy_id
- payment_type_id
- financing_required
- financing registration gate
- delivery gates
- completion gates
- deposit requirement
- created_at.

## 11. deal_deposit_events

Immutable Deal-context deposit events:

- id
- company_id
- deal_id
- event_type
- amount
- event_date
- payment_method
- receipt_reference
- official_receipt_id
- invoice_id
- related_event_id
- reversal_of_event_id
- source_system/source_record_id
- created_by
- created_at.

Event types:

- received
- refunded
- forfeited
- applied_to_invoice
- adjustment
- reversal.

No event means Booking without deposit is still valid.

Actual financial posting/allocation remains Accounts-owned.

## 12. deal_financing_applications

Support more than one bank attempt per Deal:

- id
- company_id
- deal_id
- bank_id
- bank_name_snapshot
- application_ref
- requested_amount
- approved_amount
- loan_type
- tenure
- interest_rate
- monthly_installment
- status
- is_selected
- selected_at / selected_by
- submitted_at
- approved_at
- rejected_at
- rejection_reason
- lou_reference
- lou_received_at
- lou_verified_at
- created_by
- created_at / updated_at.

Only one selected facility per Deal.

Rejected/cancelled application cannot be selected.

## 13. deal_financing_events

Append-only financing history:

- financing_application_id
- deal_id
- from_status
- to_status
- event_type
- external_reference
- notes
- actor_profile_id
- source_system/source_record_id
- occurred_at
- created_at.

## 14. deal_financing_disbursements

Operational bank disbursement evidence:

- id
- company_id
- deal_id
- financing_application_id
- amount
- disbursed_at
- bank_reference
- verification_status
- verified_by / verified_at
- payment_event_id nullable
- source_system/source_record_id
- reversal_of_id
- created_by / created_at.

Verification states:

- reported
- verified
- rejected
- reversed.

Operational evidence and Accounts receipt are linked but not conflated.

## 15. deal_vehicle_assignments

Canonical Deal ↔ Vehicle history:

- id
- company_id
- deal_id
- vehicle_id
- assignment_type reservation/allocation
- assigned_at/by
- released_at/by
- release_reason
- source_system/source_record_id
- created_at.

Constraints:

- one active allocated Vehicle per normal Deal unless later policy explicitly permits otherwise;
- one Vehicle cannot be actively allocated to two active Deals;
- reallocation preserves history.

## 16. vehicle_lifecycle_events

Inventory-owned event history:

- id
- company_id
- vehicle_id
- event_type
- event_at
- branch_id
- source_system/source_record_id
- external_ref
- actor_profile_id
- metadata
- created_at.

Initial event vocabulary:

- allocated
- shipment_started
- shipment_eta_updated
- outlet_received
- registration_ready
- released
- customer_delivered.

Current Vehicle milestone columns may remain as compatibility/read-model fields during migration.

## 17. deal_registrations

Authoritative Registration workflow:

- id
- company_id
- deal_id
- vehicle_id
- status
- jpj_reference
- registration_number
- registration_date
- plate_no
- road_tax_expiry
- submitted_at
- registered_at
- plate_received_at
- created_by
- created_at / updated_at.

One active Registration workflow per Deal.

## 18. deal_registration_events

Immutable transitions:

- registration_id
- deal_id
- from_status
- to_status
- source_system/source_record_id
- external_ref
- actor_profile_id
- occurred_at
- created_at.

## 19. deal_insurance_policies + events

Policy record:

- company_id
- deal_id
- vehicle_id
- insurer_id
- policy/cover-note number
- premium
- coverage type
- start/expiry
- status
- cover-note/policy timestamps
- created_by
- timestamps.

Keep append-only transition/event history.

## 20. deal_deliveries

Customer handover:

- id
- company_id
- deal_id
- vehicle_id
- status
- planned_delivery_at
- actual_delivery_at
- delivery_branch_id
- handover_employee_id
- recipient_name
- proof document link
- source_system/source_record_id
- created_by
- timestamps.

Only one successful delivered event per Deal.

## 21. deal_delivery_readiness_v

Derived view, not manually stored booleans.

Fields should include:

- deal_id
- vehicle_assigned
- vehicle_received
- registration_complete
- insurance_ready
- payment_gate_satisfied
- financing_gate_satisfied
- ready_to_deliver
- blocking_reasons.

## 22. deal_cancellation_reasons

Company-configurable:

- code
- label
- category
- requires_approval
- active/effective metadata.

## 23. deal_cancellations

One authoritative cancellation:

- deal_id unique
- reason_id
- notes
- cancelled_at/by
- approval_instance_id
- deposit_resolution_status
- vehicle_release_required
- created_at.

Deposit resolution states:

- not_applicable
- pending
- refunded
- forfeited
- transferred.

Actual monetary movements still use Accounts/deposit events.

## 24. deal_relationships

Preserve rebooking/replacement history:

- from_deal_id
- to_deal_id
- relationship
- created_by
- created_at.

Types:

- rebooked_as
- replacement_for
- duplicate_of
- supersedes.

## 25. invoices.deal_id

Add canonical Deal relationship to Accounts Invoice.

Do not remove sales_order_id compatibility until callers/reconciliation are complete.

One Deal may have more than one Invoice if business rules ever require it.

## 26. payment_events source linkage

Add optional source linkage:

- source_domain
- source_event_id.

Examples:

- deal_deposit
- bank_disbursement
- manual_receipt
- dms_reconciliation.

Use unique idempotency constraints where appropriate.

## 27. deal_documents

Preserve existing document table and add scope metadata:

- domain_scope
- related_entity_type
- related_entity_id.

Scopes:

- booking
- financing
- insurance
- registration
- delivery
- payment
- cancellation
- other.

Documents support evidence but do not decide workflow state.

## 28. domain_outbox_events

Transactional cross-domain event outbox:

- id
- company_id
- aggregate_type
- aggregate_id
- event_type
- event_version
- payload
- idempotency_key
- occurred_at
- published_at
- created_at.

Examples:

- deal.booking.created
- deal.financing.submitted
- deal.financing.approved
- deal.vehicle.allocated
- deal.registration.completed
- deal.delivery.completed
- deal.disbursement.verified
- deal.cancelled
- deal.completed.

## 29. deal_number_sequences

Replace race-prone MAX+1 number allocation:

- company_id
- branch_id
- year
- month
- next_number
- updated_at

composite PK by company/branch/year/month.

UUID remains actual PK.

## 30. Authoritative command surface

Target commands/use cases include:

- create_booking
- create_booking_from_dms_source
- update_booking_terms
- record_deposit
- refund_deposit
- apply_deposit_to_invoice
- create_financing_application
- submit_financing_application
- record_financing_decision
- record_lou_received
- verify_lou
- select_financing_application
- assign_vehicle_to_deal
- release_vehicle_from_deal
- prepare_registration
- submit_registration
- record_registration
- record_plate_received
- record_insurance_cover_note
- activate_insurance_policy
- schedule_delivery
- record_delivery
- record_bank_disbursement
- verify_bank_disbursement
- cancel_deal
- complete_deal.

Each command:

1. derives actor from auth.uid();
2. derives/validates company;
3. locks authoritative rows where needed;
4. validates role/capability;
5. validates current state and prerequisites;
6. changes current-state snapshot;
7. appends immutable event;
8. appends audit evidence;
9. appends outbox event where applicable;
10. commits atomically.

## 31. Direct-DML boundary

Authenticated direct mutation should be removed for authority tables such as:

- deal_workflow_state
- deal_status_events
- deal_deposit_events
- deal_financing_applications/events/disbursements
- deal_vehicle_assignments
- deal_registrations/events
- deal_insurance policies/events
- deal_deliveries
- deal_cancellations
- domain_outbox_events.

RLS remains necessary even with commands.

## 32. Canonical read models

### deal_current_state_v

One row per Deal combining:

- Booking
- Employee
- payment path
- workflow state
- selected financing status
- Vehicle/chassis
- Vehicle state
- Registration
- Insurance
- Delivery
- deposit balance
- customer outstanding
- verified disbursement
- blocker
- days in state.

### deal_timeline_v

Chronological authoritative milestones across:

- DMS Lead/Prospect
- Booking
- deposit
- financing
- LOU
- allocation
- outlet receipt
- registration
- delivery
- disbursement
- cancellation
- completion.

### sales_funnel_daily_v

Daily/groupable:

- new Leads
- new Prospects
- new Bookings
- with/without deposit
- cancellations
- registered
- delivered
- disbursed
- completed.

### deal_cycle_times_v

Examples:

- Lead→Prospect
- Prospect→Booking
- Booking→Loan Submission
- Loan Submission→Approval
- LOU→Allocation
- Allocation→Registration
- Registration→Delivery
- Delivery→Disbursement
- Booking→Delivery
- Booking→Completion.

### deal_blockers_v

Operational queue:

- blocker type
- blocker since
- owner domain
- age
- next action.

## 33. Current → target stage mapping

Safe conceptual mapping only; migration still requires evidence:

| Current concept | DMSv3 |
|---|---|
| DMS Lead | stays DMS Lead |
| DMS Prospect | stays DMS Prospect |
| Deal lead/prospect | retire as canonical states |
| Booking | booking |
| Loan Submission | financing + financing event |
| LOU | financing milestone |
| Shipment | Inventory event |
| Receive | Inventory outlet-receipt event |
| Registration | registration sub-workflow / high-level registration |
| Delivery | delivery event / high-level delivery |
| Disbursement | financing settlement event / high-level settlement |
| Completed | server-validated completed |
| Cancel | first-class cancelled |

Do not blindly map legacy “completed,” because historical migrations used completed-like outcomes for Car Out, Cancel and Passed.

## 34. “New without Deposit” migration rule

Target meaning:

- New without Deposit → Booking, no deposit event.
- New with Deposit → Booking, deposit event(s) where actual receipt evidence exists.

Do not create financial receipt history solely from an old amount field without reconciliation evidence.

## 35. Idempotency

Stable keys required for replayed DMS evidence, e.g.:

- company + DMS Prospect external ID for Prospect conversion;
- company + DMS Retail Order ID for Booking;
- company + DMS vehicle-match ID for allocation;
- company + DMS delivery ID for delivery evidence;
- company + DMS collection ID for settlement evidence.

Replay must not duplicate canonical events.

## 36. Index/constraint requirements

At minimum index:

- Deal by company/booking date
- Deal by branch/date
- Deal by Employee/date
- workflow status/entered-at
- event tables by Deal/event time
- source links by source identity
- financing by Deal/status
- active Vehicle assignments by Deal/Vehicle
- registration status/date
- delivery status/date.

Use partial unique constraints for:

- one selected financing facility;
- one active allocated Vehicle per normal Deal;
- one active Registration workflow;
- one successful Delivery event;
- idempotency keys.

## 37. Compatibility policy

Do not drop V1 tables/columns while:

- unresolved historical rows exist;
- callers still read them;
- reports use them;
- rollback needs them.

V2 commands write V2 authority.

Compatibility views/adapters may expose old shapes during cutover.

No dual independent truth.
