-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 0026: Privacy-by-default, curated category colors, and a secure
-- reciprocal attendee-visibility RPC.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Privacy default flips to hidden-by-default ───────────────────────────
-- New accounts are now private unless the user explicitly opts in to public
-- visibility from their profile settings.

ALTER TABLE public.users ALTER COLUMN is_private SET DEFAULT true;

-- Dev/local convenience: existing seed users get a random mix of true/false
-- so the reciprocal-visibility UI (Step 5) has something to demonstrate
-- locally instead of every row being uniformly false from 0025's old default.
UPDATE public.users SET is_private = (random() > 0.5);

-- avatar_url didn't exist yet — the attendee RPC below returns it, and it's
-- a harmless, nullable, additive column otherwise.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── 2. Seed a curated, distinct color palette onto existing categories ──────
-- Cycles a 6-color palette over whatever categories already exist (by
-- creation order), rather than assuming fixed category names.

WITH palette(color_code, ord) AS (
  VALUES
    ('#6366f1', 1), -- Indigo
    ('#10b981', 2), -- Emerald
    ('#f43f5e', 3), -- Rose
    ('#f59e0b', 4), -- Amber
    ('#0ea5e9', 5), -- Sky
    ('#8b5cf6', 6)  -- Violet
),
ranked AS (
  SELECT id, ((row_number() OVER (ORDER BY created_at) - 1) % 6) + 1 AS ord
  FROM public.event_categories
)
UPDATE public.event_categories ec
SET color_code = p.color_code
FROM ranked r
JOIN palette p ON p.ord = r.ord
WHERE ec.id = r.id;

-- ── 3. Secure reciprocal attendee visibility ─────────────────────────────────
-- Do NOT rely on frontend filtering: `public.users` only exposes a caller's
-- own row via RLS ("users: read own row", 0001), so this SECURITY DEFINER
-- function is the only way to surface *other* users' names for an event, and
-- it enforces the reciprocal rule itself before returning anything.

CREATE OR REPLACE FUNCTION public.get_public_event_attendees(p_event_id UUID)
RETURNS TABLE (id UUID, full_name TEXT, avatar_url TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _requester_private BOOLEAN;
BEGIN
  -- Anonymous callers see nothing.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT u.is_private INTO _requester_private
  FROM public.users u
  WHERE u.id = auth.uid();

  -- Requester must have made their own account public (and must exist) to
  -- see other public attendees. IS DISTINCT FROM false also covers the
  -- (should-not-happen) case of a missing profile row as "private".
  IF _requester_private IS DISTINCT FROM false THEN
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

-- Callable by any authenticated/anon session — the function itself decides
-- what (if anything) to return, so no separate GRANT-level gating is needed.
GRANT EXECUTE ON FUNCTION public.get_public_event_attendees(UUID) TO authenticated, anon;

-- ── 4. RLS verification ──────────────────────────────────────────────────────
-- Idempotent re-assertion — all four tables already have RLS enabled from
-- 0001/0025, and no policy on any of them selects rows by another user's
-- is_private/id without going through this SECURITY DEFINER function:
--   • users:        "users: read own row" restricts SELECT to auth.uid() = id.
--   • events:       "events: users view active or completed" has no user
--                    join at all.
--   • reservations: "reservations: users view own" restricts to
--                    user_id = auth.uid().
--   • event_categories: SELECT is public by design (colors/names only, no
--                    user data).
ALTER TABLE public.events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations      ENABLE ROW LEVEL SECURITY;
