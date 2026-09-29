-- ============================================================
-- Read-only live check for migrations 0031 + 0032.
-- Paste into the Supabase SQL Editor and run. It is a single SELECT over the
-- system catalogs: it changes nothing, sends nothing and prints no setting values
-- (only whether a setting is present). Every row with durum = 'HATA' needs attention;
-- 'BİLGİ' rows are cleanup hints.
-- Also run by `npm run test:db` against a fresh local database (all rows must be OK/BİLGİ).
-- ============================================================
WITH
fn AS (
  SELECT n.nspname, p.proname, p.prosecdef, p.prosrc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public', 'extensions')
),
trg AS (
  SELECT c.relname, t.tgname, t.tgenabled <> 'D' AS enabled, pg_get_triggerdef(t.oid) AS def,
         pn.nspname AS fn_schema, p.prosrc AS fn_src
    FROM pg_trigger t
    JOIN pg_class c      ON c.oid = t.tgrelid
    JOIN pg_namespace cn ON cn.oid = c.relnamespace
    JOIN pg_proc p       ON p.oid = t.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
   WHERE NOT t.tgisinternal AND cn.nspname = 'public'
),
pol AS (SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public'),
checks (grup, kontrol, ok, ayrinti) AS (
  -- ── 1. Rezervasyon / yetki korumaları (0031) ─────────────────────────────
  SELECT '1-yetki', 'protect_user_privileges SECURITY INVOKER',
         EXISTS (SELECT 1 FROM fn WHERE nspname = 'public' AND proname = 'protect_user_privileges' AND NOT prosecdef),
         'DEFINER kalırsa kullanıcı kendi rolünü/onayını değiştirebilir'
  UNION ALL
  SELECT '1-yetki', 'trg_protect_user_privileges etkin (users)',
         EXISTS (SELECT 1 FROM trg WHERE relname = 'users' AND tgname = 'trg_protect_user_privileges' AND enabled), NULL
  UNION ALL
  SELECT '1-yetki', 'assert_booking_allowed: onay + aktif/yayında/arşivsiz/gelecek kontrolü',
         EXISTS (SELECT 1 FROM fn WHERE nspname = 'public' AND proname = 'assert_booking_allowed' AND prosecdef
                   AND prosrc ILIKE '%approval_status = ''approved''%'
                   AND prosrc ILIKE '%status = ''active''%'
                   AND prosrc ILIKE '%is_published IS TRUE%'
                   AND prosrc ILIKE '%is_archived = false%'
                   AND prosrc ILIKE '%event_date > now()%'), NULL
  UNION ALL
  SELECT '1-yetki', 'assert_booking_allowed istemcilere kapalı (anon/authenticated EXECUTE yok)',
         COALESCE(NOT has_function_privilege('anon', to_regprocedure('public.assert_booking_allowed(uuid,uuid)'), 'EXECUTE')
              AND NOT has_function_privilege('authenticated', to_regprocedure('public.assert_booking_allowed(uuid,uuid)'), 'EXECUTE'), false),
         NULL
  UNION ALL
  SELECT '1-yetki', 'book_event: kilit + assert_booking_allowed çağrısı',
         EXISTS (SELECT 1 FROM fn WHERE nspname = 'public' AND proname = 'book_event' AND prosecdef
                   AND prosrc ILIKE '%FOR UPDATE%' AND prosrc ILIKE '%assert_booking_allowed%'), NULL
  UNION ALL
  SELECT '1-yetki', 'book_event authenticated tarafından çağrılabilir',
         COALESCE(has_function_privilege('authenticated', to_regprocedure('public.book_event(uuid,uuid,integer)'), 'EXECUTE'), false), NULL
  UNION ALL
  SELECT '1-yetki', 'sync_booked_count: iki koltuk dalında assert_booking_allowed',
         COALESCE((SELECT (length(prosrc) - length(replace(prosrc, 'assert_booking_allowed', ''))) / length('assert_booking_allowed') >= 2
                     FROM fn WHERE nspname = 'public' AND proname = 'sync_booked_count'), false), NULL
  UNION ALL
  SELECT '1-yetki', 'trg_sync_booked_count etkin (AFTER INSERT/UPDATE/DELETE)',
         EXISTS (SELECT 1 FROM trg WHERE relname = 'reservations' AND tgname = 'trg_sync_booked_count' AND enabled
                   AND def ILIKE '%AFTER INSERT OR DELETE OR UPDATE%'), NULL
  UNION ALL
  SELECT '1-yetki', 'guard_reservation_reactivation INVOKER + BEFORE UPDATE OF status trigger',
         EXISTS (SELECT 1 FROM fn WHERE nspname = 'public' AND proname = 'guard_reservation_reactivation' AND NOT prosecdef)
         AND EXISTS (SELECT 1 FROM trg WHERE relname = 'reservations' AND tgname = 'trg_guard_reservation_reactivation' AND enabled
                       AND def ILIKE '%BEFORE UPDATE OF status%'), NULL
  UNION ALL
  SELECT '1-yetki', 'trg_protect_reservation_integrity etkin',
         EXISTS (SELECT 1 FROM trg WHERE relname = 'reservations' AND tgname = 'trg_protect_reservation_integrity' AND enabled), NULL
  UNION ALL
  SELECT '1-yetki', 'reservations: admin dışında INSERT/ALL politikası yok',
         NOT EXISTS (SELECT 1 FROM pol WHERE tablename = 'reservations' AND cmd IN ('INSERT', 'ALL')
                       AND policyname <> 'reservations: admin full access'),
         (SELECT string_agg(policyname || ' (' || cmd || ')', ', ' ORDER BY policyname) FROM pol WHERE tablename = 'reservations')
  UNION ALL
  SELECT '1-yetki', 'RLS açık: users, events, reservations, notifications',
         (SELECT count(*) = 4 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname IN ('users', 'events', 'reservations', 'notifications') AND c.relrowsecurity), NULL

  -- ── 2. Yeni yayın bildirimi (0031) ───────────────────────────────────────
  UNION ALL
  SELECT '2-yayin', 'events.new_event_notified_at kolonu',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'new_event_notified_at'), NULL
  UNION ALL
  SELECT '2-yayin', 'trg_mark_event_announced BEFORE INSERT OR UPDATE',
         EXISTS (SELECT 1 FROM trg WHERE relname = 'events' AND tgname = 'trg_mark_event_announced' AND enabled
                   AND def ILIKE '%BEFORE INSERT OR UPDATE ON%'), NULL
  UNION ALL
  SELECT '2-yayin', 'trg_notify_on_new_event AFTER INSERT OR UPDATE + işaret kontrolü',
         EXISTS (SELECT 1 FROM trg WHERE relname = 'events' AND tgname = 'trg_notify_on_new_event' AND enabled
                   AND def ILIKE '%AFTER INSERT OR UPDATE ON%' AND fn_src ILIKE '%new_event_notified_at%'), NULL
  UNION ALL
  SELECT '2-yayin', 'yayında/uygun olup işaretsiz etkinlik yok',
         -- to_jsonb: keeps the query valid (and this row HATA) even if the column is missing
         NOT EXISTS (SELECT 1 FROM public.events e
                      WHERE to_jsonb(e) ->> 'new_event_notified_at' IS NULL AND e.is_published IS TRUE
                        AND e.status = 'active' AND e.is_archived = false AND e.event_date > now()),
         'işaretsiz uygun etkinlik = bildirimi hiç gitmemiş etkinlik'

  -- ── 3. Dış SMS/push kaldırıldı (0032) ────────────────────────────────────
  UNION ALL
  SELECT '3-dis-gonderim', 'push/SMS trigger''ları yok',
         NOT EXISTS (SELECT 1 FROM trg WHERE tgname IN ('trg_send_push_on_notification', 'trg_send_booking_sms_on_reservation')), NULL
  UNION ALL
  SELECT '3-dis-gonderim', 'trigger_send_push_notification / trigger_send_booking_sms fonksiyonları yok',
         NOT EXISTS (SELECT 1 FROM fn WHERE nspname = 'public' AND proname IN ('trigger_send_push_notification', 'trigger_send_booking_sms')), NULL
  UNION ALL
  SELECT '3-dis-gonderim', 'extensions.http_post(text,text,text,text) sarmalayıcısı yok',
         to_regprocedure('extensions.http_post(text,text,text,text)') IS NULL, NULL
  UNION ALL
  SELECT '3-dis-gonderim', 'public tablolarında dış HTTP çağıran trigger yok (panel webhook''ları dahil)',
         NOT EXISTS (SELECT 1 FROM trg WHERE fn_schema = 'supabase_functions'
                        OR fn_src ILIKE '%http_post%' OR fn_src ILIKE '%http_request%' OR fn_src ILIKE '%functions/v1%'),
         (SELECT string_agg(relname || '.' || tgname, ', ') FROM trg WHERE fn_schema = 'supabase_functions'
             OR fn_src ILIKE '%http_post%' OR fn_src ILIKE '%http_request%' OR fn_src ILIKE '%functions/v1%')
  UNION ALL
  SELECT '3-dis-gonderim', 'public fonksiyonlarında http_post / functions/v1 referansı yok',
         NOT EXISTS (SELECT 1 FROM fn WHERE nspname = 'public'
                       AND (prosrc ILIKE '%http_post%' OR prosrc ILIKE '%functions/v1%' OR prosrc ILIKE '%exp.host%')),
         (SELECT string_agg(proname, ', ') FROM fn WHERE nspname = 'public'
             AND (prosrc ILIKE '%http_post%' OR prosrc ILIKE '%functions/v1%' OR prosrc ILIKE '%exp.host%'))

  -- ── 4. Site içi bildirim yapısı korunuyor ────────────────────────────────
  UNION ALL
  SELECT '4-uygulama-ici', 'bildirim trigger''ları etkin (yeni etkinlik, iptal, kapasite, destek yanıtı)',
         (SELECT count(*) = 4 FROM trg WHERE enabled AND (relname, tgname) IN (
            ('events', 'trg_notify_on_new_event'), ('events', 'trg_notify_on_event_cancel'),
            ('events', 'trg_notify_on_capacity_threshold'), ('ticket_messages', 'trg_notify_on_ticket_reply'))), NULL
  UNION ALL
  SELECT '4-uygulama-ici', 'notifications politikaları (select/update/delete own, insert/all admin)',
         (SELECT count(*) = 5 FROM pol WHERE tablename = 'notifications' AND (policyname, cmd) IN (
            ('notifications_select_own', 'SELECT'), ('notifications_update_own', 'UPDATE'),
            ('notifications_delete_own', 'DELETE'), ('notifications_insert_admin', 'INSERT'),
            ('notifications_all_admin', 'ALL'))),
         (SELECT string_agg(policyname || ' (' || cmd || ')', ', ' ORDER BY policyname) FROM pol WHERE tablename = 'notifications')
  UNION ALL
  SELECT '4-uygulama-ici', 'authenticated: notifications SELECT/UPDATE/DELETE yetkisi',
         has_table_privilege('authenticated', 'public.notifications', 'SELECT')
         AND has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
         AND has_table_privilege('authenticated', 'public.notifications', 'DELETE'), NULL
  UNION ALL
  SELECT '4-uygulama-ici', 'Realtime yayını: notifications, support_tickets, ticket_messages',
         (SELECT count(*) = 3 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
             AND tablename IN ('notifications', 'support_tickets', 'ticket_messages')), NULL
)
SELECT grup, kontrol, CASE WHEN ok THEN 'OK' ELSE 'HATA' END AS durum, ayrinti FROM checks
UNION ALL
-- ── 5. Temizlik bilgisi (değer gösterilmez) ──────────────────────────────────
SELECT '5-bilgi', 'users.push_token kolonu (bilerek korunuyor, kullanılmıyor)', 'BİLGİ',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                          AND table_name = 'users' AND column_name = 'push_token') THEN 'var' ELSE 'yok' END
UNION ALL
SELECT '5-bilgi', 'app.supabase_project_ref ayarı', 'BİLGİ',
       CASE WHEN coalesce(current_setting('app.supabase_project_ref', true), '') <> '' THEN 'ayarlı — artık kullanılmıyor' ELSE 'yok' END
UNION ALL
SELECT '5-bilgi', 'app.supabase_service_role_key ayarı', 'BİLGİ',
       CASE WHEN coalesce(current_setting('app.supabase_service_role_key', true), '') <> '' THEN 'ayarlı — gizli anahtar, kaldırılmalı' ELSE 'yok' END
UNION ALL
SELECT '5-bilgi', 'pg_net / http eklentileri', 'BİLGİ',
       coalesce((SELECT string_agg(extname, ', ') FROM pg_extension WHERE extname IN ('pg_net', 'http')), 'kurulu değil')
ORDER BY 1, 2;
