-- ============================================================
-- 0033_event_cancellation_keeps_reservations.sql
--
-- BUG-002 product rules:
--   * Cancelling an event keeps reservations, ticket counts and booked_count
--     (nothing here touches reservations). Booking, re-booking and ticket changes
--     stay closed through 0031's assert_booking_allowed (status must be 'active');
--     a holder can still cancel their own reservation (releases seats as before).
--   * Holders keep read access to a cancelled event through their own
--     reservation (any reservation status), so Rezervasyonlarım, the detail page
--     and old notification links keep working. Guests, unrelated users, drafts
--     and archived events are not opened up.
--   * In-app notices on real transitions only:
--       cancel notice  — status turns 'cancelled' while the event is published,
--                        not archived and in the future; to confirmed holders.
--       reopen notice  — after such a notice, the first time the event is
--                        bookable again (active + published + not archived +
--                        future); to confirmed holders, with date and location.
--     events.reopen_notice_pending remembers "holders were told it is
--     cancelled", so re-saves, edits and un/re-publish never repeat a notice.
--   * events.cancellation_note: organiser's cancellation message
--     (closing_comment stays the completed-event note).
-- ============================================================


-- ── 1. Columns ────────────────────────────────────────────────────────────────

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cancellation_note     text,
  ADD COLUMN IF NOT EXISTS reopen_notice_pending boolean NOT NULL DEFAULT false;

-- Holders of currently cancelled events were already told (0012 notice), so a
-- reopen should reach them. Runs before the new triggers exist: the 0012
-- trigger only fires on a status change, so this sends nothing.
UPDATE public.events
   SET reopen_notice_pending = true
 WHERE status = 'cancelled' AND NOT reopen_notice_pending;


-- ── 2. Read access through one's own reservation ──────────────────────────────

-- SECURITY DEFINER so the policy below never evaluates reservations' own RLS
-- (no policy recursion between events and reservations).
CREATE OR REPLACE FUNCTION public.user_has_reservation(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reservations
     WHERE event_id = p_event_id AND user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_reservation(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_has_reservation(uuid) TO authenticated;

-- Additional permissive policy; "events: users view active or completed" (0029)
-- is unchanged. TO authenticated: guests never evaluate it.
DROP POLICY IF EXISTS "events: holders view own cancelled" ON public.events;
CREATE POLICY "events: holders view own cancelled"
    ON public.events
    FOR SELECT
    TO authenticated
    USING (
        status = 'cancelled'
        AND is_published = true
        AND is_archived = false
        AND public.user_has_reservation(id)
    );


-- ── 3. Transition bookkeeping (BEFORE UPDATE) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.track_event_cancellation_notice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT OLD.reopen_notice_pending
     AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.status = 'cancelled'
     AND NEW.is_published IS TRUE
     AND NEW.is_archived = false
     AND NEW.event_date > now() THEN
    NEW.reopen_notice_pending := true;            -- → cancel notice
  ELSIF OLD.reopen_notice_pending
     AND NEW.status = 'active'
     AND NEW.is_published IS TRUE
     AND NEW.is_archived = false
     AND NEW.event_date > now() THEN
    NEW.reopen_notice_pending := false;           -- → reopen notice
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_event_cancellation_notice ON public.events;
CREATE TRIGGER trg_track_event_cancellation_notice
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.track_event_cancellation_notice();


-- ── 4. Notices (AFTER UPDATE; replaces the 0012 body, same trigger name) ─────

CREATE OR REPLACE FUNCTION public.notify_on_event_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_announced boolean;
  v_when      text;
BEGIN
  IF NEW.reopen_notice_pending AND NOT OLD.reopen_notice_pending THEN
    INSERT INTO public.notifications (user_id, title, message, type, link_url)
    SELECT r.user_id,
           'Etkinlik iptal edildi: ' || NEW.title,
           'Etkinlik organizatör tarafından iptal edildi. Rezervasyon kaydınız korunuyor; '
             || 'etkinlik yeniden açılırsa size bildireceğiz.',
           'cancelled_event',
           '/events/' || NEW.id
      FROM public.reservations r
     WHERE r.event_id = NEW.id AND r.status = 'confirmed';

  ELSIF OLD.reopen_notice_pending AND NOT NEW.reopen_notice_pending THEN
    -- 0031's first-publish announcement fired in this same statement: approved
    -- users already got a notification for this event, so skip them here.
    v_announced := OLD.new_event_notified_at IS NULL AND NEW.new_event_notified_at IS NOT NULL;
    v_when := to_char(NEW.event_date AT TIME ZONE 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');

    INSERT INTO public.notifications (user_id, title, message, type, link_url)
    SELECT r.user_id,
           'Etkinlik yeniden açıldı: ' || NEW.title,
           'Etkinlik yeniden rezervasyona açıldı; rezervasyonunuz geçerli. Tarih: ' || v_when
             || coalesce('. Mekan: ' || nullif(btrim(NEW.location), ''), '') || '.',
           'event_reopened',
           '/events/' || NEW.id
      FROM public.reservations r
      JOIN public.users u ON u.id = r.user_id
     WHERE r.event_id = NEW.id AND r.status = 'confirmed'
       AND NOT (v_announced AND u.approval_status = 'approved');
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger definition unchanged from 0012 (AFTER UPDATE ON public.events).
DROP TRIGGER IF EXISTS trg_notify_on_event_cancel ON public.events;
CREATE TRIGGER trg_notify_on_event_cancel
  AFTER UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_event_cancel();
