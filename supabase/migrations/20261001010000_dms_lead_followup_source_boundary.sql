-- DMSv3 Phase 1: close the direct-DML bypass of add_lead_followup's
-- company/kind/source validation. No source tables or existing rows change.
-- September's restrictive tenant/enabled-actor gates remain in force.

ALTER POLICY lead_followups_insert ON public.lead_followups
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND author_id = auth.uid()
    AND (
      (source_kind = 'lead' AND EXISTS (
        SELECT 1 FROM public.dms_raw_leads source
        WHERE source.id = lead_followups.source_raw_id
          AND source.company_id = lead_followups.company_id
      ))
      OR (source_kind = 'prospect' AND EXISTS (
        SELECT 1 FROM public.dms_raw_prospects source
        WHERE source.id = lead_followups.source_raw_id
          AND source.company_id = lead_followups.company_id
      ))
    )
  );

-- Preserve the original author/24-hour USING predicate. WITH CHECK validates
-- the corrected row as well, so changing its raw UUID cannot cross tenants.
ALTER POLICY lead_followups_update_author ON public.lead_followups
  WITH CHECK (
    author_id = auth.uid()
    AND created_at >= now() - INTERVAL '24 hours'
    AND (
      (source_kind = 'lead' AND EXISTS (
        SELECT 1 FROM public.dms_raw_leads source
        WHERE source.id = lead_followups.source_raw_id
          AND source.company_id = lead_followups.company_id
      ))
      OR (source_kind = 'prospect' AND EXISTS (
        SELECT 1 FROM public.dms_raw_prospects source
        WHERE source.id = lead_followups.source_raw_id
          AND source.company_id = lead_followups.company_id
      ))
    )
  );

-- Compatibility: RPC signatures and valid same-company direct writes remain.
-- Historical invalid links are retained/readable for reviewed reconciliation;
-- correcting them requires a valid same-company source. Do not roll back to
-- the permissive predicates: forward-fix policies if later convergence needs it.
