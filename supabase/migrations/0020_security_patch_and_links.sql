-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 23: Security Patch — ticket_messages RLS hardening & deep-link sync
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Ensure link_url column exists on notifications (idempotent) ────────────
-- The column was created in 0012; this guard makes the migration safe to apply
-- on any environment where that migration may not have included it.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link_url TEXT;

-- ── 2. Harden ticket_messages INSERT policy (role & ID spoofing fix) ──────────
-- The original policy from 0016 only checked ticket ownership, which allowed a
-- user to insert rows with an arbitrary sender_id or sender_role = 'admin'.
-- The replacement strictly enforces: non-admins must set sender_id = auth.uid()
-- AND sender_role = 'user', and must own the ticket being written to.

DROP POLICY IF EXISTS "ticket_messages_insert_own_ticket" ON public.ticket_messages;

CREATE POLICY "ticket_messages_insert_own_ticket"
  ON public.ticket_messages FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      sender_id   = auth.uid()
      AND sender_role = 'user'
      AND EXISTS (
        SELECT 1 FROM public.support_tickets st
        WHERE st.id       = ticket_id
          AND st.user_id  = auth.uid()
      )
    )
  );

-- ── 3. Canonical trigger function — populates link_url for deep-linking ───────
-- Re-declares fn_notify_on_ticket_reply to ensure it includes link_url
-- regardless of which partial state prior migrations may have left behind.

CREATE OR REPLACE FUNCTION public.fn_notify_on_ticket_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Only fire for messages sent by an admin
  IF NEW.sender_role <> 'admin' THEN
    RETURN NEW;
  END IF;

  -- Resolve the ticket owner
  SELECT user_id INTO v_user_id
  FROM public.support_tickets
  WHERE id = NEW.ticket_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Insert notification with deep-link URL so the bell can route the user
  -- directly into the correct chat window (/profile?tab=support&ticketId=<uuid>)
  INSERT INTO public.notifications (user_id, type, title, message, link_url)
  VALUES (
    v_user_id,
    'ticket_reply',
    'New Support Message',
    'An administrator has replied to your support ticket.',
    '/profile?tab=support&ticketId=' || NEW.ticket_id::text
  );

  RETURN NEW;
END;
$$;
