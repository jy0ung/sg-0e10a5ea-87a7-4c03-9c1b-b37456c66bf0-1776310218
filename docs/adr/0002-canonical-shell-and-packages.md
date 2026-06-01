# ADR 0002: Canonical Shell And Packages

**Status:** Accepted  
**Date:** 2026-05-31

## Context

The root app owns the real enterprise shell and business modules. `apps/hrms-web` is separately hosted but duplicates services, layouts, guards, components, and config.

## Decision

Keep the main app as the canonical UBS shell. Keep HRMS web separately hosted for now. Move shared shell contracts, access utilities, workflow services, UI patterns, and domain services into packages incrementally.

## Consequences

- No single-app HRMS merge in the early phases.
- No big-bang `src/` relocation.
- Shared route/module metadata is owned by `@flc/shell` through `platformRegistry`; `src/config/platformRegistry.ts` is a compatibility re-export during migration.
- HRMS web should progressively consume package-owned services and shell/access contracts.
