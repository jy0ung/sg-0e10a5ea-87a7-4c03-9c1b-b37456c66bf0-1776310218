# Business Core Identity Reconciliation

**Status:** Operator runbook  
**Issue:** #90  
**Safety:** Read-only

This runbook accompanies `scripts/business-core-identity-reconciliation.sql`. The pack measures remaining identity exceptions before any further schema hardening, compatibility retirement, or automatic data repair.

## What the pack checks

The SQL produces a summary plus detailed exception rows for:

- Profile -> Employee links and duplicated workforce-field drift;
- Employee Branch, manager, Department, and Job Title references;
- Deal canonical salesperson ownership;
- legacy `sales_advisors` compatibility rows;
- Vehicle salesperson compatibility through the existing Profile -> Employee chain.

It does not modify data.

## Company scope

The SQL contains the literal token:

`__COMPANY_ID__`

To audit one company, replace every occurrence with the exact company ID before execution.

To audit all companies, leave the token unchanged. The query converts the untouched token to NULL and does not apply a tenant filter.

Do not replace the token with a company name, branch code, or display label.

## Execution

Use an authorized read-capable PostgreSQL/Supabase SQL session. Review the SQL before execution and retain the repository commit SHA with the evidence.

The first result set is the summary. It is suitable for recording exception **counts** in an issue or change record.

Subsequent result sets provide detailed rows for investigation.

## Evidence handling

Do not commit query result exports containing employee names, email addresses, IC/NRIC, phone numbers, chassis numbers, or other operational/customer data.

Repository evidence should contain only non-sensitive information such as:

- execution date;
- repository commit SHA;
- company scope identifier where appropriate;
- exception category;
- exception count;
- reviewer/decision notes;
- whether a follow-up migration is blocked or safe to specify.

Store any detailed working export only in the approved operational location for sensitive business data.

## Reconciliation rules

### Profile / Employee

`employees` is workforce truth. `profiles` is account truth.

A mismatch in duplicated Profile workforce fields is evidence for caller migration or data review. It is not permission to overwrite either record automatically.

### Employee organisation references

Branch, manager, Department, and Job Title exceptions must be reviewed before adding stronger physical foreign keys or tenant constraints.

The supported Employee mutation command already rejects new cross-company references, but older data may predate that command.

### Deal salesperson

`deals.sales_advisor_employee_id` is canonical.

`deals.sales_advisor_id` is Profile/account compatibility. A missing or disagreeing Profile link is an exception; do not replace the canonical Employee value from a display name.

### Legacy Sales Advisor

The legacy `sales_advisors` table is compatibility/import data.

The reconciliation pack permits one deterministic candidate rule only:

- same company; and
- normalized legacy Advisor code equals canonical Employee staff code.

The candidate must then be checked for the canonical active `sales / sales_advisor` module assignment.

Names, email addresses, IC/NRIC, and phone numbers are not automatic join keys. Ambiguous or unmatched rows require manual review.

### Vehicle salesperson

`vehicles.salesman_id` is an existing Profile FK. Therefore the only deterministic Employee candidate in this pack is:

`vehicles.salesman_id -> profiles.id -> profiles.employee_id -> employees.id`

`salesman_name` is source/display evidence only. A name-only vehicle remains unresolved in this slice.

## What a zero count means

A zero exception count means the checked condition was not found at execution time. It does not by itself authorize a destructive migration.

Before retiring compatibility state or adding new constraints, also confirm:

- all runtime callers use the canonical identity;
- relevant historical/reporting paths are covered;
- rollback/application compatibility is defined;
- release gates are green;
- production execution evidence is reviewed where production data is material.

## What this slice does not do

This reconciliation pack does not:

- repair rows;
- backfill Employee links;
- add or validate constraints;
- retire Profile workforce fields;
- delete legacy Sales Advisor rows;
- rewrite Vehicle salesperson identity;
- deploy production.

Those are separate, measured implementation slices.
