-- Add status column to profiles for sales advisor active/inactive/resigned tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'resigned'));
