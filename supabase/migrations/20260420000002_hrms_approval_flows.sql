-- ============================================================
-- HRMS Approval Flows: approval_flows + approval_steps tables
-- ============================================================

-- ─── Approval Flows ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.approval_flows (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   text NOT NULL,
  name         text NOT NULL,
  description  text,
  entity_type  text NOT NULL DEFAULT 'general'
                 CHECK (entity_type IN ('leave_request','payroll_run','appraisal','general')),
  is_active    boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.approval_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read approval_flows" ON public.approval_flows
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin write approval_flows" ON public.approval_flows
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','general_manager','manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','general_manager','manager')
  ));

CREATE INDEX IF NOT EXISTS idx_approval_flows_company ON public.approval_flows (company_id);

-- ─── Approval Steps ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.approval_steps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id           uuid NOT NULL REFERENCES public.approval_flows(id) ON DELETE CASCADE,
  step_order        int  NOT NULL,
  name              text NOT NULL,
  approver_type     text NOT NULL
                      CHECK (approver_type IN ('role','specific_user','direct_manager')),
  approver_role     text,
  approver_user_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  allow_self_approval boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flow_id, step_order)
);
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read approval_steps" ON public.approval_steps
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin write approval_steps" ON public.approval_steps
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','general_manager','manager')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin','company_admin','general_manager','manager')
  ));

CREATE INDEX IF NOT EXISTS idx_approval_steps_flow ON public.approval_steps (flow_id);
