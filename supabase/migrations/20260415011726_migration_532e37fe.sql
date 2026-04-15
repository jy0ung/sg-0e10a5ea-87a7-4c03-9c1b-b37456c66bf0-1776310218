-- 1. Rename full_name to name if it exists (using a DO block to prevent errors if already renamed)
DO $$ 
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='full_name') THEN
    ALTER TABLE public.profiles RENAME COLUMN full_name TO name;
  END IF;
END $$;

-- 2. Add missing columns
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'sales',
  ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT 'c1',
  ADD COLUMN IF NOT EXISTS branch_id TEXT,
  ADD COLUMN IF NOT EXISTS access_scope TEXT NOT NULL DEFAULT 'company';

-- 3. Update handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, company_id, access_scope)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'sales'),
    COALESCE(NEW.raw_user_meta_data->>'company_id', 'c1'),
    COALESCE(NEW.raw_user_meta_data->>'access_scope', 'company')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 4. Re-create trigger just in case
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Backfill existing users into profiles
INSERT INTO public.profiles (id, email, name, role, company_id, access_scope)
SELECT 
  id, 
  email, 
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)),
  COALESCE(raw_user_meta_data->>'role', 'sales'),
  COALESCE(raw_user_meta_data->>'company_id', 'c1'),
  COALESCE(raw_user_meta_data->>'access_scope', 'company')
FROM auth.users
ON CONFLICT (id) DO NOTHING;