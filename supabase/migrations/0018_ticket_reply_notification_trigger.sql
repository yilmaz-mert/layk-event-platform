-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 22: Automatic push notification when an admin replies to a ticket
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Trigger function ──────────────────────────────────────────────────────────

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

  -- Insert the in-app notification
  INSERT INTO public.notifications (user_id, type, title, message)
  VALUES (
    v_user_id,
    'ticket_reply',
    'New Support Message',
    'An administrator has replied to your support ticket.'
  );

  RETURN NEW;
END;
$$;

-- ── Attach trigger (idempotent) ───────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_notify_on_ticket_reply ON public.ticket_messages;

CREATE TRIGGER trg_notify_on_ticket_reply
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_on_ticket_reply();
