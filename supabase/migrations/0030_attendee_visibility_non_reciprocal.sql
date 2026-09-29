-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0030: Attendee visibility is no longer reciprocal; no cooldown.
--
-- is_private now only hides the user FROM other users' attendee lists; it no
-- longer stops the user from seeing other visible attendees. New accounts are
-- visible by default, and the 24-hour toggle cooldown (0027) is removed.
--
-- Data fix scope (section 3): ONLY rows with is_private = true AND
-- privacy_changed_at IS NULL are flipped to visible. Those users never saved
-- a privacy preference themselves — their true came from the old default
-- (0026) or 0026's random seeding. Rows with privacy_changed_at set are
-- explicit choices and are left as-is, whichever way they point.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. New accounts are visible by default ───────────────────────────────────
-- handle_new_user (0005) doesn't set is_private, so the column default applies.
ALTER TABLE public.users ALTER COLUMN is_private SET DEFAULT false;

-- ── 2. Replace the cooldown trigger with a plain change marker ──────────────
-- Must run before section 3: the old trigger would stamp privacy_changed_at
-- on the data fix and make it look like a user choice. privacy_changed_at is
-- kept and still stamped on every user toggle, so it keeps marking "this
-- user set their preference explicitly".
DROP TRIGGER IF EXISTS trg_enforce_privacy_cooldown ON public.users;
DROP FUNCTION IF EXISTS public.enforce_privacy_cooldown();

CREATE OR REPLACE FUNCTION public.stamp_privacy_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_private IS DISTINCT FROM NEW.is_private THEN
    NEW.privacy_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3. Data fix: un-hide users who never chose to be hidden ─────────────────
-- Runs before the stamp trigger exists, so privacy_changed_at stays NULL.
UPDATE public.users
SET is_private = false
WHERE is_private = true
  AND privacy_changed_at IS NULL;

CREATE TRIGGER trg_stamp_privacy_changed_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_privacy_changed_at();

-- ── 4. Drop the requester-privacy gate from the attendee RPC ────────────────
-- Still: anonymous callers get nothing, the caller must have a profile row,
-- only confirmed reservations count, and private attendees are filtered out
-- here in the database (never sent to the client).
CREATE OR REPLACE FUNCTION public.get_public_event_attendees(p_event_id UUID)
RETURNS TABLE (id UUID, full_name TEXT, avatar_url TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.full_name, u.avatar_url
  FROM public.reservations r
  JOIN public.users u ON u.id = r.user_id
  WHERE r.event_id = p_event_id
    AND r.status = 'confirmed'
    AND u.is_private = false;
END;
$$;
