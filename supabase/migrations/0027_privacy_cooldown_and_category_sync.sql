-- Migration 0027: Backfill legacy category text onto event_categories/category_id,
-- and enforce a 24-hour cooldown on privacy toggling to prevent abuse.

-- ── 1. Sync existing legacy `events.category` text into `event_categories` ──
-- Older events were created before category_id existed and only have the
-- legacy text column populated. Surface those as real category rows so they
-- get a color and show up in the category manager/filter UI.

INSERT INTO public.event_categories (name, color_code)
SELECT DISTINCT category, '#6366f1'
FROM public.events
WHERE category IS NOT NULL AND TRIM(category) <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE public.events e
SET category_id = c.id
FROM public.event_categories c
WHERE e.category = c.name AND e.category_id IS NULL;

-- ── 2. 24-hour cooldown on privacy toggling ──────────────────────────────────
-- Prevents users from flipping is_private back and forth to dodge the
-- reciprocal attendee-visibility rule (0026). Admins bypass the cooldown.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS privacy_changed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.enforce_privacy_cooldown()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_private IS DISTINCT FROM NEW.is_private THEN
    IF public.is_admin() THEN
      RETURN NEW;
    END IF;

    IF OLD.privacy_changed_at IS NOT NULL AND now() < OLD.privacy_changed_at + INTERVAL '24 hours' THEN
      RAISE EXCEPTION 'Gizlilik ayarı 24 saat içinde sadece bir kez değiştirilebilir. Lütfen bekleyin.';
    END IF;

    NEW.privacy_changed_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_privacy_cooldown ON public.users;
CREATE TRIGGER trg_enforce_privacy_cooldown
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_privacy_cooldown();
