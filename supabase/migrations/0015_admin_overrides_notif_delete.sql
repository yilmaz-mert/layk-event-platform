-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 15: Admin Capacity Bypasses & Notification Self-Service
--
-- 1. book_event RPC — admins bypass all capacity / per-user limits
-- 2. sync_booked_count trigger — admins bypass capacity validation on direct
--    reservation UPDATEs (booked_count is still updated correctly)
-- 3. notifications — add DELETE RLS so users can dismiss their own rows
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. book_event: admin skips every guard except the auth check ──────────────

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
  v_is_admin      boolean;
BEGIN
  -- ── Auth guard (always enforced) ──────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() <> p_user_uuid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: you may only book for your own account'
      USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.is_admin();

  -- ── Lock event row ────────────────────────────────────────────────────────
  SELECT capacity, booked_count, max_tickets_per_user
    INTO v_capacity, v_booked, v_max_per_user
    FROM public.events
   WHERE id = p_event_uuid
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- ── Seat-count sanity + per-user cap (non-admins only) ───────────────────
  IF NOT v_is_admin THEN
    IF p_requested_seats < 1 THEN
      RAISE EXCEPTION 'Seat count must be at least 1';
    END IF;

    IF p_requested_seats > v_max_per_user THEN
      RAISE EXCEPTION 'Requested seats exceed the per-user limit of %', v_max_per_user;
    END IF;
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

    -- Capacity guard (bypass for admins)
    IF NOT v_is_admin AND v_booked + p_requested_seats > v_capacity THEN
      RAISE EXCEPTION 'Event is fully booked';
    END IF;

    -- Reactivate cancelled row
    UPDATE public.reservations
       SET status            = 'confirmed',
           tickets_requested = p_requested_seats,
           created_at        = now()
     WHERE event_id = p_event_uuid
       AND user_id  = p_user_uuid;
  ELSE
    -- Capacity guard (bypass for admins)
    IF NOT v_is_admin AND v_booked + p_requested_seats > v_capacity THEN
      RAISE EXCEPTION 'Event is fully booked';
    END IF;

    INSERT INTO public.reservations (event_id, user_id, status, tickets_requested)
    VALUES (p_event_uuid, p_user_uuid, 'confirmed', p_requested_seats);
  END IF;

  -- booked_count is maintained exclusively by trg_sync_booked_count.
END;
$$;


-- ── 2. sync_booked_count: admin bypasses validation, not the counter update ───

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
  v_is_admin     boolean;
BEGIN
  v_is_admin := public.is_admin();

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

    -- cancelled → confirmed: claim seats (validate for non-admins)
    ELSIF OLD.status = 'cancelled' AND NEW.status = 'confirmed' THEN
      SELECT capacity, booked_count, max_tickets_per_user
        INTO v_capacity, v_booked, v_max_per_user
        FROM public.events
       WHERE id = NEW.event_id
         FOR UPDATE;

      IF NOT v_is_admin THEN
        IF NEW.tickets_requested > v_max_per_user THEN
          RAISE EXCEPTION 'Requested seats exceed the per-user limit of %', v_max_per_user;
        END IF;
        IF v_booked + NEW.tickets_requested > v_capacity THEN
          RAISE EXCEPTION 'Event is fully booked';
        END IF;
      END IF;

      UPDATE public.events
         SET booked_count = booked_count + NEW.tickets_requested
       WHERE id = NEW.event_id;

    -- confirmed → confirmed, ticket count changed
    ELSIF OLD.status = 'confirmed'
      AND NEW.status = 'confirmed'
      AND OLD.tickets_requested IS DISTINCT FROM NEW.tickets_requested THEN

      SELECT capacity, booked_count, max_tickets_per_user
        INTO v_capacity, v_booked, v_max_per_user
        FROM public.events
       WHERE id = NEW.event_id
         FOR UPDATE;

      IF NOT v_is_admin THEN
        IF NEW.tickets_requested < 1 THEN
          RAISE EXCEPTION 'Seat count must be at least 1';
        END IF;
        IF NEW.tickets_requested > v_max_per_user THEN
          RAISE EXCEPTION 'Requested seats exceed the per-user limit of %', v_max_per_user;
        END IF;
        IF (v_booked - OLD.tickets_requested + NEW.tickets_requested) > v_capacity THEN
          RAISE EXCEPTION 'Not enough capacity for this seat change';
        END IF;
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


-- ── 3. Notifications: allow users to delete their own rows ────────────────────

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;

CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);
