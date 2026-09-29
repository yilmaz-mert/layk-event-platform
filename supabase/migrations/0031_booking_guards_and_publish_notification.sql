-- ============================================================
-- 0031_booking_guards_and_publish_notification.sql
--
-- SEC-001  Only approved users can book (book_event + direct reservation UPDATEs).
--          Also closes the self-approval / self-promotion hole: the users-row
--          privilege guard never ran for PostgREST requests (see §1).
-- BUG-001  Only active, published, non-archived, future events are bookable.
-- BUG-003  New-event notification fires once, when an event first becomes
--          visible and bookable — not for drafts, not again on re-publish.
--
-- Admin exceptions are unchanged: admins bypass every booking check
-- (other users, capacity, per-user limit, event state), as in 0015.
-- Event cancellation behaviour (notify_on_event_cancel) is intentionally untouched.
-- ============================================================


-- ── 1. protect_user_privileges: run as the caller ────────────────────────────
-- The function checks `current_user IN ('postgres', 'service_role', ...)` to let
-- backend jobs through, but as SECURITY DEFINER current_user is always the owner
-- (postgres), so the guard returned early for everyone and any signed-in user
-- could set their own role/approval_status via "Users can update own profile".
-- As SECURITY INVOKER, current_user is 'authenticated' for PostgREST requests and
-- the revert applies; is_admin() is itself SECURITY DEFINER and still works.

ALTER FUNCTION public.protect_user_privileges() SECURITY INVOKER;


-- ── 2. Shared booking eligibility check ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_booking_allowed(p_user_uuid uuid, p_event_uuid uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
     WHERE id = p_user_uuid AND approval_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Account is not approved for booking'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.events
     WHERE id = p_event_uuid
       AND status = 'active'
       AND is_published IS TRUE
       AND is_archived = false
       AND event_date > now()
  ) THEN
    RAISE EXCEPTION 'Event is not open for booking';
  END IF;
END;
$$;

-- Internal helper: only the SECURITY DEFINER functions below call it.
REVOKE EXECUTE ON FUNCTION public.assert_booking_allowed(uuid, uuid) FROM PUBLIC, anon, authenticated;


-- ── 3. book_event: 0015 + eligibility for non-admins ─────────────────────────

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

  -- ── Lock event row (serialises concurrent bookings for the same event) ────
  SELECT capacity, booked_count, max_tickets_per_user
    INTO v_capacity, v_booked, v_max_per_user
    FROM public.events
   WHERE id = p_event_uuid
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF NOT v_is_admin THEN
    -- Approval + event state, evaluated while holding the event lock.
    PERFORM public.assert_booking_allowed(p_user_uuid, p_event_uuid);

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

    IF NOT v_is_admin AND v_booked + p_requested_seats > v_capacity THEN
      RAISE EXCEPTION 'Event is fully booked';
    END IF;

    -- Reactivate cancelled row. Runs as the function owner, so
    -- guard_reservation_reactivation lets it through; sync_booked_count re-checks.
    UPDATE public.reservations
       SET status            = 'confirmed',
           tickets_requested = p_requested_seats,
           created_at        = now()
     WHERE event_id = p_event_uuid
       AND user_id  = p_user_uuid;
  ELSE
    IF NOT v_is_admin AND v_booked + p_requested_seats > v_capacity THEN
      RAISE EXCEPTION 'Event is fully booked';
    END IF;

    INSERT INTO public.reservations (event_id, user_id, status, tickets_requested)
    VALUES (p_event_uuid, p_user_uuid, 'confirmed', p_requested_seats);
  END IF;

  -- booked_count is maintained exclusively by trg_sync_booked_count.
END;
$$;


-- ── 4. Direct reactivation must go through book_event ────────────────────────
-- "reservations: users update own" (0003) lets users UPDATE their rows, which
-- they need for cancelling and changing the ticket count. Flipping
-- cancelled → confirmed directly is refused for non-admins: re-booking goes
-- through book_event. SECURITY INVOKER on purpose: current_user is
-- 'authenticated'/'anon' for a PostgREST request and the function owner inside
-- book_event, which is what distinguishes the two paths.

CREATE OR REPLACE FUNCTION public.guard_reservation_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'cancelled'
     AND NEW.status = 'confirmed'
     AND current_user IN ('authenticated', 'anon')
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Cancelled reservations can only be re-booked with book_event'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_reservation_reactivation ON public.reservations;
CREATE TRIGGER trg_guard_reservation_reactivation
  BEFORE UPDATE OF status ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_reservation_reactivation();


-- ── 5. sync_booked_count: 0015 + eligibility on every non-admin seat claim ───
-- Covers the reactivation done by book_event and direct ticket-count changes
-- (EventDetails "update"), after the event row is locked.

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

  -- ── INSERT (only reachable through book_event, which already checked) ─────
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

    -- confirmed → cancelled: release seats (always allowed)
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
        PERFORM public.assert_booking_allowed(NEW.user_id, NEW.event_id);
        IF NEW.tickets_requested < 1 THEN
          RAISE EXCEPTION 'Seat count must be at least 1';
        END IF;
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

    -- confirmed → confirmed, ticket count changed (validate for non-admins)
    ELSIF OLD.status = 'confirmed'
      AND NEW.status = 'confirmed'
      AND OLD.tickets_requested IS DISTINCT FROM NEW.tickets_requested THEN

      SELECT capacity, booked_count, max_tickets_per_user
        INTO v_capacity, v_booked, v_max_per_user
        FROM public.events
       WHERE id = NEW.event_id
         FOR UPDATE;

      IF NOT v_is_admin THEN
        PERFORM public.assert_booking_allowed(NEW.user_id, NEW.event_id);
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


-- ── 6. New-event notification: once, on first visibility ─────────────────────
-- new_event_notified_at is the persistent "already announced" marker, so
-- unpublish → re-publish and later edits never announce the event again.
-- Existing rows are marked as announced: the old AFTER INSERT trigger (0012)
-- already notified on creation for every event, drafts included.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS new_event_notified_at timestamptz;

UPDATE public.events
   SET new_event_notified_at = created_at
 WHERE new_event_notified_at IS NULL;

-- BEFORE: stamp the marker the first time the row is announceable.
CREATE OR REPLACE FUNCTION public.mark_event_announced()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.new_event_notified_at IS NULL
     AND NEW.is_published IS TRUE
     AND NEW.status = 'active'
     AND NEW.is_archived = false
     AND NEW.event_date > now() THEN
    NEW.new_event_notified_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- AFTER: notify approved users when the marker was set by this statement.
-- (Plain AFTER UPDATE: `UPDATE OF col` ignores values set by BEFORE triggers.)
CREATE OR REPLACE FUNCTION public.notify_on_new_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.new_event_notified_at IS NULL
     OR (TG_OP = 'UPDATE' AND OLD.new_event_notified_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, link_url)
  SELECT
    u.id,
    'New Event: ' || NEW.title,
    'A new event "' || NEW.title || '" is now available. Secure your spot today!',
    'new_event',
    '/events/' || NEW.id
  FROM public.users u
  WHERE u.approval_status = 'approved';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_event_announced ON public.events;
CREATE TRIGGER trg_mark_event_announced
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_event_announced();

DROP TRIGGER IF EXISTS trg_notify_on_new_event ON public.events;
CREATE TRIGGER trg_notify_on_new_event
  AFTER INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_event();
