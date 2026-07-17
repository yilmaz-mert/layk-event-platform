-- ============================================================
-- 0029_event_soft_delete_and_status.sql
-- Soft-delete (archive) events instead of hard-deleting them.
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- Regular (non-admin) SELECT: archived events must disappear from every
-- public/user-facing view alongside the existing published/status checks.
-- "events: admin full access" (0001) is a separate FOR ALL USING (is_admin())
-- policy and is unaffected — admins keep seeing archived rows through it.
DROP POLICY IF EXISTS "events: users view active or completed" ON public.events;
CREATE POLICY "events: users view active or completed"
    ON public.events
    FOR SELECT
    USING (
        status = ANY (ARRAY['active', 'completed'])
        AND is_published = true
        AND is_archived = false
    );
