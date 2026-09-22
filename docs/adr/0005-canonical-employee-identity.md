# ADR 0005: Canonical Employee Identity

**Status:** Accepted  
**Date:** 2026-09-22

## Context

Employee information participates in HRMS, Sales ownership, approvals, Internal Requests, payroll, future commission, branch reporting, and management analytics. Treating user accounts, sales-advisor rows, and employee records as interchangeable identities would force name-based reconciliation and duplicate workforce truth.

## Decision

`employees` is the canonical workforce identity.

`profiles` represents authenticated application identity. `profiles.employee_id` is the canonical optional User -> Employee relationship.

A person may exist as an Employee without having a User account. A User account is not itself the workforce record.

Sales Advisor is modeled as a sales assignment/registry relationship to an Employee, not as a second independent person identity. New cross-domain work should prefer an Employee-backed advisor relationship and should not copy mutable HR attributes into Sales as authoritative data.

## Consequences

- HRMS owns employment lifecycle and organisation assignment.
- Sales may reference employee identity but cannot update HR employment fields.
- Commission and analytics can use `employee_id` consistently.
- Legacy duplicated fields remain temporarily for compatibility and reconciliation.
