-- Authenticated relationship prerequisite, ANDed with existing tenant/enabled/
-- author policies. Invoker visibility on the parent is intentional. Historical
-- mismatches remain stored but hidden; privileged BYPASSRLS remains unchanged.
-- This supplies neither immutable history nor a universal composite-FK guarantee.

CREATE POLICY deal_parent_company_gate
  ON public.deal_loan
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals AS parent
      WHERE parent.id = deal_loan.deal_id
        AND parent.company_id = deal_loan.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals AS parent
      WHERE parent.id = deal_loan.deal_id
        AND parent.company_id = deal_loan.company_id
    )
  );

CREATE POLICY deal_parent_company_gate
  ON public.deal_insurance
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals AS parent
      WHERE parent.id = deal_insurance.deal_id
        AND parent.company_id = deal_insurance.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals AS parent
      WHERE parent.id = deal_insurance.deal_id
        AND parent.company_id = deal_insurance.company_id
    )
  );

CREATE POLICY deal_parent_company_gate
  ON public.deal_registration
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals AS parent
      WHERE parent.id = deal_registration.deal_id
        AND parent.company_id = deal_registration.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals AS parent
      WHERE parent.id = deal_registration.deal_id
        AND parent.company_id = deal_registration.company_id
    )
  );

CREATE POLICY deal_parent_company_gate
  ON public.deal_activities
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals AS parent
      WHERE parent.id = deal_activities.deal_id
        AND parent.company_id = deal_activities.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals AS parent
      WHERE parent.id = deal_activities.deal_id
        AND parent.company_id = deal_activities.company_id
    )
  );

CREATE POLICY deal_parent_company_gate
  ON public.deal_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals AS parent
      WHERE parent.id = deal_documents.deal_id
        AND parent.company_id = deal_documents.company_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals AS parent
      WHERE parent.id = deal_documents.deal_id
        AND parent.company_id = deal_documents.company_id
    )
  );
