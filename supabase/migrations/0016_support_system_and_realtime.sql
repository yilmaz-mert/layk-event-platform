-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 16: Support Ticket System & Realtime Publication
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. support_tickets ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject     TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status  ON public.support_tickets (status);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Users: read and create only their own tickets
CREATE POLICY "support_tickets_select_own"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "support_tickets_insert_own"
  ON public.support_tickets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins: full control
CREATE POLICY "support_tickets_admin_all"
  ON public.support_tickets FOR ALL
  USING (public.is_admin());


-- ── 2. ticket_messages ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID        NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id    UUID        NOT NULL REFERENCES public.users(id),
  sender_role  TEXT        NOT NULL CHECK (sender_role IN ('admin', 'user')),
  message      TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON public.ticket_messages (ticket_id);

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Users can read/write messages on their own tickets
CREATE POLICY "ticket_messages_select_own_ticket"
  ON public.ticket_messages FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = ticket_id
        AND st.user_id = auth.uid()
    )
  );

CREATE POLICY "ticket_messages_insert_own_ticket"
  ON public.ticket_messages FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = ticket_id
        AND st.user_id = auth.uid()
    )
  );

-- Admins: full control
CREATE POLICY "ticket_messages_admin_all"
  ON public.ticket_messages FOR ALL
  USING (public.is_admin());


-- ── 3. Realtime publication ───────────────────────────────────────────────────
-- Idempotent: only ADD if the table is not already published.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ticket_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;
  END IF;
END $$;
