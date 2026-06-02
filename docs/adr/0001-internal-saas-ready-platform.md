# ADR 0001: Internal SaaS-Ready Platform

**Status:** Accepted  
**Date:** 2026-05-31

## Context

UBS is currently deployed for Fook Loi group operations. The codebase is multi-tenant and enterprise-grade in several backend areas, but it is not intended to become a public self-serve SaaS product in the current roadmap.

## Decision

Treat UBS as an internal SaaS-ready enterprise platform.

This means tenant isolation, modular boundaries, auditability, operational canaries, and package-owned contracts are required. Public SaaS concerns such as billing, self-service tenant signup, plan tiers, and external customer lifecycle are out of scope until explicitly approved.

## Consequences

- Keep `company_id` as the hard tenant boundary.
- Preserve invite-only auth and admin-controlled provisioning.
- Build architecture as if more tenants and hosts may exist later.
- Do not add public SaaS billing/onboarding complexity in this transformation.
