-- Phase 8: Final QA — Concurrency & Limits Hardening

-- ── book_event: atomic lock + per-user limit enforcement ─────────────────────
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
  -- Lock the event row so concurrent bookings serialise here
  SELECT capacity, booked_count, max_tickets_per_user
    INTO v_capacity, v_booked, v_max_per_user
    FROM public.events
   WHERE id = p_event_uuid
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Per-user ticket cap
  IF p_requested_seats > v_max_per_user THEN
    RAISE EXCEPTION 'Requested seats exceed the per-user limit of %', v_max_per_user;
  END IF;

  -- Check whether this user already has a reservation
  SELECT status
    INTO v_exist_status
    FROM public.reservations
   WHERE event_id = p_event_uuid
     AND user_id  = p_user_uuid;

  IF FOUND THEN
    IF v_exist_status = 'confirmed' THEN
      RAISE EXCEPTION 'Already booked for this event';
    END IF;

    -- Reactivate a cancelled reservation
    IF v_booked + p_requested_seats > v_capacity THEN
      RAISE EXCEPTION 'Event is fully booked';
    END IF;

    UPDATE public.reservations
       SET status            = 'confirmed',
           tickets_requested = p_requested_seats,
           created_at        = now()
     WHERE event_id = p_event_uuid
       AND user_id  = p_user_uuid;
  ELSE
    -- Fresh booking
    IF v_booked + p_requested_seats > v_capacity THEN
      RAISE EXCEPTION 'Event is fully booked';
    END IF;

    INSERT INTO public.reservations (event_id, user_id, status, tickets_requested)
    VALUES (p_event_uuid, p_user_uuid, 'confirmed', p_requested_seats);
  END IF;

  -- Increment the event's seat counter
  UPDATE public.events
     SET booked_count = booked_count + p_requested_seats
   WHERE id = p_event_uuid;
END;
$$;


-- ── sync_booked_count: lock + validate on seat-count edits ───────────────────
DROP TRIGGER IF EXISTS trg_sync_booked_count ON public.reservations;

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
  IF OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
    -- Cancellation: release seats
    UPDATE public.events
       SET booked_count = GREATEST(0, booked_count - OLD.tickets_requested)
     WHERE id = NEW.event_id;

  ELSIF OLD.status = 'confirmed'
    AND NEW.status = 'confirmed'
    AND OLD.tickets_requested <> NEW.tickets_requested THEN

    -- Seat-count edit: lock the event row and validate both limits
    SELECT capacity, booked_count, max_tickets_per_user
      INTO v_capacity, v_booked, v_max_per_user
      FROM public.events
     WHERE id = NEW.event_id
       FOR UPDATE;

    IF NEW.tickets_requested > v_max_per_user THEN
      RAISE EXCEPTION 'Requested seats exceed the per-user limit of %', v_max_per_user;
    END IF;

    -- v_booked includes OLD.tickets_requested; check post-delta value
    IF (v_booked - OLD.tickets_requested + NEW.tickets_requested) > v_capacity THEN
      RAISE EXCEPTION 'Not enough capacity for this seat change';
    END IF;

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
