# 05 — DMSv3 Target Lifecycle and Schema

**Status:** TARGET DMSv3 schema contract  
**Effective design date:** 2026-10-01

This is the implementation target. It is additive: current fields/tables remain until reconciliation and caller migration are complete.

## 1. Target business lifecycle

### Upstream DMS funnel

**DMS Lead (optional) → DMS Prospect / Direct Prospect**

No canonical UBS Deal is required merely because a Lead/Prospect exists.

### Canonical FLC Booking / Case

A Deal is the canonical local **FLC Booking/Case**.

It may be created **before** Proton creates the official Retail Order/Booking No, once genuine purchase intent and sufficient information/documents exist.

The official Proton Retail Order is then linked as an upstream source fact. It is not the Deal's technical identity.

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

**FLC Booking/Case → Proton Retail Order reconciliation → Financing/LOU → Stock Request/Reservation/Allocation → Registration → Delivery → Invoice Submitted → Accounts-verified Disbursement/Settlement → Completed**

### Cash / non-financed path

**FLC Booking/Case → Proton Retail Order reconciliation → Stock Control as needed → cash credit confirmed → Registration → Delivery → Settlement/Completed**

No bank Invoice Submitted or bank Disbursement state is created for Cash.

No fake Loan, LOU or bank Disbursement state is created for a non-loan Deal.

## 2. Parallel sub-workflows

### Financing

Loan Application state:

- draft
- submitted
- approved
- rejected
- cancelled

LOU/offer-letter evidence is a separate versioned record associated with an approved application.

The selected downstream Financing disposition is also separate from the application itself.

Bank submission and actual Disbursement remain later independent dimensions.

### Stock Control

Inventory-owned transactional concepts:

- stock request;
- reservation;
- reservation term/extension;
- reservation release/pre-emption;
- allocation;
- reallocation;
- Waiting-for-Stock/LNS demand.

Reservation and Allocation are deliberately separate.

### Vehicle / Physical Inventory

Inventory-owned events:

- procurement/VAA evidence;
- shipment;
- ETA update;
- outlet receipt / On Hands;
- transfer;
- physical-state correction;
- customer-delivery reaction.

OBR is derived from allocation + physical receipt state; it is not a physical-state row by itself.

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

### Payments / Settlement

Accounts-owned events for:

- booking deposit;
- refund;
- forfeiture where applicable;
- customer receipt;
- deposit application;
- verified bank credit;
- payment allocation;
- Official Receipt;
- adjustments/reversals.

Financing may record the operational bank-disbursement report/reference, but Accounts owns verification of actual bank credit.

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
| deal_no | text | UBS/local FLC case display number |
| case_opened_date | date | FLC Booking/Case business date |
| proton_booking_no | text nullable compatibility/cache | official Proton business key; source authority remains Proton observation |
| customer_id | FK customers | canonical customer |
| sales_advisor_employee_id | FK employees | canonical Sales Advisor |
| requested_model_id | FK vehicle_models nullable | intended model |
| requested_model_name | text snapshot | display/source snapshot |
| requested_variant | text | requested variant |
| requested_colour | text | requested colour |
| recorded_commercial_terms_version_id | uuid nullable | optional pointer/read optimization to current immutable recorded-terms version; owning terms ledger remains authoritative |
| payment_type_id | FK payment_types | current selected payment path |
| booking_source | text | prospect_conversion / direct_case / migration / legacy compatibility |
| notes | text | local notes |
| created_by | FK profiles | creator |
| created_at / updated_at | timestamps | system timestamps |

Compatibility fields such as old `booking_date`, stage, sales_advisor_id/name, deposit_amount/date, chassis_no, vso_no, selling_price and other commercial amount columns stay temporarily but are not new-write authority.

**Important:** `case_opened_date` and the official Proton Retail Order/Booking Date are different business dates. Official Booking MTD must read the Proton Retail Order observation, not `case_opened_date`.

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
- proton_retail_order
- legacy_sales_order
- collection
- vehicle_match
- delivery
- soa.

Relationship types include:

- origin
- official_booking
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
- registration_payment_gate
- delivery_payment_gate
- registration_requires_vehicle
- delivery_requires_registration
- delivery_requires_insurance
- delivery_requires_vehicle_receipt
- completion_requires_disbursement
- completion_requires_customer_settlement
- deposit_required
- active/version metadata.

Deposit defaults to **not required**. Any future `deposit_required` policy may govern a downstream readiness/action requirement, but it must **never** become a prerequisite for creating the FLC Booking/Case without a new confirmed owner decision.

Possible financing registration gates:

- none
- loan_approved
- lou_received
- lou_verified.

The exact financed gate remains policy-configurable until management confirms the final DMSv3 rule.

For **Cash**, the policy must encode the confirmed rule that customer cash credit is required before Registration.

## 10. deal_workflow_requirements

Snapshot policy values onto the Deal so future policy changes do not rewrite historical meaning.

One row per Deal containing:

- policy_id
- payment_type_id
- financing_required
- financing registration gate
- registration payment gate
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
- created_by
- created_at / updated_at.

Multiple applications per Deal are allowed.

Application approval does not itself select the facility for downstream use.

Rejected/cancelled applications cannot be selected.

## 13. deal_financing_lou_versions

Versioned LOU / loan-offer-letter evidence per financing application:

- id
- company_id
- deal_id
- financing_application_id
- version_no
- lou_reference
- approved_amount nullable
- lou_date
- requirement_version/reference nullable
- evidence_reference
- state current/superseded/stale as a projection or derivable status
- recorded_by
- recorded_at
- correction_reason nullable.

Prior versions are immutable.

A material financing requirement change may make a previously selected LOU stale; the system must not auto-select another application/LOU.

## 14. deal_financing_disposition_versions

Append-only selection of downstream financing mode/context:

- id
- company_id
- deal_id
- version_no
- mode financed/cash
- financing_application_id nullable
- lou_version_id nullable
- selected_by
- selected_at
- selection_reason
- supersedes_version_id nullable.

Rules:

- FINANCED requires a same-Deal approved application and current LOU evidence.
- CASH has no application/LOU relationship.
- current = highest/effective version.
- changing bank/application/LOU or FINANCED↔CASH creates a new version; history is never overwritten.

This selected/current disposition is the financing context used by Registration readiness.

## 15. deal_financing_events

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

## 16. deal_bank_submissions

Financed post-delivery bank-submission evidence:

- id
- company_id
- deal_id
- financing_application_id
- delivery_id
- vso_document_id
- vdo_document_id
- final_invoice_id
- submitted_at
- submission_reference
- submitted_by
- status
- corrected_by / corrected_at nullable
- correction_reason nullable
- created_at.

This models **Invoice Submitted** without turning it into a universal Deal stage.

Cash/non-loan Deals cannot create this record.

## 17. deal_financing_disbursements

Operational financing-side disbursement report/reference:

- id
- company_id
- deal_id
- financing_application_id
- bank_submission_id nullable
- reported_amount
- reported_at
- bank_reference
- source_system/source_record_id
- created_by / created_at.

This is not financial settlement authority.

### Accounts verification linkage

Actual Disbursement is recognized only when Accounts verifies bank-statement credit.

The Accounts-owned payment/receipt record must carry:

- Deal;
- financing application;
- applicable bank submission;
- actual credit amount;
- actual credit/value date;
- bank statement/evidence reference;
- verifier;
- payment allocation;
- Official Receipt reference where issued;
- correction/reversal lineage.

The Deal read model may show the verified disbursement through this link, but Financing may not self-certify bank credit.

## 18. sales_stock_requests

Sales/Stock request:

- id
- company_id
- deal_id
- requested_by_employee_id / profile_id
- request_type
- requested_vehicle_id nullable
- requested_model/variant/colour snapshot as needed
- status
- decision_reason nullable
- decided_by nullable
- requested_at
- decided_at nullable
- created_at.

A Stock Request does not itself reserve or allocate a Vehicle.

## 19. vehicle_reservations

Temporary stock-control hold:

- id
- company_id
- deal_id
- vehicle_id
- status
- financing_basis_snapshot
- responsible_manager_employee_id
- created_by
- reserved_at
- released_at nullable
- release_reason nullable
- converted_allocation_id nullable
- created_at.

Constraints:

- one effective Reservation per Vehicle;
- Reservation is not Allocation;
- expired-but-still-effective Reservation is not Free Stock.

## 20. vehicle_reservation_terms

Append-only term history:

- id
- company_id
- reservation_id
- term_type initial/extension
- policy_id / policy_version
- duration_working_days
- start_at/date
- expires_at/date
- requested_by nullable
- approved_by nullable
- reason nullable
- created_at.

Default policy snapshots:

- no loan/LOU context = 3 working days;
- pending LOU = 7 working days;
- approved LOU = 3 working days.

Expiry does not automatically release the Reservation.

## 21. sales_stock_demands

Waiting-for-Stock / LNS demand:

- id
- company_id
- deal_id
- demand_type
- status
- opened_at
- resolved_at nullable
- source/reason
- created_at.

LNS is derived from authoritative financing context + active demand + absence of qualifying effective Reservation/Allocation.

## 22. vehicle_allocations

Canonical customer-control relationship:

- id
- company_id
- deal_id
- vehicle_id
- status
- source_reservation_id nullable
- assigned_at
- assigned_by
- released_at nullable
- released_by nullable
- release_reason nullable
- superseded_by_allocation_id nullable
- source_system/source_record_id nullable
- created_at.

Constraints:

- one ACTIVE Allocation per Vehicle;
- normal case has at most one ACTIVE allocated Vehicle per Deal unless later policy explicitly permits otherwise;
- sequential allocations are preserved historically;
- there is no permanent lifetime `vehicles.deal_id`.

## 23. vehicle_reallocation_proposals

For controlled cross-responsibility reallocation:

- id
- company_id
- vehicle_id
- from_allocation_id
- target_deal_id
- proposed_by
- decided_by nullable
- status
- reason
- proposed_at
- decided_at nullable.

The approval/decision model must follow current capability/manager ownership rules and remain auditable.

## 24. vehicle_lifecycle_events

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

## 25. deal_registrations

Current Registration projection/aggregate:

- id
- company_id
- deal_id
- vehicle_id
- current_version_no
- status
- current_registration_number
- current_registration_date
- current_plate_no
- current_road_tax_expiry
- submitted_at
- registered_at
- plate_received_at
- created_by
- created_at / updated_at.

One active Registration workflow per Deal.

The authoritative Registration command must validate the current active Allocation linking that Deal and Vehicle. Reservation alone is not sufficient.

Physical IN_TRANSIT / ON_HANDS status is not automatically a hard Registration gate unless a later approved policy explicitly makes it one.

Cancellation after Registration preserves the registration record; PRE-REGISTER is derived rather than destructive.

### deal_registration_versions

Immutable externally completed Registration/correction evidence:

- id
- company_id
- registration_id
- version_no
- registration_number
- registration_date
- plate_no
- road_tax_expiry
- source_system
- source_reference/evidence
- correction_reason nullable
- recorded_by
- recorded_at.

Prior versions cannot be UPDATE/DELETEd through normal application paths.

## 26. deal_registration_events

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

## 27. deal_insurance_policies + events

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

## 28. deal_deliveries

Current Delivery projection/aggregate:

- id
- company_id
- deal_id
- vehicle_id
- current_version_no
- status
- planned_delivery_at nullable
- current_actual_delivery_at nullable
- delivery_branch_id
- handover_employee_id
- recipient_name nullable
- signed_vdo_document_id/evidence_reference
- payment_clearance_payment_event_id nullable
- outstanding_balance_approval_instance_id nullable
- outstanding_balance_snapshot nullable
- created_by
- created_at / updated_at.

Only one successful current Delivery projection per Deal.

### deal_delivery_versions

Append-only Delivery/correction history:

- id
- company_id
- delivery_id
- version_no
- actual_delivery_at
- vehicle_id
- delivery_branch_id
- handover_employee_id
- signed_vdo_document_id/evidence_reference
- payment_clearance_payment_event_id nullable
- outstanding_balance_approval_instance_id nullable
- outstanding_balance_snapshot nullable
- source_system/source_record_id
- correction_reason nullable
- recorded_by
- recorded_at.

A wrong Delivery date/evidence is corrected by a new version or explicit reversal/correction event, never silent overwrite.

## 29. deal_delivery_readiness_v

Derived view, not manually stored booleans.

Fields should include:

- deal_id
- vehicle_assigned
- vehicle_received
- registration_complete
- insurance_ready
- payment_gate_satisfied
- financing_gate_satisfied
- customer_payable_cleared
- director_outstanding_balance_exception
- ready_to_deliver
- blocking_reasons.

## 30. deal_cancellation_reasons

Company-configurable:

- code
- label
- category
- requires_approval
- active/effective metadata.

## 31. deal_cancellations

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

## 32. deal_relationships

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

## 33. invoices.deal_id

Add canonical Deal relationship to Accounts Invoice.

Do not remove sales_order_id compatibility until callers/reconciliation are complete.

One Deal may have more than one Invoice if business rules ever require it.

## 34. recorded commercial terms

Reuse or evolve the current immutable commercial-terms foundation rather than storing a new pricing formula on Deals.

Target requirements:

- Booking/Deal scoped;
- complete immutable version snapshots;
- exact MYR decimals;
- verbatim business line labels/evidence;
- correction appends a full replacement version with mandatory reason;
- prior versions remain immutable;
- no subtotal/OTR/customer-payable/discount/insurance/tax/balance formula is inferred unless separately confirmed and versioned.

The Delivery/payment workflow may read an approved/current commercial-terms snapshot, but cannot derive accounting truth from presentation labels.

## 35. payment_events source linkage

Add optional source linkage:

- source_domain
- source_event_id.

Examples:

- deal_deposit
- verified_bank_credit
- manual_receipt
- dms_reconciliation.

Use unique idempotency constraints where appropriate.

## 36. deal_documents

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

## 37. domain_outbox_events

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

## 38. deal_number_sequences

Replace race-prone MAX+1 number allocation:

- company_id
- branch_id
- year
- month
- next_number
- updated_at

composite PK by company/branch/year/month.

UUID remains actual PK. Any locally generated Deal/Case number is a display/reference key only; the official Proton Booking No remains the Proton business identifier once created.

## 39. Authoritative command surface

Target commands/use cases include:

- create_flc_booking_case
- create_flc_booking_case_from_prospect
- link_proton_retail_order
- reconcile_proton_retail_order
- update_booking_terms
- record_deposit
- refund_deposit
- apply_deposit_to_invoice
- create_financing_application
- submit_financing_application
- record_financing_decision
- record_financing_lou
- correct_financing_lou
- select_financing_disposition
- request_stock
- reserve_vehicle
- extend_vehicle_reservation
- release_vehicle_reservation
- preempt_vehicle_reservation
- allocate_vehicle
- release_vehicle_allocation
- propose_vehicle_reallocation
- decide_vehicle_reallocation
- record_registration_prerequisite
- request_ehak
- record_ehak_received
- grant_registration_blocker_override
- revoke_registration_blocker_override
- prepare_registration
- submit_registration
- record_registration
- record_plate_received
- record_insurance_cover_note
- activate_insurance_policy
- schedule_delivery
- record_delivery
- record_bank_submission
- report_bank_disbursement
- verify_bank_credit
- issue_official_receipt
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

## 40. Direct-DML boundary

Authenticated direct mutation should be removed for authority tables such as:

- deal_workflow_state
- deal_status_events
- deal_deposit_events
- deal_financing_applications
- deal_financing_lou_versions
- deal_financing_disposition_versions
- deal_financing_events
- deal_bank_submissions
- deal_financing_disbursements (Financing-side report/reference only)
- sales_stock_requests
- vehicle_reservations / reservation_terms
- sales_stock_demands
- vehicle_allocations / reallocation_proposals
- deal_registration_prerequisite_versions
- deal_registration_ehak_events
- deal_registration_blocker_overrides
- deal_registrations / registration_versions / events
- deal_insurance policies/events
- deal_deliveries / delivery_versions
- deal_cancellations
- domain_outbox_events.

RLS remains necessary even with commands.

## 41. Canonical read models

### deal_current_state_v

One row per Deal combining:

- FLC Case
- official Proton Retail Order / Booking No / Booking Date
- Employee
- payment path
- workflow state
- selected financing status
- Stock Request/Reservation/Allocation
- Vehicle/chassis
- Vehicle physical state
- Registration
- PRE-REGISTER condition where applicable
- Insurance
- Delivery
- bank submission / Invoice Submitted
- deposit balance
- customer outstanding
- Accounts-verified bank credit/disbursement
- blocker
- days in state.

### deal_timeline_v

Chronological authoritative milestones across:

- DMS Lead/Direct Prospect
- FLC Case creation
- official Proton Retail Order linkage
- deposit
- financing
- LOU
- stock request
- reservation
- allocation/reallocation
- outlet receipt
- registration
- delivery
- bank submission / Invoice Submitted
- Accounts-verified disbursement
- cancellation
- completion.

### sales_funnel_daily_v

Daily/groupable:

- new Leads
- new Prospects
- new FLC Cases
- new official Proton Retail Orders / Bookings
- FLC Cases with/without deposit
- cancellations
- registered
- delivered
- disbursed
- completed.

### deal_cycle_times_v

Examples:

- Lead→Prospect where a Lead exists
- Prospect→FLC Case
- FLC Case→Official Proton Retail Order
- Official Proton Booking→Loan Submission
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

## 42. Current → target stage mapping

Safe conceptual mapping only; migration still requires evidence:

| Current concept | DMSv3 |
|---|---|
| DMS Lead | stays DMS Lead; optional predecessor |
| DMS Prospect | stays DMS Prospect; Direct Prospect allowed |
| Deal lead/prospect | retire as canonical states |
| local Deal Booking | FLC Booking/Case |
| Proton Booking/Retail Order | source-owned official booking linked to case |
| Loan Submission | financing + financing event |
| LOU | financing milestone |
| Shipment | Inventory event |
| Receive | Inventory outlet-receipt event |
| Registration | registration sub-workflow / high-level registration |
| Delivery | delivery event / high-level delivery |
| Disbursement | Accounts-verified bank-credit settlement event / high-level settlement |
| Completed | server-validated completed |
| Cancel | first-class cancelled |

Do not blindly map legacy “completed,” because historical migrations used completed-like outcomes for Car Out, Cancel and Passed.

## 43. “New without Deposit” migration rule

Target meaning:

- New without Deposit → Booking, no deposit event.
- New with Deposit → Booking, deposit event(s) where actual receipt evidence exists.

Do not create financial receipt history solely from an old amount field without reconciliation evidence.

## 44. Idempotency

Stable keys required for replayed DMS evidence, e.g.:

- company + local case creation request idempotency key;
- company + DMS Prospect external ID where conversion creates/links a case;
- company + DMS Retail Order ID for official Proton link;
- company + stock request/reservation/allocation command idempotency keys;
- company + DMS vehicle-match ID for source allocation reconciliation;
- company + DMS delivery ID for delivery evidence;
- company + DMS collection ID for settlement evidence.

Replay must not duplicate canonical events.

## 45. Index/constraint requirements

At minimum index:

- Deal by company/case-opened date
- Deal by branch/case-opened date
- source link by Proton Retail Order/Booking No
- Deal by Employee/date
- workflow status/entered-at
- event tables by Deal/event time
- source links by source identity
- financing by Deal/status
- effective Reservations by Vehicle
- active Allocations by Deal/Vehicle
- active stock demand by Deal
- reallocation proposals by Vehicle/status
- registration status/date
- delivery status/date.

Use partial unique constraints for:

- one selected financing facility;
- one active allocated Vehicle per normal Deal;
- one active Registration workflow;
- one successful Delivery event;
- idempotency keys.

## 46. Compatibility policy

Do not drop V1 tables/columns while:

- unresolved historical rows exist;
- callers still read them;
- reports use them;
- rollback needs them.

V2 commands write V2 authority.

Compatibility views/adapters may expose old shapes during cutover.

No dual independent truth.


## 47. Official Proton Retail Order read model

DMSv3 should expose a canonical read-only projection over the accepted Proton Retail Order observation for each linked Deal, including:

- source Retail Order ID;
- Proton Booking No;
- official Booking Date;
- Booking status;
- Register status;
- allocation observation;
- source freshness;
- reconciliation state.

This projection is source-owned and must not be edited as local Deal state.

Official Booking MTD reads this projection/source population.

## 48. Business-calendar / Reservation policy tables

Reuse existing governed configuration tables where current UBS already has an equivalent.

If absent, add versioned configuration for:

- Sabah working calendar / holidays;
- Reservation basis policy;
- working-day duration;
- effective dates;
- version;
- active state.

Historical Reservation terms store the selected policy/version snapshot.

## 49. Delivery financial exception evidence

A successful Delivery must store or reference the evidence used for its customer-payable gate:

Normal case:
- Accounts-derived customer-payable cleared fact.

Exception case:
- canonical approval_instance_id / approval decision;
- outstanding amount snapshot;
- reason;
- actor/time.

Delivery does not directly mutate Accounts balances.

## 50. PRE-REGISTER read model

Create a derived read model such as `vehicle_commercial_condition_v` or extend an existing Inventory projection.

PRE-REGISTER means:

- authoritative Registration remains on the chassis;
- original commercial case is no longer active for that vehicle;
- vehicle may be eligible for a later sequential case under policy.

PRE-REGISTER is not a destructive Registration reversal and not a Vehicle physical-state value.


## 51. deal_registration_prerequisite_versions

Append-only Registration-preparation facts. Do not store one mutable “Focus Register status.”

Suggested fields:

- id
- company_id
- deal_id
- disposition_version_id
- prerequisite_kind
- assertion_state asserted/withdrawn
- business_date nullable
- evidence_reference nullable
- source_system/source_record_id nullable
- recorded_by
- recorded_at
- supersedes_version_id nullable
- correction_reason nullable.

Initial prerequisite kinds reconstructed from the established baseline:

- AGREEMENT_SIGNED
- SOLA_APPLICABILITY
- SOLA_CLEARANCE
- SPECIAL_PLATE_PROCESS.

### Customer payment clearance

In the old clean-sheet implementation this was an operational attestation because no Accounts ledger existed.

In current UBS, **Accounts-owned payment/receivable truth should be used where available**. Do not recreate an independent Sales attestation that can contradict Accounts.

Legacy payment-clearance attestations may be migrated as evidence with provenance, not promoted blindly to financial truth.

## 52. deal_registration_ehak_events

Append-only EHAK preparation history, bound to the selected/current financing-disposition context:

- id
- company_id
- deal_id
- disposition_version_id
- event_type requested/received/cancelled_or_corrected as approved
- business_date/time
- evidence_reference
- actor_profile_id
- source_system/source_record_id
- created_at.

Rules:

- financed disposition may require EHAK;
- Cash = not applicable;
- changing selected financing starts a new disposition context;
- old EHAK evidence does not silently satisfy the new context;
- duplicate concurrent event creation must be idempotent/serialized.

## 53. deal_registration_blocker_overrides

Narrowly scoped auditable override history:

- id
- company_id
- deal_id
- blocker_code
- disposition_version_id nullable
- status active/revoked
- reason
- approval_instance_id or authorized actor evidence
- granted_by / granted_at
- revoked_by / revoked_at nullable.

Historical established behavior allowed only a narrowly scoped customer-payment-clearance blocker override and did **not** allow EHAK/stock/stale-financing override.

Current UBS implementation must reconcile this rule against the Accounts and canonical Workflow domains before enabling it.

No generic “override all blockers” capability is allowed.

## 54. registration_readiness_policy_versions

Versioned configuration used only for **derived** readiness/forecast scoring:

- id
- company_id
- version_no
- effective_from
- effective_to nullable
- policy_json / typed columns as implementation chooses
- created_by
- created_at
- active.

Policy may contain:

- blocker expected-clearance working days;
- readiness weights;
- forecast thresholds;
- ETA/logistics confidence factors.

Readiness score is derived. It is not Registration truth.

No production probability/threshold may be invented if not approved.

## 55. manager_registration_forecasts

Append-only management forecast history:

- id
- company_id
- deal_id
- closing_month
- manager_label / forecast value
- reason
- system_readiness_snapshot nullable
- system_confidence_snapshot nullable
- blocker_snapshot nullable
- policy_version_id nullable
- recorded_by
- recorded_at.

A manager forecast is a forecast decision/history record; it never creates actual Registration.

## 56. month_closing_configurations

Versioned/configured month-closing boundary where management does not use normal calendar month end:

- id
- company_id
- year_month
- closing_date
- reason/source
- created_by
- created_at.

Default may be calendar month end where policy says so; no Proton-specific closing date may be invented.

## 57. registration readiness derivation

Target Registration readiness is a read model derived from authoritative facts.

At minimum it should consider:

### All paths

- active Allocation matching Deal + Vehicle;
- selected/current payment/financing disposition;
- applicable special-plate process;
- authoritative customer-payment clearance from Accounts/current approved evidence.

### Financed

- selected approved/current financing application + current LOU;
- Agreement evidence;
- applicable SOLA evidence;
- EHAK received for the current disposition context.

### Cash

- confirmed cash credit before Registration;
- no EHAK requirement;
- no fake LOU requirement.

### Logistics

IN_TRANSIT / ON_HANDS / ETA remain informational factors unless a later approved policy makes a specific logistics fact a hard gate.

### Output

Return:

- ELIGIBLE / INELIGIBLE / UNKNOWN;
- explicit blocker codes;
- blocker opened-at/working-day age where deterministic;
- readiness score only when policy and source coverage permit;
- source freshness.

UNKNOWN must never silently become eligible.

The actual Registration command re-derives authoritative facts under lock; it must not trust a previously displayed readiness response.
