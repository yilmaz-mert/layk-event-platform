-- ============================================================
-- 0011_final_production_cleanup.sql
-- Purges legacy RPCs and fixes trigger lockout for backend services
-- ============================================================

-- 1. Purge Legacy Overloaded Functions (Security Bypass Risk)
-- Drop old 2-parameter versions of book_event to ensure only the secure 3-parameter version survives.
DROP FUNCTION IF EXISTS public.book_event(uuid, integer);
DROP FUNCTION IF EXISTS public.book_event(uuid, uuid);

-- 2. Fix Privilege Lockout for System Services & Cron Automations
CREATE OR REPLACE FUNCTION public.protect_user_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bypass trigger for Supabase backend services, system jobs, and super-admins
  -- This ensures automated tasks do not crash when auth.uid() evaluates to null
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Silently revert unauthorized privilege escalations for regular users
  IF NOT public.is_admin() THEN
    NEW.role := OLD.role;
    NEW.approval_status := OLD.approval_status;
  END IF;

  RETURN NEW;
END;
$$;
