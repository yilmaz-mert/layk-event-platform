-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 15.5 (Rewrite): Personalized Interest-Based Capacity Alert System
--
-- 1. user_interests table  — tracks which categories each user cares about
-- 2. trg_track_interest_on_booking  — upserts the booked event's category on
--    every confirmed reservation INSERT
-- 3. trg_notify_on_capacity_threshold  — capacity alert that ONLY targets users
--    who have an interest row matching the event's category
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. user_interests table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_interests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category    TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);

-- Fast lookup for the capacity-alert INSERT and potential future analytics
CREATE INDEX IF NOT EXISTS idx_user_interests_category ON public.user_interests (category);
CREATE INDEX IF NOT EXISTS idx_user_interests_user_id  ON public.user_interests (user_id);

ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_interests_select_own"
  ON public.user_interests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_interests_insert_own"
  ON public.user_interests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_interests_update_own"
  ON public.user_interests FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2. Trigger: populate user_interests on booking ────────────────────────────

CREATE OR REPLACE FUNCTION public.track_interest_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category TEXT;
BEGIN
  -- Only track confirmed reservations; ignore pending / cancelled inserts
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT category INTO v_category
  FROM public.events
  WHERE id = NEW.event_id;

  IF v_category IS NOT NULL THEN
    INSERT INTO public.user_interests (user_id, category, updated_at)
    VALUES (NEW.user_id, v_category, now())
    ON CONFLICT (user_id, category) DO UPDATE
      SET updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_interest_on_booking ON public.reservations;
CREATE TRIGGER trg_track_interest_on_booking
  AFTER INSERT ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.track_interest_on_booking();

-- ── 3. Capacity-alert trigger (interest-scoped) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_on_capacity_threshold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  spots_left   INT;
  at_threshold BOOLEAN;
BEGIN
  -- Skip when booked_count did not actually change
  IF NEW.booked_count IS NOT DISTINCT FROM OLD.booked_count THEN
    RETURN NEW;
  END IF;

  -- Without a category there are no interest rows to match against
  IF NEW.category IS NULL THEN
    RETURN NEW;
  END IF;

  spots_left   := NEW.capacity - NEW.booked_count;
  at_threshold := (NEW.booked_count::numeric / NULLIF(NEW.capacity, 0)) >= 0.9
               OR spots_left <= 5;

  -- Fire only when the threshold is crossed, the event still has seats,
  -- and no capacity_alert has been sent for this event before.
  -- The NOT EXISTS guard covers the "fluctuates around the threshold" case:
  -- once alerted, the row in notifications prevents a second alert forever.
  IF at_threshold
     AND spots_left > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications
       WHERE type     = 'capacity_alert'
         AND link_url = '/events/' || NEW.id::text
       LIMIT 1
     )
  THEN
    INSERT INTO public.notifications (user_id, title, message, type, link_url)
    SELECT
      u.id,
      'Almost Full: ' || NEW.title,
      'An event in your favorite category "' || NEW.category || '" is almost full! Only '
        || spots_left
        || ' spot'
        || CASE WHEN spots_left = 1 THEN '' ELSE 's' END
        || ' left for "'
        || NEW.title
        || '". Book now!',
      'capacity_alert',
      '/events/' || NEW.id::text
    FROM public.user_interests ui
    JOIN public.users u ON u.id = ui.user_id
    WHERE ui.category        = NEW.category
      AND u.approval_status  = 'approved';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_capacity_threshold ON public.events;
CREATE TRIGGER trg_notify_on_capacity_threshold
  AFTER UPDATE OF booked_count ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_capacity_threshold();
