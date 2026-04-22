-- ============================================================
-- HRMS Leave Approval Execution
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_manager_id
  ON public.profiles (manager_id);

CREATE TABLE IF NOT EXISTS public.approval_instances (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              text NOT NULL,
  flow_id                 uuid NOT NULL REFERENCES public.approval_flows(id) ON DELETE CASCADE,
  entity_type             text NOT NULL
                            CHECK (entity_type IN ('leave_request','payroll_run','appraisal','general')),
  entity_id               uuid NOT NULL,
  requester_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_step_id         uuid REFERENCES public.approval_steps(id) ON DELETE SET NULL,
  current_step_order      int,
  current_step_name       text,
  current_approver_role   text,
  current_approver_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','rejected','cancelled')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);
ALTER TABLE public.approval_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read approval_instances" ON public.approval_instances
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Requester insert approval_instances" ON public.approval_instances
  FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Current approver update approval_instances" ON public.approval_instances
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (
      current_approver_user_id = auth.uid()
      OR (
        current_approver_role IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = current_approver_role
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('super_admin','company_admin','general_manager','manager')
      )
    )
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_approval_instances_entity
  ON public.approval_instances (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_approval_instances_company
  ON public.approval_instances (company_id, status);

CREATE INDEX IF NOT EXISTS idx_approval_instances_current_approver
  ON public.approval_instances (current_approver_user_id, current_approver_role);

CREATE TABLE IF NOT EXISTS public.approval_decisions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  uuid NOT NULL REFERENCES public.approval_instances(id) ON DELETE CASCADE,
  step_id      uuid NOT NULL REFERENCES public.approval_steps(id) ON DELETE CASCADE,
  step_order   int NOT NULL,
  approver_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision     text NOT NULL CHECK (decision IN ('approved','rejected')),
  note         text,
  decided_at   timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, step_id, approver_id)
);
ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read approval_decisions" ON public.approval_decisions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.approval_instances ai
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE ai.id = approval_decisions.instance_id
        AND ai.company_id = p.company_id
    )
  );

CREATE POLICY "Current approver insert approval_decisions" ON public.approval_decisions
  FOR INSERT TO authenticated
  WITH CHECK (
    approver_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.approval_instances ai
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE ai.id = approval_decisions.instance_id
        AND ai.company_id = p.company_id
        AND (
          ai.current_approver_user_id = auth.uid()
          OR (ai.current_approver_role IS NOT NULL AND p.role = ai.current_approver_role)
          OR p.role IN ('super_admin','company_admin','general_manager','manager')
        )
    )
  );

CREATE INDEX IF NOT EXISTS idx_approval_decisions_instance
  ON public.approval_decisions (instance_id, decided_at DESC);

CREATE OR REPLACE FUNCTION public.guard_approval_decision_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_step uuid;
  requester uuid;
  allow_self boolean;
  expected_step_order int;
  instance_status text;
BEGIN
  SELECT ai.current_step_id, ai.requester_id, ai.status
  INTO current_step, requester, instance_status
  FROM public.approval_instances ai
  WHERE ai.id = NEW.instance_id;

  IF current_step IS NULL THEN
    RAISE EXCEPTION 'Approval instance has no current step.';
  END IF;

  IF instance_status <> 'pending' THEN
    RAISE EXCEPTION 'Approval instance is not pending.';
  END IF;

  IF current_step <> NEW.step_id THEN
    RAISE EXCEPTION 'Approval decision must target the current pending step.';
  END IF;

  SELECT s.allow_self_approval, s.step_order
  INTO allow_self, expected_step_order
  FROM public.approval_steps s
  WHERE s.id = NEW.step_id;

  IF expected_step_order IS DISTINCT FROM NEW.step_order THEN
    RAISE EXCEPTION 'Approval decision step order does not match the configured step.';
  END IF;

  IF requester = NEW.approver_id AND COALESCE(allow_self, false) = false THEN
    RAISE EXCEPTION 'Self approval is not allowed for this approval step.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_approval_decision_integrity ON public.approval_decisions;

CREATE TRIGGER trg_guard_approval_decision_integrity
  BEFORE INSERT ON public.approval_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_approval_decision_integrity();