-- Phase 9: Production Hardening, Security & Indexing

-- ── 1. Protect user privileges ────────────────────────────────────────────────
-- Prevents non-admins from escalating their own role or approval_status
CREATE OR REPLACE FUNCTION public.protect_user_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role OR OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    IF (SELECT role FROM public.users WHERE id = auth.uid()) <> 'admin' THEN
      RAISE EXCEPTION 'Insufficient permissions: only admins can change role or approval_status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_privileges ON public.users;
CREATE TRIGGER trg_protect_user_privileges
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_privileges();


-- ── 2. Protect reservation integrity ─────────────────────────────────────────
-- Prevents changing event_id or user_id on an existing reservation
CREATE OR REPLACE FUNCTION public.protect_reservation_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.event_id IS DISTINCT FROM NEW.event_id OR OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Cannot modify event_id or user_id on an existing reservation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_reservation_integrity ON public.reservations;
CREATE TRIGGER trg_protect_reservation_integrity
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_reservation_integrity();


-- ── 3. Performance indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reservations_user_id       ON public.reservations (user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_event_id      ON public.reservations (event_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_reservation_id  ON public.reservation_audit_logs (reservation_id);
CREATE INDEX IF NOT EXISTS idx_events_status_date         ON public.events (status, event_date);


-- ── 4. Storage bucket restrictions ───────────────────────────────────────────
UPDATE storage.buckets
   SET file_size_limit    = 5242880,
       allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
 WHERE id = 'event-banners';
