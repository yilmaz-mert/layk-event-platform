-- Phase 7.4: Data Sync & Booking Limits Hotfix

-- ── events: add per-user ticket cap ──────────────────────────────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS max_tickets_per_user integer NOT NULL DEFAULT 5;

-- ── users: ensure phone_number column exists (idempotent) ────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_number text;

-- ── Replace capacity sync trigger ────────────────────────────────────────────
-- Old trigger only fired on confirmed→cancelled.
-- New trigger also handles seat-count edits on confirmed reservations.

DROP TRIGGER IF EXISTS trg_sync_booked_count ON public.reservations;
DROP FUNCTION IF EXISTS public.sync_booked_count();

CREATE OR REPLACE FUNCTION public.sync_booked_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Confirmed → Cancelled: decrement strictly by seats that were held
  IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
    UPDATE public.events
       SET booked_count = GREATEST(0, booked_count - OLD.tickets_requested)
     WHERE id = NEW.event_id;

  -- Confirmed → Confirmed with a seat count change: apply the delta
  ELSIF OLD.status = 'confirmed'
    AND NEW.status = 'confirmed'
    AND OLD.tickets_requested <> NEW.tickets_requested THEN
    UPDATE public.events
       SET booked_count = GREATEST(0, booked_count + (NEW.tickets_requested - OLD.tickets_requested))
     WHERE id = NEW.event_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_booked_count
  AFTER UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_booked_count();
