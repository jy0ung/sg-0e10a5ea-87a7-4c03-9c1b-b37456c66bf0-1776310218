-- Read-only Approval Flow admin/history reconciliation.
-- This file intentionally performs no mutation or identity guessing.

-- 1) Flow ownership / actor anomalies.
SELECT
  f.id AS flow_id,
  f.company_id AS flow_company_id,
  f.name AS flow_name,
  f.department_id,
  d.company_id AS department_company_id,
  f.created_by,
  creator.company_id AS creator_company_id,
  creator.access_scope AS creator_access_scope,
  f.updated_by,
  updater.company_id AS updater_company_id,
  updater.access_scope AS updater_access_scope,
  CASE
    WHEN f.department_id IS NOT NULL AND d.id IS NULL THEN 'department_not_found'
    WHEN f.department_id IS NOT NULL AND d.company_id IS DISTINCT FROM f.company_id THEN 'department_company_mismatch'
    WHEN f.created_by IS NOT NULL AND creator.id IS NULL THEN 'creator_profile_not_found'
    WHEN f.created_by IS NOT NULL
      AND creator.company_id IS DISTINCT FROM f.company_id
      AND COALESCE(creator.access_scope, '') <> 'global'
      THEN 'creator_company_mismatch'
    WHEN f.updated_by IS NOT NULL AND updater.id IS NULL THEN 'updater_profile_not_found'
    WHEN f.updated_by IS NOT NULL
      AND updater.company_id IS DISTINCT FROM f.company_id
      AND COALESCE(updater.access_scope, '') <> 'global'
      THEN 'updater_company_mismatch'
    WHEN f.is_default AND f.department_id IS NOT NULL THEN 'default_department_conflict'
    ELSE 'requires_manual_review'
  END AS exception_reason
FROM public.approval_flows f
LEFT JOIN public.departments d ON d.id = f.department_id
LEFT JOIN public.profiles creator ON creator.id = f.created_by
LEFT JOIN public.profiles updater ON updater.id = f.updated_by
WHERE
  (f.department_id IS NOT NULL AND (d.id IS NULL OR d.company_id IS DISTINCT FROM f.company_id))
  OR (f.created_by IS NOT NULL AND (
    creator.id IS NULL
    OR (
      creator.company_id IS DISTINCT FROM f.company_id
      AND COALESCE(creator.access_scope, '') <> 'global'
    )
  ))
  OR (f.updated_by IS NOT NULL AND (
    updater.id IS NULL
    OR (
      updater.company_id IS DISTINCT FROM f.company_id
      AND COALESCE(updater.access_scope, '') <> 'global'
    )
  ))
  OR (f.is_default AND f.department_id IS NOT NULL)
ORDER BY f.company_id, f.name;

-- 2) Step routing / company-integrity anomalies.
SELECT
  s.id AS step_id,
  s.flow_id,
  f.company_id AS flow_company_id,
  s.step_order,
  s.approver_type,
  s.approver_role,
  r.company_id AS role_company_id,
  s.approver_user_id,
  approver.company_id AS approver_company_id,
  approver.access_scope AS approver_access_scope,
  s.fallback_approver_user_id,
  fallback.company_id AS fallback_company_id,
  fallback.access_scope AS fallback_access_scope,
  CASE
    WHEN f.id IS NULL THEN 'flow_not_found'
    WHEN s.approver_type = 'role'
      AND NULLIF(btrim(COALESCE(s.approver_role, '')), '') IS NULL
      THEN 'role_missing'
    WHEN s.approver_type = 'specific_user' AND s.approver_user_id IS NULL
      THEN 'specific_approver_missing'
    WHEN s.approver_role ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND (r.id IS NULL OR r.company_id IS DISTINCT FROM f.company_id)
      THEN 'hrms_role_company_mismatch'
    WHEN s.approver_user_id IS NOT NULL AND (
      approver.id IS NULL
      OR (
        approver.company_id IS DISTINCT FROM f.company_id
        AND COALESCE(approver.access_scope, '') <> 'global'
      )
    ) THEN 'approver_profile_company_mismatch'
    WHEN s.fallback_approver_user_id IS NOT NULL AND (
      fallback.id IS NULL
      OR (
        fallback.company_id IS DISTINCT FROM f.company_id
        AND COALESCE(fallback.access_scope, '') <> 'global'
      )
    ) THEN 'fallback_profile_company_mismatch'
    ELSE 'requires_manual_review'
  END AS exception_reason
FROM public.approval_steps s
LEFT JOIN public.approval_flows f ON f.id = s.flow_id
LEFT JOIN public.hrms_roles r
  ON s.approver_role ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND r.id = s.approver_role::uuid
LEFT JOIN public.profiles approver ON approver.id = s.approver_user_id
LEFT JOIN public.profiles fallback ON fallback.id = s.fallback_approver_user_id
WHERE
  f.id IS NULL
  OR (
    s.approver_type = 'role'
    AND NULLIF(btrim(COALESCE(s.approver_role, '')), '') IS NULL
  )
  OR (s.approver_type = 'specific_user' AND s.approver_user_id IS NULL)
  OR (
    s.approver_role ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (r.id IS NULL OR r.company_id IS DISTINCT FROM f.company_id)
  )
  OR (
    s.approver_user_id IS NOT NULL
    AND (
      approver.id IS NULL
      OR (
        approver.company_id IS DISTINCT FROM f.company_id
        AND COALESCE(approver.access_scope, '') <> 'global'
      )
    )
  )
  OR (
    s.fallback_approver_user_id IS NOT NULL
    AND (
      fallback.id IS NULL
      OR (
        fallback.company_id IS DISTINCT FROM f.company_id
        AND COALESCE(fallback.access_scope, '') <> 'global'
      )
    )
  )
ORDER BY f.company_id, s.flow_id, s.step_order;

-- 3) Flows that are already structurally immutable because workflow history exists.
SELECT
  f.id AS flow_id,
  f.company_id,
  f.name,
  COUNT(DISTINCT ai.id) AS canonical_instance_count,
  COUNT(DISTINCT ar.id) AS legacy_request_count
FROM public.approval_flows f
LEFT JOIN public.approval_instances ai ON ai.flow_id = f.id
LEFT JOIN public.approval_requests ar ON ar.flow_id = f.id
GROUP BY f.id, f.company_id, f.name
HAVING COUNT(DISTINCT ai.id) > 0 OR COUNT(DISTINCT ar.id) > 0
ORDER BY f.company_id, f.name;
