# Commission Employee identity slice

**Owner:** Commission. **Canonical identity:** `employees.id`, with `profiles` only as an account link and `employee_module_assignments` as active Sales staffing. Commission reads HRMS/Inventory identity but does not mutate either domain.

Migration `20260927092000_commission_employee_identity.sql` adds nullable `employee_id` to rules and records. Old name-only rows remain unresolved and visible; no name-based backfill or implicit matching occurs. New rule entry offers active Sales Advisor Employees by ID, including a staff code to distinguish duplicate names. The database validates Employee company scope and canonical rule branch scope, keeps a display-name snapshot, and prevents an established Employee association from being cleared or reassigned. Canonical earning records also validate rule and Vehicle ownership against the same company and Employee.

The Commission service writes Employee IDs for new scoped rules, filters records by Employee ID, and no longer exports its unused browser-side name-matching earning calculation. The Commission page labels unresolved legacy rules/records for identity review. Existing rule and earning data remain readable. The generated database contract and HRMS service mirror are updated together.

**Rollout:** Apply this additive migration before deploying the updated web client. An old client may still create name-only rows until compatibility writes are retired; those rows remain unresolved. Rolling back only the web client leaves the additive columns and data intact. Do not drop the columns or infer missing links from names.

**Remaining Commission work:** A backend-owned, idempotent calculation command with rule-version/source snapshots, server-enforced approval/payment transitions and audit evidence is still required before Commission can be called complete. The existing table-level insert/update policies predate that command and should be narrowed in its implementation slice. No accounting, payroll or Vehicle state is written in this identity slice.
