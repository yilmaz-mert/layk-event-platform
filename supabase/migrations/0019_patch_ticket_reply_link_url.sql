-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 13: Embed ticketId into link_url so the notification bell can
-- deep-link the user directly into the correct chat and suppress the
-- badge/sound when that ticket is already open.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_notify_on_ticket_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NEW.sender_role <> 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.support_tickets
  WHERE id = NEW.ticket_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

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
