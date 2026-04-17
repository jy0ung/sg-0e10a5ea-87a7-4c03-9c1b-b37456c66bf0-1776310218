-- HRMS: Add salesman_id FK to vehicles so imports can be linked to a profile

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS salesman_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_salesman_id ON public.vehicles(salesman_id);

-- Policy: Anyone who can read vehicles can join salesman_id to profiles
-- (No new RLS policy needed — existing vehicle RLS covers this column)
