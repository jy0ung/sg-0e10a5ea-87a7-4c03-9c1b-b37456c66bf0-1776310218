DROP INDEX IF EXISTS public.idx_vehicles_chassis_no;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_chassis_company
ON public.vehicles (chassis_no, company_id);