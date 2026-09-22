-- Preserve HR history when an Employee is removed.
--
-- Historical HR records must not disappear through ON DELETE CASCADE.
-- Hard-delete is reserved for genuinely unused/erroneous Employee rows.
-- Derived/access relationships are intentionally not changed here.

ALTER TABLE public.leave_balances
  DROP CONSTRAINT IF EXISTS leave_balances_employee_id_fkey;
ALTER TABLE public.leave_balances
  ADD CONSTRAINT leave_balances_employee_id_fkey
  FOREIGN KEY (employee_id)
  REFERENCES public.employees(id)
  ON DELETE RESTRICT;

ALTER TABLE public.leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_employee_id_fkey;
ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_employee_id_fkey
  FOREIGN KEY (employee_id)
  REFERENCES public.employees(id)
  ON DELETE RESTRICT;

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_employee_id_fkey;
ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_employee_id_fkey
  FOREIGN KEY (employee_id)
  REFERENCES public.employees(id)
  ON DELETE RESTRICT;

ALTER TABLE public.payroll_items
  DROP CONSTRAINT IF EXISTS payroll_items_employee_id_fkey;
ALTER TABLE public.payroll_items
  ADD CONSTRAINT payroll_items_employee_id_fkey
  FOREIGN KEY (employee_id)
  REFERENCES public.employees(id)
  ON DELETE RESTRICT;

ALTER TABLE public.appraisal_items
  DROP CONSTRAINT IF EXISTS appraisal_items_employee_id_fkey;
ALTER TABLE public.appraisal_items
  ADD CONSTRAINT appraisal_items_employee_id_fkey
  FOREIGN KEY (employee_id)
  REFERENCES public.employees(id)
  ON DELETE RESTRICT;

COMMENT ON CONSTRAINT leave_requests_employee_id_fkey ON public.leave_requests IS
  'Preserves Employee leave history by blocking Employee hard-delete while requests exist.';
COMMENT ON CONSTRAINT attendance_records_employee_id_fkey ON public.attendance_records IS
  'Preserves Employee attendance history by blocking Employee hard-delete while attendance exists.';
COMMENT ON CONSTRAINT payroll_items_employee_id_fkey ON public.payroll_items IS
  'Preserves Employee payroll history by blocking Employee hard-delete while payroll items exist.';
COMMENT ON CONSTRAINT appraisal_items_employee_id_fkey ON public.appraisal_items IS
  'Preserves Employee appraisal history by blocking Employee hard-delete while appraisal items exist.';
