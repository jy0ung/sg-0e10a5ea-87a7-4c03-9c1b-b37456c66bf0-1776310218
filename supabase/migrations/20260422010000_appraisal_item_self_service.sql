-- Appraisal item self-service and reviewer access
-- Allow employees to submit self reviews / acknowledgements on their own items,
-- while keeping company-scoped visibility and manager/reviewer write access.

DROP POLICY IF EXISTS "Company read appraisal_items" ON public.appraisal_items;
DROP POLICY IF EXISTS "Manager write appraisal_items" ON public.appraisal_items;
DROP POLICY IF EXISTS "Employee update own appraisal_items" ON public.appraisal_items;

CREATE POLICY "Company read appraisal_items" ON public.appraisal_items
  FOR SELECT TO authenticated
  USING (
    (
      appraisal_id IN (
        SELECT a.id
        FROM public.appraisals a
        WHERE a.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      )
      AND (
        employee_id = auth.uid()
        OR reviewer_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'manager')
        )
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND access_scope = 'global'
    )
  );

CREATE POLICY "Manager write appraisal_items" ON public.appraisal_items
  FOR ALL TO authenticated
  USING (
    (
      appraisal_id IN (
        SELECT a.id
        FROM public.appraisals a
        WHERE a.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      )
      AND (
        reviewer_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'manager')
        )
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND access_scope = 'global'
    )
  )
  WITH CHECK (
    (
      appraisal_id IN (
        SELECT a.id
        FROM public.appraisals a
        WHERE a.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      )
      AND (
        reviewer_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role IN ('super_admin', 'company_admin', 'director', 'general_manager', 'manager')
        )
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND access_scope = 'global'
    )
  );

CREATE POLICY "Employee update own appraisal_items" ON public.appraisal_items
  FOR UPDATE TO authenticated
  USING (
    (
      employee_id = auth.uid()
      AND appraisal_id IN (
        SELECT a.id
        FROM public.appraisals a
        WHERE a.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND access_scope = 'global'
    )
  )
  WITH CHECK (
    (
      employee_id = auth.uid()
      AND appraisal_id IN (
        SELECT a.id
        FROM public.appraisals a
        WHERE a.company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND access_scope = 'global'
    )
  );
