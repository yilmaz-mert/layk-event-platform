-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 13: Admin Booking Security & Comprehensive Capacity Trigger
--
-- 1. book_event RPC — adds auth guard; admin can book on behalf of any user
-- 2. sync_booked_count — comprehensive INSERT / UPDATE / DELETE trigger that
--    keeps events.booked_count strictly in sync; book_event no longer maintains
--    the counter manually so every code path flows through the trigger.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. book_event: security guard + hand off booked_count to trigger ──────────

CREATE OR REPLACE FUNCTION public.book_event(
  p_user_uuid       uuid,
  p_event_uuid      uuid,
  p_requested_seats integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity      integer;
  v_booked        integer;
  v_max_per_user  integer;
  v_exist_status  text;
BEGIN
  -- ── Security guard ────────────────────────────────────────────────────────
  -- A regular authenticated user may only book for themselves.
  -- Admins (is_admin()) may book on behalf of any user.
  -- Unauthenticated calls (auth.uid() IS NULL) are always rejected.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() <> p_user_uuid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: you may only book for your own account'
      USING ERRCODE = '42501';
  END IF;

  -- ── Lock the event row so concurrent bookings serialise ──────────────────
  SELECT capacity, booked_count, max_tickets_per_user
    INTO v_capacity, v_booked, v_max_per_user
    FROM public.events
   WHERE id = p_event_uuid
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Per-user ticket cap
  IF p_requested_seats < 1 THEN
    RAISE EXCEPTION 'Seat count must be at least 1';
  END IF;

  IF p_requested_seats > v_max_per_user THEN
    RAISE EXCEPTION 'Requested seats exceed the per-user limit of %', v_max_per_user;
  END IF;

  -- ── Existing reservation check ────────────────────────────────────────────
  SELECT status
    INTO v_exist_status
    FROM public.reservations
   WHERE event_id = p_event_uuid
     AND user_id  = p_user_uuid;

  IF FOUND THEN
    IF v_exist_status = 'confirmed' THEN
      RAISE EXCEPTION 'Already booked for this event';
    END IF;

    -- Reactivate a previously cancelled reservation
    IF v_booked + p_requested_seats > v_capacity THEN
      RAISE EXCEPTION 'Event is fully booked';
    END IF;

    -- UPDATE triggers trg_sync_booked_count (cancelled → confirmed path)
    UPDATE public.reservations
       SET status            = 'confirmed',
           tickets_requested = p_requested_seats,
           created_at        = now()
     WHERE event_id = p_event_uuid
       AND user_id  = p_user_uuid;
  ELSE
    -- Fresh booking — capacity guard
    IF v_booked + p_requested_seats > v_capacity THEN
      RAISE EXCEPTION 'Event is fully booked';
    END IF;

    -- INSERT triggers trg_sync_booked_count (INSERT confirmed path)
    INSERT INTO public.reservations (event_id, user_id, status, tickets_requested)
    VALUES (p_event_uuid, p_user_uuid, 'confirmed', p_requested_seats);
  END IF;

  -- NOTE: booked_count is maintained exclusively by trg_sync_booked_count.
  --       No manual UPDATE on events here — the trigger handles it.
END;
$$;


-- ── 2. Comprehensive sync trigger ─────────────────────────────────────────────
--
-- Handles every mutation that can alter the effective seat count:
--   INSERT confirmed          → add NEW.tickets_requested
--   UPDATE confirmed→cancelled → subtract OLD.tickets_requested
--   UPDATE cancelled→confirmed → add    NEW.tickets_requested (with capacity check)
--   UPDATE confirmed→confirmed (count change) → apply delta (with capacity check)
--   DELETE confirmed          → subtract OLD.tickets_requested
--
-- All capacity / per-user-limit validations for direct UPDATE paths (e.g. admin
-- editing a reservation row directly) are enforced inside the trigger so the
-- invariant holds regardless of how the reservation is mutated.

CREATE OR REPLACE FUNCTION public.sync_booked_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity     integer;
  v_booked       integer;
  v_max_per_user integer;
BEGIN

  -- ── INSERT ────────────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmed' THEN
      UPDATE public.events
         SET booked_count = booked_count + NEW.tickets_requested
       WHERE id = NEW.event_id;
    END IF;
    RETURN NEW;
  END IF;

  -- ── DELETE ────────────────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'confirmed' THEN
      UPDATE public.events
         SET booked_count = GREATEST(0, booked_count - OLD.tickets_requested)
       WHERE id = OLD.event_id;
    END IF;
    RETURN OLD;
  END IF;

  -- ── UPDATE ────────────────────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' THEN

    -- confirmed → cancelled: release seats
    IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
      UPDATE public.events
         SET booked_count = GREATEST(0, booked_count - OLD.tickets_requested)
       WHERE id = NEW.event_id;

    -- cancelled → confirmed: claim seats (validate first)
    ELSIF OLD.status = 'cancelled' AND NEW.status = 'confirmed' THEN
      SELECT capacity, booked_count, max_tickets_per_user
        INTO v_capacity, v_booked, v_max_per_user
        FROM public.events
       WHERE id = NEW.event_id
         FOR UPDATE;

      IF NEW.tickets_requested > v_max_per_user THEN
        RAISE EXCEPTION 'Requested seats exceed the per-user limit of %', v_max_per_user;
      END IF;

      IF v_booked + NEW.tickets_requested > v_capacity THEN
        RAISE EXCEPTION 'Event is fully booked';
      END IF;

      UPDATE public.events
         SET booked_count = booked_count + NEW.tickets_requested
       WHERE id = NEW.event_id;

    -- confirmed → confirmed with a changed ticket count: apply validated delta
    ELSIF OLD.status = 'confirmed'
      AND NEW.status = 'confirmed'
      AND OLD.tickets_requested IS DISTINCT FROM NEW.tickets_requested THEN

      SELECT capacity, booked_count, max_tickets_per_user
        INTO v_capacity, v_booked, v_max_per_user
        FROM public.events
       WHERE id = NEW.event_id
         FOR UPDATE;

      IF NEW.tickets_requested < 1 THEN
        RAISE EXCEPTION 'Seat count must be at least 1';
      END IF;

      IF NEW.tickets_requested > v_max_per_user THEN
        RAISE EXCEPTION 'Requested seats exceed the per-user limit of %', v_max_per_user;
      END IF;

      -- v_booked already includes OLD.tickets_requested; check post-delta
      IF (v_booked - OLD.tickets_requested + NEW.tickets_requested) > v_capacity THEN
        RAISE EXCEPTION 'Not enough capacity for this seat change';
      END IF;

      UPDATE public.events
         SET booked_count = GREATEST(0, booked_count + (NEW.tickets_requested - OLD.tickets_requested))
       WHERE id = NEW.event_id;

    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- Recreate the trigger to fire on INSERT, UPDATE, and DELETE
DROP TRIGGER IF EXISTS trg_sync_booked_count ON public.reservations;

CREATE TRIGGER trg_sync_booked_count
  AFTER INSERT OR UPDATE OR DELETE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_booked_count();
