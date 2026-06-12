-- Phase 7.1: Advanced Booking Engine
-- Apply via: Supabase Dashboard → SQL Editor

-- ── 1. Table updates ──────────────────────────────────────────────────────────

-- Multi-seat support on reservations
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS tickets_requested integer NOT NULL DEFAULT 1;

-- Ensure booked_count exists (was added in 0005; idempotent guard)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS booked_count integer NOT NULL DEFAULT 0;

-- ── 2. Audit log table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reservation_audit_logs (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reservation_id  uuid        NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES public.users(id)        ON DELETE CASCADE,
  action_type     text        NOT NULL CHECK (action_type IN ('booked', 'cancelled', 'edited')),
  tickets_changed integer     NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reservation_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.reservation_audit_logs;
CREATE POLICY "Admins can view audit logs"
  ON public.reservation_audit_logs
  FOR SELECT
  USING (public.is_admin());

-- ── 3. Audit trigger ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_reservation_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action         text;
  v_tickets_changed integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action          := 'booked';
    v_tickets_changed := NEW.tickets_requested;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
      v_action          := 'cancelled';
      v_tickets_changed := -OLD.tickets_requested;
    ELSIF NEW.status = 'confirmed' AND OLD.status = 'cancelled' THEN
      -- Re-booking a previously cancelled reservation
      v_action          := 'booked';
      v_tickets_changed := NEW.tickets_requested;
    ELSE
      v_action          := 'edited';
      v_tickets_changed := NEW.tickets_requested - OLD.tickets_requested;
    END IF;
  END IF;

  INSERT INTO public.reservation_audit_logs (reservation_id, user_id, action_type, tickets_changed)
  VALUES (NEW.id, NEW.user_id, v_action, v_tickets_changed);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservation_audit ON public.reservations;
CREATE TRIGGER trg_reservation_audit
  AFTER INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.fn_reservation_audit();

-- ── 4. Capacity synchronization trigger ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_sync_booked_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Decrement when a confirmed reservation is cancelled
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    UPDATE public.events
    SET booked_count = GREATEST(0, booked_count - OLD.tickets_requested)
    WHERE id = NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_booked_count ON public.reservations;
CREATE TRIGGER trg_sync_booked_count
  AFTER UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_booked_count();

-- ── 5. Smart book_event RPC rewrite ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.book_event(
  p_user_uuid       uuid,
  p_event_uuid      uuid,
  p_requested_seats integer DEFAULT 1
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_capacity        integer;
  v_booked          integer;
  v_existing_id     uuid;
  v_existing_status text;
BEGIN
  -- Lock the event row to prevent concurrent over-booking
  SELECT capacity, booked_count
  INTO   v_capacity, v_booked
  FROM   public.events
  WHERE  id = p_event_uuid
  FOR UPDATE;

  -- Capacity guard
  IF v_booked + p_requested_seats > v_capacity THEN
    RAISE EXCEPTION 'Fully Booked' USING ERRCODE = 'P0001';
  END IF;

  -- Look for an existing reservation for this user/event pair
  SELECT id, status
  INTO   v_existing_id, v_existing_status
  FROM   public.reservations
  WHERE  user_id  = p_user_uuid
    AND  event_id = p_event_uuid
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'cancelled' THEN
      -- Reactivate: update the cancelled row in place
      UPDATE public.reservations
      SET status            = 'confirmed',
          tickets_requested = p_requested_seats,
          created_at        = now()
      WHERE id = v_existing_id;
    ELSE
      RAISE EXCEPTION 'Already booked' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- Fresh booking
    INSERT INTO public.reservations (user_id, event_id, status, tickets_requested)
    VALUES (p_user_uuid, p_event_uuid, 'confirmed', p_requested_seats);
  END IF;

  -- Atomically increment booked_count by the seats granted
  UPDATE public.events
  SET booked_count = booked_count + p_requested_seats
  WHERE id = p_event_uuid;
END;
$$;
