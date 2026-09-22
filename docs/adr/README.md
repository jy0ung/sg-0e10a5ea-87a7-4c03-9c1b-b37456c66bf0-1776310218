# Architecture Decision Records

This directory records enterprise architecture decisions that should survive phase-specific implementation notes.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-internal-saas-ready-platform.md) | UBS targets an internal SaaS-ready product model | Accepted |
| [0002](0002-canonical-shell-and-packages.md) | Main app remains canonical; shared logic moves into packages | Accepted |
| [0003](0003-approval-instances-workflow-runtime.md) | `approval_instances` is the canonical workflow runtime | Accepted |
| [0004](0004-unified-business-suite-domain-model.md) | UBS is one platform composed of independently owned business domains | Accepted |
| [0005](0005-canonical-employee-identity.md) | `employees` is the canonical workforce identity; user identity is separate | Accepted |
| [0006](0006-domain-ownership-and-cross-domain-contracts.md) | Cross-domain state changes must go through the owning domain contract | Accepted |
| [0007](0007-business-events-and-outbox.md) | Cross-domain reactions converge on idempotent business events/outbox | Accepted |

## Active architecture baseline

Read these together before designing a cross-module feature:

1. [Enterprise Re-Architecture](../ENTERPRISE_REARCHITECTURE.md)
2. [Unified Business Suite Roadmap](../UNIFIED_BUSINESS_SUITE_ROADMAP.md)
3. [Domain Ownership Matrix](../DOMAIN_OWNERSHIP_MATRIX.md)
4. [Business Data Dictionary](../BUSINESS_DATA_DICTIONARY.md)

Phase-specific plans may describe implementation history, but they do not override accepted ADRs without a new superseding ADR.
