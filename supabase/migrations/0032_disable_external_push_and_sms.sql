-- ============================================================
-- 0032_disable_external_push_and_sms.sql
--
-- Scope change: SMS and mobile (Expo) push are dropped. Only in-app
-- notifications remain (public.notifications + the web bell via Realtime).
--
-- Removed (outbound HTTP only):
--   notifications INSERT → trg_send_push_on_notification (0022)
--     → trigger_send_push_notification() → extensions.http_post → net.http_post
--     → Edge Function send-push → Expo push API
--   reservations INSERT → trg_send_booking_sms_on_reservation (0025)
--     → trigger_send_booking_sms() → extensions.http_post → net.http_post
--     → Edge Function send-booking-sms
--   extensions.http_post(text, text, text, text) (0024): project-owned wrapper,
--     used only by the two functions above.
--
-- Kept unchanged: public.notifications and its RLS, the supabase_realtime
-- publication, and every trigger that writes in-app notifications
-- (notify_on_new_event, notify_on_event_cancel, notify_on_capacity_threshold,
-- fn_notify_on_ticket_reply). users.push_token stays (no data loss); it is unused.
-- pg_net / http extensions stay installed: dropping them is not needed and could
-- affect dashboard-managed features.
-- ============================================================

DROP TRIGGER IF EXISTS trg_send_push_on_notification ON public.notifications;
DROP TRIGGER IF EXISTS trg_send_booking_sms_on_reservation ON public.reservations;

DROP FUNCTION IF EXISTS public.trigger_send_push_notification();
DROP FUNCTION IF EXISTS public.trigger_send_booking_sms();

DROP FUNCTION IF EXISTS extensions.http_post(text, text, text, text);
