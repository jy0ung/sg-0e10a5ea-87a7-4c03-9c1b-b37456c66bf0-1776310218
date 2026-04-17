-- HRMS: Add employee-specific columns to profiles table

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS staff_code  TEXT,
  ADD COLUMN IF NOT EXISTS ic_no       TEXT,
  ADD COLUMN IF NOT EXISTS contact_no  TEXT,
  ADD COLUMN IF NOT EXISTS join_date   DATE,
  ADD COLUMN IF NOT EXISTS resign_date DATE;

-- Unique staff code per company (nullable so existing rows are unaffected)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_staff_code_company
  ON public.profiles (company_id, staff_code)
  WHERE staff_code IS NOT NULL;
