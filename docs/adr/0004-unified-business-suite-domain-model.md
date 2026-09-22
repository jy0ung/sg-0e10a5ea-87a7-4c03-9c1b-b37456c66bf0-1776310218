# ADR 0004: Unified Business Suite Domain Model

**Status:** Accepted  
**Date:** 2026-09-22

## Context

FLC UBS already spans Sales, Inventory, Purchasing, Finance, HRMS, Internal Requests, Admin, workflow, integrations, and analytics. As these modules become more interconnected, duplicating master identities or allowing arbitrary cross-module writes would make correctness, authorization, auditability, and future reporting progressively harder.

## Decision

FLC UBS is one business platform composed of independently owned bounded domains.

Domains share a deliberately small set of canonical identities and platform capabilities, but each domain remains authoritative for its own state transitions.

The principal domains are:

- Platform/Core
- Identity & Access
- HRMS / People
- Workflow
- Internal Requests
- Sales / CRM
- Inventory / Vehicle
- Commission
- Purchasing
- Accounts
- Finance
- Analytics
- Integrations / DMS

## Consequences

- Users experience one suite rather than disconnected applications.
- HRMS may remain a dedicated host/workspace while still participating in the same business architecture.
- Shared identities do not permit uncontrolled writes.
- Cross-domain workflows use contracts/commands/events.
- Existing production services are migrated incrementally; there is no big-bang rewrite.
