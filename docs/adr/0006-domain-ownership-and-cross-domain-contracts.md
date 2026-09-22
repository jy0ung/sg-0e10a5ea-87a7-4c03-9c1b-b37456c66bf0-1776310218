# ADR 0006: Domain Ownership And Cross-Domain Contracts

**Status:** Accepted  
**Date:** 2026-09-22

## Context

A unified business suite needs information from many modules, but direct cross-table writes from pages or foreign domain services create partial updates, permission drift, and unclear ownership.

## Decision

Every canonical entity has one authoritative domain owner.

Other domains may read authorized data, but state changes must pass through the owning domain's service, RPC, or command.

Page components must not orchestrate multi-domain database writes.

Examples:

- Internal Requests may coordinate an approved employee-transfer request, but HRMS executes the employee transfer.
- Sales may display employee/branch data, but HRMS owns employment assignments.
- Purchasing may create an AP-relevant supplier invoice state, but Accounts owns settlement state.
- Accounts may trigger accounting consequences, but Finance owns journal posting.
- HRMS Payroll may consume commission earnings, but Commission owns the calculation and rule version.

RLS remains the security authority. Domain contracts are an additional correctness and maintainability boundary.

## Consequences

- Services/packages become clearer units of ownership.
- Atomic RPCs are preferred for sensitive multi-row state transitions.
- Compatibility shims may remain during migration but may not gain new domain responsibilities.
