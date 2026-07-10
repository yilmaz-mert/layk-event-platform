-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0025: Event categories, pricing/location/publishing, user
-- address/privacy, and a send-booking-sms webhook stub.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. event_categories table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  color_code  TEXT        NOT NULL DEFAULT '#6366f1',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_categories_name ON public.event_categories (name);

ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_categories_select_all" ON public.event_categories;
CREATE POLICY "event_categories_select_all"
  ON public.event_categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "event_categories_admin_all" ON public.event_categories;
CREATE POLICY "event_categories_admin_all"
  ON public.event_categories FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 2. events: new columns ───────────────────────────────────────────────────
-- category_id is a single nullable FK, not a JSONB multi-category array — the
-- existing app model (legacy `category` text column, the 0013 capacity-alert
-- trigger, the user_interests upsert in EventDetails.tsx) is already strictly
-- single-category, so a FK mirrors that shape. The legacy `category` text
-- column is kept and dual-written by the admin UI so those existing code
-- paths keep working unmodified.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location        TEXT,
  ADD COLUMN IF NOT EXISTS closing_comment TEXT,
  ADD COLUMN IF NOT EXISTS is_published    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS category_id     UUID REFERENCES public.event_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_category_id ON public.events (category_id);

-- ── 3. users: new columns ────────────────────────────────────────────────────
-- No RLS change needed: the existing "Users can update own profile" policy
-- (USING/WITH CHECK auth.uid() = id) has no column restriction, so these
-- become self-editable automatically. role/approval_status stay protected by
-- the separate protect_user_privileges() trigger.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS address    TEXT,
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

-- ── 4. RLS: non-admin SELECT on events requires is_published = true ─────────
-- Admins keep full unconditional access via the existing
-- "events: admin full access" FOR ALL policy, so this single SELECT policy
-- replacement is sufficient to make drafts admin-only.

DROP POLICY IF EXISTS "events: users view active or completed" ON public.events;
CREATE POLICY "events: users view active or completed"
  ON public.events
  FOR SELECT
  USING (status IN ('active', 'completed') AND is_published = true);

-- ── 5. send-booking-sms webhook trigger (mirrors 0022/0024's fixed pattern) ──

CREATE OR REPLACE FUNCTION public.trigger_send_booking_sms()
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
  -- Only fire for freshly confirmed bookings (book_event always inserts
  -- status = 'confirmed'; this guard is defense-in-depth against future
  -- code paths that might INSERT a cancelled row directly).
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  _url := 'https://' || _project_ref || '.supabase.co/functions/v1/send-booking-sms';

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

DROP TRIGGER IF EXISTS trg_send_booking_sms_on_reservation ON public.reservations;
CREATE TRIGGER trg_send_booking_sms_on_reservation
  AFTER INSERT ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_send_booking_sms();

-- ─────────────────────────────────────────────────────────────────────────────
-- SETUP STEPS (run once, after deploying the function):
--   1. supabase functions deploy send-booking-sms
--   2. The app.supabase_project_ref / app.supabase_service_role_key GUCs are
--      already set from 0022's setup and are reused as-is here — only re-run
--      the ALTER DATABASE ... SET statements from 0022 if this is a fresh
--      environment that never ran that setup.
--   3. Set real SMS/WhatsApp provider secrets when one is chosen, e.g.:
--        supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=...
--      Until then, send-booking-sms only logs what it would send.
-- ─────────────────────────────────────────────────────────────────────────────
