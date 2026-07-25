-- v2 Rebuild Migration 0001: Initial Identity & Tenant (Phase 0 stub)
-- Created: 2026-06-28
-- Purpose: Placeholder for clean-slate normalized schema (companies, branches, profiles, employees, RLS helpers)
-- Status: Stub only — replace with full SQL once Supabase CLI is available for local stack testing
-- Dependencies: None (first migration)
-- Rollback: N/A (initial)

-- TODO (when CLI available):
-- 1. Create companies, branches tables
-- 2. Create profiles + employees with company_id FK + RLS policies
-- 3. Add helper functions: get_my_access_scope(), can_access_row()
-- 4. Seed super_admin bootstrap path

-- This file will be replaced with real DDL during schema design phase.
-- Keep this stub for traceability in the v2 rebuild.