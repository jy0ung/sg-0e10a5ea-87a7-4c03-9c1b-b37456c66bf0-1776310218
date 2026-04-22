-- ============================================================
-- HRMS appraisal items employee ownership migration
-- ============================================================
-- Goal:
--   Move employee-owned appraisal item rows from legacy `profiles.id`
--   ownership to workforce `employees.id` ownership.
--
-- Important:
--   Reviewer and approval actor identities remain account/profile IDs
--   (`profiles.id`). Only the employee-owned appraisal subject moves to
--   workforce ownership in this step.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.company_id IS NOT NULL
      AND p.employee_id IS NULL
  ) THEN
    RAISE EXCEPTION 'profiles.employee_id must be backfilled before migrating appraisal item ownership.';
  END IF;
END;
$$;

UPDATE public.appraisal_items ai
SET employee_id = p.employee_id
FROM public.profiles p
WHERE p.id = ai.employee_id
  AND p.employee_id IS NOT NULL
  AND ai.employee_id IS DISTINCT FROM p.employee_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.appraisal_items ai
    LEFT JOIN public.employees e ON e.id = ai.employee_id
    WHERE e.id IS NULL
  ) THEN
    RAISE EXCEPTION 'appraisal_items contains employee_id values that do not resolve to public.employees.';
  END IF;
END;
$$;

ALTER TABLE public.appraisal_items
  DROP CONSTRAINT IF EXISTS appraisal_items_employee_id_fkey;

ALTER TABLE public.appraisal_items
  ADD CONSTRAINT appraisal_items_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Company read appraisal_items" ON public.appraisal_items;
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
        employee_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid())
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

DROP POLICY IF EXISTS "Employee update own appraisal_items" ON public.appraisal_items;
CREATE POLICY "Employee update own appraisal_items" ON public.appraisal_items
  FOR UPDATE TO authenticated
  USING (
    (
      employee_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid())
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
      employee_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid())
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

-- Manager / reviewer write access remains valid because reviewer_id keeps
-- pointing at profiles.id.