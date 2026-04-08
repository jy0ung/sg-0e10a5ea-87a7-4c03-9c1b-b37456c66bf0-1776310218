
-- Fix profiles read policy to avoid recursion - use security definer function
DROP POLICY IF EXISTS "Scoped read on profiles" ON public.profiles;

CREATE OR REPLACE FUNCTION public.can_read_profile(target_company_id text, target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (
      id = target_id
      OR access_scope = 'global'
      OR company_id = target_company_id
    )
  );
$$;

CREATE POLICY "Scoped read on profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.can_read_profile(company_id, id));

-- Fix insert policies to scope by company
DROP POLICY IF EXISTS "Scoped insert on vehicles" ON public.vehicles;
CREATE POLICY "Scoped insert on vehicles"
  ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR (SELECT p.access_scope FROM public.profiles p WHERE p.id = auth.uid()) = 'global'
  );

DROP POLICY IF EXISTS "Scoped insert on import_batches" ON public.import_batches;
CREATE POLICY "Scoped insert on import_batches"
  ON public.import_batches FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR (SELECT p.access_scope FROM public.profiles p WHERE p.id = auth.uid()) = 'global'
  );

DROP POLICY IF EXISTS "Scoped insert on quality_issues" ON public.quality_issues;
CREATE POLICY "Scoped insert on quality_issues"
  ON public.quality_issues FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR (SELECT p.access_scope FROM public.profiles p WHERE p.id = auth.uid()) = 'global'
  );

-- Fix SLA policies
DROP POLICY IF EXISTS "Allow all insert on sla_policies" ON public.sla_policies;
DROP POLICY IF EXISTS "Allow all read on sla_policies" ON public.sla_policies;
DROP POLICY IF EXISTS "Allow all update on sla_policies" ON public.sla_policies;

CREATE POLICY "Scoped read on sla_policies"
  ON public.sla_policies FOR SELECT TO authenticated
  USING (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR (SELECT p.access_scope FROM public.profiles p WHERE p.id = auth.uid()) = 'global'
  );

CREATE POLICY "Scoped insert on sla_policies"
  ON public.sla_policies FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR (SELECT p.access_scope FROM public.profiles p WHERE p.id = auth.uid()) = 'global'
  );

CREATE POLICY "Scoped update on sla_policies"
  ON public.sla_policies FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR (SELECT p.access_scope FROM public.profiles p WHERE p.id = auth.uid()) = 'global'
  );
