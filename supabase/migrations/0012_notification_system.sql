-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 15: Centralized Notification System
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  type        TEXT        NOT NULL,  -- 'new_event' | 'cancelled_event' | 'admin_broadcast' | 'capacity_alert'
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  link_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id      ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread  ON public.notifications (user_id, is_read) WHERE is_read = false;

-- ── 2. Row-Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users read their own notifications
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users mark their own notifications as read
CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admins can INSERT notifications for any user (broadcast feature)
CREATE POLICY "notifications_insert_admin"
  ON public.notifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can manage all notification rows
CREATE POLICY "notifications_all_admin"
  ON public.notifications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 3. Trigger: notify affected users when an event is cancelled ───────────────

CREATE OR REPLACE FUNCTION public.notify_on_event_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire only on transitions INTO 'cancelled'
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    INSERT INTO public.notifications (user_id, title, message, type, link_url)
    SELECT
      r.user_id,
      'Event Cancelled',
      'The event "' || NEW.title || '" has been cancelled. Your reservation has been voided.',
      'cancelled_event',
      '/events/' || NEW.id
    FROM public.reservations r
    WHERE r.event_id = NEW.id
      AND r.status = 'confirmed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_event_cancel ON public.events;
CREATE TRIGGER trg_notify_on_event_cancel
  AFTER UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_event_cancel();

-- ── 4. Trigger: notify all approved users when a new event is published ────────

CREATE OR REPLACE FUNCTION public.notify_on_new_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_notify_on_new_event ON public.events;
CREATE TRIGGER trg_notify_on_new_event
  AFTER INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_event();
