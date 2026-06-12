-- Phase 7.6: Profile Persistence & RLS Hotfix

-- Ensure phone_number column exists (idempotent)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_number text;

-- Allow authenticated users to update their own row in public.users
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
