-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 25: Postgres Webhook → send-push Edge Function
-- ─────────────────────────────────────────────────────────────────────────────
--
-- This migration creates a pg_net-backed webhook that fires whenever a row is
-- INSERTed into public.notifications, calling the "send-push" Edge Function so
-- the targeted user receives a native Expo push notification on their device.
--
-- Prerequisites:
--   • The "pg_net" extension must be enabled (Dashboard → Database → Extensions).
--   • The "send-push" Edge Function must be deployed:
--       supabase functions deploy send-push
--   • Replace <PROJECT_REF> below with your actual Supabase project reference
--     (visible in the Supabase Dashboard URL or via `supabase status`).
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pg_net if not already enabled (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── Webhook trigger function ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_send_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _project_ref TEXT := current_setting('app.supabase_project_ref', true);
  _service_key TEXT := current_setting('app.supabase_service_role_key', true);
  _url         TEXT;
BEGIN
  -- Derive Edge Function URL from project ref.
  -- You can also hard-code the URL here instead of using GUC settings.
  _url := 'https://' || _project_ref || '.supabase.co/functions/v1/send-push';

  PERFORM extensions.http_post(
    url     := _url,
    body    := json_build_object(
                 'type',       TG_OP,
                 'table',      TG_TABLE_NAME,
                 'schema',     TG_TABLE_SCHEMA,
                 'record',     row_to_json(NEW),
                 'old_record', NULL
               )::text,
    headers := json_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || _service_key
               )::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_send_push_on_notification ON public.notifications;
CREATE TRIGGER trg_send_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_push_notification();

-- ─────────────────────────────────────────────────────────────────────────────
-- SETUP STEPS (run once in Supabase SQL Editor after deploying the function):
--
--   1. Deploy the Edge Function:
--        supabase functions deploy send-push
--
--   2. Set the two GUC settings so the trigger can build the correct URL and
--      authenticate to the Edge Function.  Run these in the SQL Editor
--      (replace placeholders with your real values):
--
--        ALTER DATABASE postgres
--          SET app.supabase_project_ref = '<YOUR_PROJECT_REF>';
--
--        ALTER DATABASE postgres
--          SET app.supabase_service_role_key = '<YOUR_SERVICE_ROLE_KEY>';
--
--      The service role key is available in:
--        Dashboard → Project Settings → API → service_role (secret)
--
--   3. If you prefer not to store the key in a GUC, hard-code the URL and key
--      directly in the trigger function body above (not recommended for prod).
-- ─────────────────────────────────────────────────────────────────────────────
