# ADR 0003: Approval Instances Workflow Runtime

**Status:** Accepted  
**Date:** 2026-05-31

## Context

The schema contains both `approval_requests` and `approval_instances`. Runtime code also has overlapping approval engines. Newer HRMS and internal-request flows use `approval_instances` with `approval_decisions`, current-step assignment, and entity-specific metadata.

## Decision

Use `approval_instances` and `approval_decisions` as the canonical approval runtime. Treat `approval_requests` as legacy compatibility until every runtime caller is migrated.

## Consequences

- New workflow execution must not write `approval_requests`.
- Workflow services should use entity adapters for status updates, notifications, and audit events.
- Legacy reads may continue during migration.
- No destructive cleanup of `approval_requests` until production evidence shows it is unused.
