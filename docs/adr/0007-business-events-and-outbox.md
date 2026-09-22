# ADR 0007: Business Events And Transactional Outbox

**Status:** Accepted  
**Date:** 2026-09-22

## Context

As HRMS, Sales, Inventory, Commission, Accounts, Finance, Purchasing, Internal Requests, notifications, and analytics become interconnected, synchronous cross-module writes would tightly couple domains and make retries/partial failures difficult to reason about.

## Decision

FLC UBS will introduce business events incrementally for cross-domain reactions.

When a committed domain transaction must notify or trigger work in another domain, the preferred pattern is:

1. owning domain validates and commits its state;
2. the same transaction records an outbox/business-event entry where feasible;
3. downstream consumers process the event idempotently;
4. retries and failures are observable;
5. audit/source references are preserved.

Example events may include:

- `employee.created`
- `employee.transferred`
- `deal.completed`
- `vehicle.allocated`
- `vehicle.registered`
- `vehicle.delivered`
- `payment.received`
- `purchase_order.approved`
- `goods_received`
- `supplier_invoice.approved`
- `commission.earned`
- `payroll.posted`
- `request.approved`

This ADR does not require an immediate event-bus rewrite. Existing direct backend calls remain valid where they are already atomic and well-owned. The outbox is introduced where cross-domain coupling or delivery reliability justifies it.

## Consequences

- Business events describe facts that already committed; they do not replace validation.
- Consumers must be idempotent.
- Financial posting remains deterministic and Finance-owned.
- Analytics may consume events/read models but never becomes authoritative transactional state.
