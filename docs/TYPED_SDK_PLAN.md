# Typed Supabase SDK — Implementation Plan

## Problem Statement

The codebase has **173 type-erasure casts** (`128 as unknown` + `45 as any`) that bypass
compile-time safety on financial and operational data. The casts are **growing** (116 → 128
since the 2026-08-03 sprint). All 20 real TODOs in the codebase trace to a single root
cause: the generated `database.types.ts` is incomplete.

### Cast Categories

| Category | Description | Count | Example |
|----------|-------------|-------|---------|
| **(a)** | Multi-table join shapes not in generated types | ~15 | `leaveService.ts:373` — `employee:employees!fk(name)` join |
| **(b)** | RPC returns `Json` instead of structured type | ~20 | `vehicleService.ts:679` — `auto_aging_dashboard_summary` |
| **(c)** | Enum columns typed as `string` instead of union | ~40 | `ticketService.ts:1176` — `status: string` vs `TicketStatus` |
| **(d)** | Optional RPC args: `T \| null` vs `T \| undefined` | ~15 | `vehicleService.ts:548` — `p_branch?: string` |
| **(e)** | Mapper accepts `Record<string,unknown>` + stale TODOs | ~83 | `autoAgingDataService.ts:170` — Row → generic record |

### Key Finding

**~30% of the casts are STALE** — the tables/columns already exist in `database.types.ts`
but the TODO comments were never cleaned up. The `untypedSupabase` bridge in
`packages/hrms-services/src/shared/supabaseClient.ts` is used for `hrms_roles`,
`leave_quota_rules`, `employees`, and `leave_requests` — all of which ARE in the generated
types. These casts can be removed **today** without any new tooling.

### Current Type Pipeline

```
supabase/migrations/*.sql (152 files)
        │  [MANUAL] supabase gen types typescript  ← NOT in any npm script
        ▼
packages/supabase/src/database.types.ts (9258 lines)
        │  re-exported
        ▼
packages/supabase/src/types.ts (33 lines)
        │  consumed by createClient<Database>
        ▼
services/*.ts  ← 128 `as unknown` + 45 `as any` casts
```

The generated types have:
- **197 tables** with full Row/Insert/Update types
- **~55 RPCs** — but ~10 return `Json` (untyped)
- **1 enum** (`webhook_delivery_status`) — but ~20+ columns use `CHECK (col IN (...))` constraints that are effectively enums, all typed as `string`

---

## Architecture Decision

**Approach: Post-generation augmentation pass (not a full type generator)**

`supabase gen types typescript` already produces excellent base types (197 tables, relationships,
55 RPCs). Rebuilding that would be months of work. Instead, we build a **post-processing script**
that:

1. Reads the existing `database.types.ts` (or runs `supabase gen types` to regenerate it)
2. Parses migrations to discover enums (both `CREATE TYPE AS ENUM` and `CHECK (col IN (...))`)
3. Augments the `Enums` section with discovered enum unions
4. Narrows table column types from `string` to the appropriate enum union
5. Applies declarative RPC return-shape overrides for `Json`-returning RPCs
6. Emits the augmented file

```
supabase gen types typescript  (existing CLI)
        │
        ▼
database.types.ts (raw, from CLI)
        │  scripts/gen-types.ts (NEW — augmentation pass)
        ├── 1. Parse migrations → discover enums
        ├── 2. Parse migrations → discover CHECK constraints
        ├── 3. Apply rpc-shapes.ts declarations → narrow Json returns
        ├── 4. Rewrite Enums section + narrow columns
        ├── 5. Run check-rpc-contracts.ts as post-validation
        ▼
database.types.ts (augmented, checked in)
```

**Declarative overrides** for categories (a) and (b) live in a hand-written file
(`packages/supabase/src/augmentations.ts`) because join shapes and RPC return shapes
require human judgment — they can't be reliably inferred from SQL alone.

**Automated inference** for category (c) — enum columns — is fully automated from
migration parsing.

**Code refactoring** for categories (d) and (e) — no SDK change needed. These are
service-layer pattern fixes that can be done incrementally after the enum types land.

---

## Phased Implementation

### Phase 0 — Enum Extraction & Validation (this session)

**Goal:** Prove the augmentation approach by extracting all enum-like constraints from
migrations and generating the augmented `Enums` section.

**Deliverables:**
- `scripts/gen-types.ts` — the augmentation script scaffold
  - Migration parser: discovers `CREATE TYPE AS ENUM` and `CHECK (col IN (...))` constraints
  - Enum emitter: generates TypeScript union types for each discovered enum
  - Column mapping: maps CHECK-constraint columns to their enum names
  - Validation: compares discovered enums against existing `database.types.ts` Enums section
- `packages/supabase/src/augmentations.ts` — declarative override file (skeleton)
  - `RpcReturns` interface for Json-returning RPC type overrides
  - `JoinShapes` interface for multi-table join type declarations
- New npm script: `gen:types` — runs `supabase gen types` + augmentation pass
- Validation: the script produces a report showing all discovered enums, which tables
  they affect, and what the augmented Enums section would look like

**Validation criteria:**
- Script discovers all 20+ CHECK-constraint enums from migrations
- Script discovers the 1 existing `CREATE TYPE AS ENUM`
- Output TypeScript compiles (no syntax errors in generated union types)
- No false positives (e.g., `half_day_weight IN (0.5, 1.0)` is not a string enum)

**Effort:** ~1 session

---

### Phase 1 — Augmentation Pipeline Integration

**Goal:** Wire the augmentation script into the type generation pipeline and produce
the first augmented `database.types.ts`.

**Deliverables:**
- `scripts/gen-types.ts` — full augmentation pass:
  - Reads `database.types.ts` (raw from `supabase gen types`)
  - Rewrites the `Enums` section with discovered enums
  - Narrows table column types (e.g., `status: string` → `status: TicketStatus`)
  - Applies `augmentations.ts` RPC return-shape overrides
  - Writes augmented file back to `packages/supabase/src/database.types.ts`
  - Updates timestamp in `types.ts`
- `npm run gen:types` script in `package.json`
- Add `gen:types` to pre-commit hook (dry-run validation mode)
- Integration test: run `gen:types`, then `tsc --noEmit` — 0 errors

**Risk mitigation:**
- Keep the raw `database.types.ts.raw` alongside the augmented file for diffing
- The augmentation pass is idempotent — running it twice produces the same output
- If `supabase gen types` is not available (no local Supabase), the script can
  augment the existing checked-in `database.types.ts` in-place

**Effort:** ~2 days

---

### Phase 2 — Service-Layer Cast Cleanup (Enum + Stale TODO)

**Goal:** Remove the casts that the augmented types now make unnecessary.

**Deliverables (in priority order):**

| Sub-phase | Target | Casts eliminated | Approach |
|-----------|--------|-----------------|----------|
| 2a | Stale `untypedSupabase` usages | ~8 | Replace with typed `supabase` — tables already in generated types |
| 2b | `ticketService.ts` enum casts | ~8 | `status: string` → `status: TicketStatus` now type-safe |
| 2c | `vehicleService.ts` enum casts | ~4 | `stage: string` → `stage: VehicleStage` now type-safe |
| 2d | `autoAgingDataService.ts` mapper casts | ~8 | Change mapper params from `Record<string,unknown>` to typed `Row` |
| 2e | `apService.ts` mapper casts | ~3 | Same — mappers bypass existing structured RPC return types |
| 2f | `vehicleService.ts` + `apService.ts` null-vs-undefined | ~12 | Add `rpc()` wrapper that normalizes `null → undefined` |
| 2g | Remove stale TODO comments | 20 | All TODOs that reference tables/columns now in generated types |

**Running cast counter:** Add `scripts/count-type-casts.ts` to track the ratchet.
Baseline: 128 `as unknown` + 45 `as any` = 173. Target after Phase 2: ≤60.

**Effort:** ~2 days

---

### Phase 3 — RPC Return Shape Declarations

**Goal:** Eliminate category (b) casts by declaring structured return types for the
~10 RPCs that return `Json`.

**Deliverables:**
- `packages/supabase/src/augmentations.ts` — `RpcReturns` declarations for:
  - `auto_aging_dashboard_summary`
  - `auto_aging_report`
  - `auto_aging_source_ledger`
  - `vehicle_kpi_summary`
  - `search_vehicles`
  - `get_sales_dashboard_summary`
  - `get_sales_pipeline_summary`
  - `commit_import_batch`
  - `transition_sales_order_stage`
  - `normalize_dms_sales_order`
- The augmentation script reads these declarations and rewrites the `Returns: Json`
  to `Returns: { ...structured type... }` in the generated `database.types.ts`
- Service-layer cleanup: remove `as Record<string, unknown>` casts on RPC results

**Risk:** RPC return shapes are hand-declared and must match the actual SQL output.
The contract checker (`check-rpc-contracts.ts`) should be extended to validate key
fields in the return shape.

**Effort:** ~1.5 days

---

### Phase 4 — Join Shape Types

**Goal:** Eliminate category (a) casts by providing typed join shapes.

**Deliverables:**
- `packages/supabase/src/augmentations.ts` — `JoinShapes` declarations for the ~6
  legitimate join patterns (all in `packages/hrms-services/src/leave/leaveService.ts`):
  - `LeaveRequestWithEmployeeAndType` — `leave_requests` + `employees(name)` + `leave_types(name)`
  - `LeaveRequestWithEmployeeBranchDept` — `leave_requests` + `employees(branch_id, department_id)`
  - `ApprovalDecisionWithApproverAndStep` — `approval_decisions` + `profiles(name)` + `approval_steps(name)`
  - `ApprovalStepsWithApproverType` — `approval_steps` direct select
  - `LeaveRequestWithLeaveType` — `leave_requests` + `leave_types(name)`
- Export these types from `@flc/supabase/types`
- Service-layer cleanup: replace `as Record<string, unknown>` join casts with typed
  intersection types

**Note:** Supabase-js v2 partially infers join types from `.select('*, fk(name)')` strings
when relationships are in the generated types. Some of these casts may already be
eliminable by just using the typed client correctly. Phase 4 should first test whether
the typed client infers these joins, and only declare explicit types where it doesn't.

**Effort:** ~1 day

---

### Phase 5 — Remaining Casts & Ratchet Enforcement

**Goal:** Ratchet the remaining casts and prevent regression.

**Deliverables:**
- `scripts/count-type-casts.ts` — counts `as unknown`, `as any`, `as never` across
  `src/` and `packages/`, produces a report with per-file counts
- Add to `typecheck` pipeline: `check:type-cast-budget` — fails if cast count exceeds
  the current baseline (ratchet, like `check-legacy-approval-debt.ts`)
- Remaining casts after Phases 2-4 should be:
  - ~10-15 `as never` for generic update payloads (category d — design pattern)
  - ~5-10 `as unknown` for application-computed fields (category e — inherent)
  - Total target: ≤25 (down from 173)
- Document the remaining acceptable casts in `packages/supabase/src/augmentations.ts`
  with explanatory comments

**Effort:** ~0.5 days

---

## Total Effort Summary

| Phase | Description | Effort | Casts eliminated |
|-------|-------------|--------|-----------------|
| 0 | Enum extraction & validation | 1 session | 0 (proves approach) |
| 1 | Augmentation pipeline integration | 2 days | 0 (infrastructure) |
| 2 | Service-layer cast cleanup | 2 days | ~100 |
| 3 | RPC return shape declarations | 1.5 days | ~20 |
| 4 | Join shape types | 1 day | ~15 |
| 5 | Ratchet enforcement | 0.5 days | 0 (prevents regression) |
| **Total** | | **~7 days** | **~135 (78%)** |

---

## File Inventory

### New files
| File | Purpose |
|------|---------|
| `scripts/gen-types.ts` | Augmentation script — parses migrations, augments `database.types.ts` |
| `scripts/count-type-casts.ts` | Ratchet counter for type-erasure casts |
| `packages/supabase/src/augmentations.ts` | Declarative overrides for RPC returns + join shapes |

### Modified files
| File | Change |
|------|--------|
| `package.json` | Add `gen:types`, `check:type-cast-budget` scripts |
| `packages/supabase/src/database.types.ts` | Augmented with enums + narrowed columns + RPC returns |
| `packages/supabase/src/types.ts` | Updated timestamp, export augmentations |
| `packages/supabase/package.json` | Export `./augmentations` |
| `.husky/pre-commit` | Add `check:type-cast-budget` (dry-run) |
| `src/services/ticketService.ts` | Remove ~15 casts + stale comment |
| `src/services/vehicleService.ts` | Remove ~18 casts |
| `src/services/autoAgingDataService.ts` | Remove ~8 casts (mapper refactor) |
| `src/services/apService.ts` | Remove ~8 casts (mapper refactor + rpc wrapper) |
| `packages/hrms-services/src/leave/leaveService.ts` | Remove ~8 stale casts + 20 TODOs |
| `packages/hrms-services/src/shared/supabaseClient.ts` | Remove `untypedSupabase` (deprecated by typed client) |

### Untouched
| File | Why |
|------|-----|
| `scripts/check-rpc-contracts.ts` | Remains as-is — validation gate, not a generator |
| `supabase/migrations/*.sql` | No SQL changes — all work is TypeScript-side |
