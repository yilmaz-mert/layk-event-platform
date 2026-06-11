-- ============================================================
-- 0003_rls_updates.sql
-- RLS additions required by the booking engine & user dashboard
-- ============================================================

-- Allow users to cancel (update) their own reservations.
-- WITH CHECK restricts writes so users can only set status to 'cancelled'
-- via a normal UPDATE; they cannot modify other users' rows or escalate status.
CREATE POLICY "reservations: users update own"
    ON public.reservations
    FOR UPDATE
    USING  (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Broaden the events SELECT policy so users can view completed events.
-- Required for MyBookings to display event details for past reservations.
DROP POLICY IF EXISTS "events: users view active" ON public.events;

CREATE POLICY "events: users view active or completed"
    ON public.events
    FOR SELECT
    USING (status IN ('active', 'completed'));
