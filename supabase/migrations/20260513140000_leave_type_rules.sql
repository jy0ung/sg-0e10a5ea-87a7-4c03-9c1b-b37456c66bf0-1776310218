-- ─── Leave Type Business Rules ───────────────────────────────────────────────
-- Adds two rule columns to leave_types:
--   requires_balance         boolean  – if false, balance check is skipped on submission
--   min_advance_notice_days  integer  – if set, start_date must be >= today + N calendar days

ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS requires_balance         boolean  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_advance_notice_days  integer  CHECK (min_advance_notice_days >= 0);

-- Unpaid Leave: no balance required (employees can submit even with 0 entitlement)
UPDATE public.leave_types
  SET requires_balance = false
  WHERE code = 'UL';

-- Annual Leave: must be applied at least 7 calendar days in advance
UPDATE public.leave_types
  SET min_advance_notice_days = 7
  WHERE code = 'AL';
