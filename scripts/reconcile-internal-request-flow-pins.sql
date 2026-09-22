-- Read-only reconciliation for Internal Request Approval Flow pins.
-- No pin or workflow row is modified.

SELECT
  'category'::text AS pin_source,
  c.id AS source_id,
  c.company_id AS source_company_id,
  c.category_key,
  NULL::text AS subcategory_key,
  c.approval_flow_id,
  f.company_id AS flow_company_id,
  f.entity_type AS flow_entity_type,
  f.is_active AS flow_is_active,
  CASE
    WHEN f.id IS NULL THEN 'flow_not_found'
    WHEN f.company_id IS DISTINCT FROM c.company_id THEN 'flow_company_mismatch'
    WHEN f.entity_type IS DISTINCT FROM 'internal_request' THEN 'wrong_flow_entity_type'
    WHEN NOT f.is_active THEN 'pinned_flow_inactive'
    ELSE 'requires_manual_review'
  END AS exception_reason
FROM public.request_categories c
LEFT JOIN public.approval_flows f ON f.id = c.approval_flow_id
WHERE c.approval_flow_id IS NOT NULL
  AND (
    f.id IS NULL
    OR f.company_id IS DISTINCT FROM c.company_id
    OR f.entity_type IS DISTINCT FROM 'internal_request'
    OR NOT f.is_active
  )

UNION ALL

SELECT
  'subcategory'::text AS pin_source,
  s.id AS source_id,
  s.company_id AS source_company_id,
  s.category_key,
  s.subcategory_key,
  s.approval_flow_id,
  f.company_id AS flow_company_id,
  f.entity_type AS flow_entity_type,
  f.is_active AS flow_is_active,
  CASE
    WHEN f.id IS NULL THEN 'flow_not_found'
    WHEN f.company_id IS DISTINCT FROM s.company_id THEN 'flow_company_mismatch'
    WHEN f.entity_type IS DISTINCT FROM 'internal_request' THEN 'wrong_flow_entity_type'
    WHEN NOT f.is_active THEN 'pinned_flow_inactive'
    ELSE 'requires_manual_review'
  END AS exception_reason
FROM public.request_subcategories s
LEFT JOIN public.approval_flows f ON f.id = s.approval_flow_id
WHERE s.approval_flow_id IS NOT NULL
  AND (
    f.id IS NULL
    OR f.company_id IS DISTINCT FROM s.company_id
    OR f.entity_type IS DISTINCT FROM 'internal_request'
    OR NOT f.is_active
  )
ORDER BY source_company_id, category_key, subcategory_key NULLS FIRST;
