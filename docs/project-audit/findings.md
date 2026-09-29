# Önceliklendirilmiş Bulgular ve Kanıtlar (findings.md)

Bu dokümanda yer alan tüm bulgular, kod yolları, veritabanı migration'ları ve çalıştırılan araç çıktılarıyla somut olarak kanıtlanmıştır.

---

## Bulgu Özet Tablosu

| ID | Başlık | Önem | Durum | Kategori |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-001** | `book_event` RPC'sinde `approval_status` (Hesap Onayı) Kontrolünün Bulunmaması | **Kritik** | **Çözüldü** — `0031`, canlıda uygulandı | Güvenlik / Yetki |
| **BUG-001** | İptal, Arşivlenmiş, Tamamlanmış ve Taslak Etkinliklerin `book_event` ile Rezerve Edilebilmesi | **Yüksek** | **Çözüldü** — `0031`, canlıda uygulandı | İş Mantığı |
| **BUG-002** | İptal Edilen Etkinliklerin Kullanıcı Sayfasından Gizlenmesi ve Bildirim Linkinin 404 Vermesi | **Yüksek** | **Kodda çözüldü** — `0033` + web; canlıya uygulanmadı | RLS / Veri Akışı |
| **BUG-003** | Yeni Etkinlik Bildiriminin Taslak Oluşturulurken Gitmesi ve Yayında Tetiklenmemesi | **Orta** | **Çözüldü** — `0031`, canlıda uygulandı | Trigger Mantığı |
| **SEC-002** | `@layk/core` İçinde Sabit Kodlanmış Fallback Supabase Anahtarları | **Orta** | **Çözüldü** (2026-09-29) | Yapılandırma Güvenliği |
| **BUG-004** | `TicketChat` Bileşeninde Kullanıcının Kendi Gönderdiği Mesaja Bildirim Sesi Çalınması | **Düşük** | **Çözüldü** (2026-09-29) | UX / State |
| **BUG-005** | React 19 ve `eslint-plugin-react-hooks` Kuralları Nedeniyle `npm run lint` Başarısızlığı | **Orta** | **Çözüldü** (lint 0 problem) | Kod Kalitesi / CI |
| **A11Y-001** | `Switch.tsx` İçinde Butonun `<label>` ile Sarmalanması ve Çift Tetiklenme Riski | **Düşük** | Yeniden üretilemedi (Chromium + WebKit); ekran okuyucu doğrulanmadı | A11y / DOM |
| **ARCH-001** | Kullanılmayan ve Rotalanmamış Yetim Sayfalar (`Support.tsx`, `AdminEventManagement.tsx`) | **Orta** | **Çözüldü** (dosyalar silindi) | Mimari Temizlik |
| **ARCH-002** | Kod Bölme (Code Splitting) Bulunmaması Nedeniyle 632 kB Dev Tekil Bundle | **Orta** | Kısmen çözüldü (admin lazy; ana chunk 556 kB) | Performans |
| **DOC-001** | `CLAUDE.md` Dokümantasyonu ile `ProtectedRoute.tsx` Arasındaki Yetki Çelişkisi | **Düşük** | **Çözüldü** (doküman düzeltildi) | Dokümantasyon |
| **INT-001** | SMS Gönderiminin Yalnızca Bir Taslak (Stub) Olması ve Veritabanı GUC Parametre Bağımlılığı | **Düşük** | **Geçersiz** — SMS/push kapsamdan çıkarıldı (`0032`) | Entegrasyon |

---

## Canlı Durum — 2026-09-29 (en güncel)

- `0030`, `0031`, `0032` canlı veritabanında **kullanıcı tarafından** Supabase SQL Editor'da uygulandı, hatasız tamamlandı;
  uygulama canlıda çalışıyor ve kullanıcı kontrolleri tamamlandı. (Asistanın canlı veritabanına doğrudan erişimi olmadı;
  salt okunur doğrulama sorgusu: `supabase/checks/verify_0031_0032.sql`.)
- Aşağıdaki eski bölümlerde "açık" / "uzağa uygulanmadı" yazan SEC-001, BUG-001, BUG-003 notları o anki durumu anlatır;
  üçü de çözüldü. INT-001 geçersiz (SMS/push kaldırıldı).
- **BUG-002 — kodda çözüldü, canlıya uygulanmadı** (aşağıdaki 0033 bölümü). Önceki durum: `notify_on_event_cancel` (0012) "Your reservation has been
  voided" yazar ama rezervasyonlar `confirmed` kalır; `events` kullanıcı politikası (0029) iptal edilen etkinliği gizler,
  `MyBookings` etkinliği gelmeyen satırları eler, bildirim linki etkinliği açamaz. Ürün kararı gerekiyor.
- Diğer açıklar: ARCH-002 kısmen (ana chunk ~556 kB), A11Y-001 ekran okuyucuyla doğrulanmadı.

## Durum Güncellemesi — BUG-002 (0033, canlıya uygulanmadı)

Kök neden: rezervasyonlar zaten korunuyordu; sorun (1) 0012 iptal bildiriminin "Your reservation has been voided"
demesi ve bayat/geçmiş etkinlikte de tetiklenmesi, (2) 0029 `events` politikasının iptal edilen etkinliği rezervasyon
sahibinden de gizlemesi (Rezervasyonlarım satırı düşüyor, bildirim linki açılmıyordu), (3) yeniden açılma bildiriminin
hiç olmamasıydı.

Düzeltme (`0033_event_cancellation_keeps_reservations.sql` + web):
- `events.cancellation_note` (organizatör iptal açıklaması; `closing_comment` tamamlanma notu olarak kaldı) ve
  `events.reopen_notice_pending` (kalıcı geçiş işareti; mevcut iptal edilmiş etkinlikler `true` ile başlatılır).
- Ek SELECT politikası `events: holders view own cancelled` (yalnızca `authenticated`): iptal + yayında + arşiv dışı +
  kullanıcının kendi rezervasyonu (her durumda). Kontrol SECURITY DEFINER `user_has_reservation()` ile — RLS rekürsiyonu yok.
- `trg_track_event_cancellation_notice` (BEFORE UPDATE) geçişleri işaretler; `notify_on_event_cancel` (aynı trigger adı)
  iptal ve yeniden açılma bildirimlerini yazar. İlk yayın bildirimiyle aynı ifadede onaylı kullanıcılara yeniden açılma
  bildirimi gitmez.
- Rezervasyon kuralları değişmedi: 0031 `assert_booking_allowed` iptal edilmiş etkinlikte yeni/yeniden rezervasyonu ve kişi
  sayısı değişikliğini zaten kapatıyor; kullanıcı iptali (yer serbest bırakma) açık.
- Web: detay sayfası iptal durumu + açıklama + yalnızca "Rezervasyonu iptal et"; kullanıcı iptali ayrı metin;
  Rezervasyonlarım'da "İptal edilen etkinlikler" bölümü; admin iptal onayında isteğe bağlı açıklama, yeniden
  etkinleştirme onayında korunan rezervasyon/bilet sayısı; admin detayında iptal açıklaması düzenleme.

Doğrulama: `npm run test:db` 58/58 (PG 18, 17, 15). 0033 olmadan BUG-002'ye özgü 10 test kırmızıydı (rezervasyonları
koruma ve işlemleri kapatma testleri baştan yeşildi — o kısım zaten doğruydu). Web: mock Supabase ile 390 ve 1280 px'de
34 hedefli kontrol (gerçek backend değil). Yayın sırası: önce 0033 (SQL Editor), sonra web deploy.

## Durum Güncellemesi — 2026-09-29 (teslim öncesi temizlik turu)

Aşağıdaki notlar orijinal bulguları silmeden, güncel kod üzerindeki doğrulamayla eklenmiştir. Doğrulamalar yerel build,
lint ve **mock Supabase** ile tarayıcı kontrolleridir; **gerçek backend'e karşı hiçbir şey doğrulanmadı**, uzak veritabanına yazılmadı.

| ID | Yeni durum | Kanıt |
| :--- | :--- | :--- |
| SEC-002 | **Çözüldü** | Kapsam, rapordan geniş çıktı: `process.env[key]` dinamik okuması production build'de hiç değiştirilmiyordu; env ne olursa olsun paket sabit demo projeye bağlanıyordu (farklı URL ile yapılan probe build'de URL pakette yoktu). Artık `packages/core/src/lib/supabase.ts` statik `import.meta.env.VITE_*` okur, yedek proje yoktur; `vite build` değişken eksikse adını belirten hatayla durur (değer loglanmaz). Probe build: verilen URL/anahtar pakette var, eski proje referansı 0. |
| BUG-004 | **Çözüldü** | `TicketChat` Realtime handler'ı yan etkiyi state updater dışına aldı; kendi mesajında ses/"Yeni mesaj" yok (`seenIdsRef` ile tekilleştirme). |
| BUG-005 | **Çözüldü** | `npm run lint`: 0 problem (başlangıç: 16 hata + 1 uyarı). Kurallar susturulmadan düzeltildi: effect içi ilk yükleme `ignore` bayrağıyla `.then`, tekrar yüklemeler olay işleyicilerinde, prop→state eşitlemeleri render sırasında; provider/hook dosyaları ayrıldı (`hooks/useToast`, `hooks/useTheme`). |
| ARCH-001 | **Çözüldü** | `Support.tsx`, `AdminEventManagement.tsx` silindi (rota/import/dinamik import yok). |
| ARCH-002 | **Kısmen çözüldü** | Admin sayfaları `React.lazy` (5–37 kB chunk'lar). Ana chunk 670 → 556 kB (gzip 159 kB); kalan ağırlık React DOM + supabase-js + router, 500 kB uyarısı sürüyor. Eski chunk hatası için en fazla dakikada bir otomatik yenileme + `RouteErrorBoundary` (kalıcı ağ hatasında tam 1 yenileme, sonra hata ekranı — preview build'de doğrulandı). |
| DOC-001 | **Çözüldü (doküman)** | `CLAUDE.md` artık doğruyu söylüyor: `ProtectedRoute` yalnızca oturum + rol kontrol eder; onay girişte (`Login.tsx` onaysız kullanıcıyı çıkarır) ve `useAuth`'ta (rejected → çıkış) uygulanır. Oturum açıkken `pending`'e alınan kullanıcı kullanıcı rotalarına erişmeye devam eder — SEC-001 ile birlikte ele alınmalı. |
| A11Y-001 | **Yeniden üretilemedi / kısmen doğrulandı** | HTML `label` öğesinin `button` ile ilişkilendirilmesine izin verir; bu tek başına kanıt sayılmadı. Chromium ve WebKit'te: switch `role=switch` ve etiket metniyle erişilebilir isim alıyor; etikete tıklama, düğmeye tıklama, Space ve Enter her biri **tam bir kez** değiştiriyor. Ekran okuyucu (VoiceOver/NVDA) ile çift duyuru kontrol edilmedi. |
| SEC-001 | **Açık — sonraki öncelikli görev** | `0015_admin_overrides_notif_delete.sql` `book_event`: yalnızca `auth.uid()` ve `capacity, booked_count, max_tickets_per_user` okunuyor; `approval_status` kontrolü yok. **Ek yol:** kullanıcıların `reservations` üzerinde UPDATE politikası var (`0003`); `cancelled → confirmed` veya bilet artırma yalnızca `sync_booked_count` (kapasite + kişi başı sınır) ve `protect_reservation_integrity` (event/user değişimi) ile korunuyor — onay kontrolü yok. INSERT politikası yok, yani yeni rezervasyon yalnızca `book_event` ile. |
| BUG-001 | **Açık — sonraki öncelikli görev** | Aynı fonksiyonda etkinlik `status`, `is_published`, `is_archived`, `event_date` kontrol edilmiyor; aynı ek UPDATE yolu (iptal edilmiş/geçmiş etkinlikte rezervasyonu yeniden onaylama) geçerli. |
| BUG-003 | **Açık — sonraki öncelikli görev** | `0012_notification_system.sql`: `trg_notify_on_new_event` `AFTER INSERT` ve `is_published`'e bakmıyor; sonraki migration'larda yeniden tanımlanmamış. |
| BUG-002, INT-001 | Değişmedi | Ürün kararı / entegrasyon kapsamı; bu turda dokunulmadı. |

**Ek notlar**
- Git geçmişinde izlenmiş tek env dosyası `apps/mobile/.env`: içinde yalnızca proje URL'i ve **publishable** (`sb_publishable_`) anahtar var. Geçmişte `sb_secret_` veya service-role JWT bulunmadı → gizli yönetici anahtarı sızıntısı değil (publishable anahtar zaten tarayıcı paketinde yer alır).
- `scripts/` önceden `.gitignore` ile tümüyle gizleniyor ve hiç izlenmiyordu; artık yalnızca `scripts/backups/` yok sayılıyor. Dosya sınıflandırması: [../../scripts/README.md](../../scripts/README.md). Betiklerdeki sabit proje URL/anahtar yedekleri ve kişisel yerel yol kaldırıldı.

### Sonraki görev için en küçük düzeltme kapsamı (henüz uygulanmadı)
Yeni bir migration (ör. `0031_booking_guards.sql`), uygulanmış dosyalar değiştirilmeden:
1. `book_event` yeniden tanımı: admin değilse `users.approval_status = 'approved'` şartı (SEC-001) ve etkinlik için
   `status = 'active' AND is_published AND NOT is_archived AND event_date > now()` şartı (BUG-001); mevcut kilit (`FOR UPDATE`) sırası korunur.
2. `sync_booked_count` içindeki `cancelled → confirmed` ve bilet artırma dallarına (admin değilse) aynı iki şart — ya da kullanıcı UPDATE politikasını yalnızca `status → cancelled` ve bilet azaltma ile sınırlamak. Hangisinin seçileceği ürün kararıdır (kullanıcının kendi rezervasyonunu yeniden etkinleştirmesi isteniyor mu?).
3. `trg_notify_on_new_event`: `AFTER INSERT OR UPDATE OF is_published` + koşul `NEW.is_published AND NEW.status = 'active' AND NOT NEW.is_archived AND (TG_OP = 'INSERT' OR NOT OLD.is_published)` (BUG-003).
Doğrulama: yerel/geçici bir Postgres'te pending kullanıcı, iptal/geçmiş/taslak/arşiv etkinlik ve yayına alma senaryoları; ardından web akışlarının hata mesajlarını göstermesi.

---

## Durum Güncellemesi — 2026-09-29 (SEC-001 / BUG-001 / BUG-003 düzeltmesi)

Düzeltme: `supabase/migrations/0031_booking_guards_and_publish_notification.sql` (**uzak veritabanına uygulanmadı**).
Doğrulama: `npm run test:db` — geçici yerel **gerçek PostgreSQL 18** sunucusunda 0001–0031 sırayla uygulanır; 33 test.
Düzeltmeden önce 18 test kırmızıydı (hata belirtisini doğrudan yakalıyor), sonra 33/33 yeşil (3 ardışık koşu).

| ID | Yeni durum | Kök neden → düzeltme |
| :--- | :--- | :--- |
| SEC-001 | **Kodda çözüldü** | `book_event` onayı kontrol etmiyordu; ek olarak kullanıcılar `reservations` UPDATE politikasıyla iptali geri alıp bilet artırabiliyordu. Artık onay + etkinlik durumu tek yardımcıda (`assert_booking_allowed`) ve hem `book_event`'te hem `sync_booked_count`'un koltuk talep eden dallarında (etkinlik satırı kilitliyken) kontrol ediliyor. Doğrudan `cancelled → confirmed` normal kullanıcıya kapalı (yeniden alma yalnızca `book_event` ile). |
| SEC-001 (ek, kritik) | **Kodda çözüldü** | Denetimde yoktu: `protect_user_privileges` (0011) SECURITY DEFINER olduğu için içindeki `current_user IN ('postgres', …)` her zaman doğruydu; her oturum açmış kullanıcı kendi satırında `role = 'admin'`, `approval_status = 'approved'` yapabiliyordu (gerçek Postgres'te yeniden üretildi). Fonksiyon SECURITY INVOKER yapıldı. |
| BUG-001 | **Kodda çözüldü** | Rezervasyon ve bilet değişikliği yalnızca `status = 'active' AND is_published AND NOT is_archived AND event_date > now()` iken. |
| BUG-003 | **Kodda çözüldü** | Yeni kolon `events.new_event_notified_at` kalıcı işaret; bildirim etkinlik ilk kez yayında + aktif + arşivsiz + gelecekte olduğunda bir kez gider (yayında oluşturma veya taslaktan ilk yayın). Mevcut satırlar "bildirildi" işaretlendi (eski trigger zaten oluşturmada bildirmişti) — bu yüzden migration öncesinden kalan bir taslak sonradan yayına alınırsa yeniden bildirim gitmez. |

Korunan admin istisnaları (0015 ile aynı): admin başka kullanıcı adına, kapasite/limit üstünde ve kapalı etkinliğe
rezervasyon yapabilir, doğrudan bilet değiştirebilir, iptal edip yeniden etkinleştirebilir. Etkinlik iptalinde mevcut
rezervasyonlar (BUG-002) bu düzeltmenin kapsamı dışında.

Test sınırları: Supabase platformu taklit — `auth.uid()` PostgREST'in `request.jwt.claim(s)` ayarlarından okunur
(JWT imzası/GoTrue yok); PostgREST çalışmaz, istek başına işlem + `SET LOCAL ROLE authenticated` elle yapılır;
pg_net/http uzantıları yok, `net.http_post` yalnızca tabloya yazar. Roller, RLS, trigger'lar, kilitler ve eşzamanlı
bağlantılar gerçektir. Sürüm farkı: testler PG 18, Supabase projesi büyük olasılıkla PG 15/17.

Yan gözlem: `app.supabase_project_ref` tanımlı değilse `trigger_send_booking_sms` URL'i NULL oluyor ve 0024'teki
`extensions.http_post` Expo push adresine gönderiyordu — kapsam değişikliğiyle zincirin tamamı 0032'de kaldırıldı.

## Durum Güncellemesi — 2026-09-29 (kapsam: yalnızca uygulama içi bildirim)

SMS, WhatsApp ve mobil push kapsamdan çıkarıldı. `0032_disable_external_push_and_sms.sql` (uzağa **uygulanmadı**)
`trg_send_push_on_notification`, `trg_send_booking_sms_on_reservation`, ilgili iki fonksiyonu ve projeye ait
`extensions.http_post(text, text, text, text)` sarmalayıcısını (anon/authenticated'a açık bir dış HTTP kapısıydı) kaldırır.
Korunanlar: `notifications` tablosu + RLS, Realtime yayını, yeni etkinlik / iptal / kapasite / destek yanıtı trigger'ları,
admin doğrudan bildirim ekleme, `users.push_token` (veri kaybı olmasın diye). `supabase/functions/` kaynakları silindi.
Doğrulama: `npm run test:db` 41/41 (PG 18, 17, 15); 0032 çıkarılınca 3 test kırmızı. **INT-001 geçersiz** (özellik kaldırıldı).
Bu klasördeki diğer raporlar (database-map, feature-map, mobile-removal, verification-plan) o tarihteki durumu anlatır.

## Ayrıntılı Bulgular

### SEC-001: `book_event` RPC'sinde `approval_status` Kontrolü Bulunmuyor
- **Önem:** Kritik
- **Durum:** Doğrulandı
- **Konum:** [`0015_admin_overrides_notif_delete.sql:12-100`](file:///C:/Users/Mert/event-reservation-app/supabase/migrations/0015_admin_overrides_notif_delete.sql#L12-L100) (`public.book_event`), [`EventDetails.tsx:393, 649`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/pages/EventDetails.tsx#L393)
- **Tetikleyici Senaryo:** Hesabı henüz yönetici tarafından onaylanmamış (`approval_status = 'pending'`) veya başvurusu reddedilmiş (`approval_status = 'rejected'`) bir kullanıcı, doğrudan tarayıcı konsolundan veya REST API üzerinden `supabase.rpc('book_event', { p_user_uuid, p_event_uuid, p_requested_seats: 1 })` çağrısı yapar.
- **Beklenen Davranış:** Backend'in hesabı onaylanmamış kullanıcının rezervasyon yapmasını engellemesi ve yetki hatası döndürmesi.
- **Mevcut Davranış:** UI katmanında buton gizlenip "Hesabınız yönetici onayı bekliyor" yazmaktadır; ancak `book_event` RPC'si `SECURITY DEFINER` yetkisiyle çalışır ve sadece `auth.uid() = p_user_uuid` kontrolü yapar. Kullanıcının `approval_status` değerini veritabanında sorgulamaz. Çağrı başarılı olur ve rezervasyon oluşturulur.
- **Etki:** Kural yalnızca arayüze emanet edilmiştir; onaylanmamış veya yasaklanmış kullanıcılar kontenjan tüketebilir.
- **En Küçük Çözüm:** `0015` migration'ındaki `book_event` içine non-admin kontrolü eklemek:
  ```sql
  IF NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = p_user_uuid AND approval_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Hesabınız henüz onaylanmamış.' USING ERRCODE = '42501';
    END IF;
  END IF;
  ```
- **Doğrulama Yolu:** `approval_status = 'pending'` olan bir test kullanıcısıyla `supabase.rpc('book_event', ...)` çağrılıp işlemin hata ile reddedildiği test edilmelidir.

---

### BUG-001: İptal, Arşivlenmiş, Tamamlanmış ve Taslak Etkinliklerin Rezerve Edilebilmesi
- **Önem:** Yüksek
- **Durum:** Doğrulandı
- **Konum:** [`0015_admin_overrides_notif_delete.sql:42-51`](file:///C:/Users/Mert/event-reservation-app/supabase/migrations/0015_admin_overrides_notif_delete.sql#L42-L51)
- **Tetikleyici Senaryo:** Yönetici tarafından durumu `cancelled`, `completed` yapılmış, arşivlenmiş (`is_archived = true`) veya henüz taslak aşamasında olan (`is_published = false`) bir etkinliğin ID'sine sahip bir kullanıcı `book_event` çağırır.
- **Beklenen Davranış:** Rezerve edilmek istenen etkinliğin `status = 'active'`, `is_published = true`, `is_archived = false` ve `event_date > now()` koşullarına uyup uymadığının denetlenmesi.
- **Mevcut Davranış:** `book_event` yalnızca `capacity, booked_count, max_tickets_per_user` alanlarını çeker. Etkinliğin durumunu (`status`), yayın (`is_published`), arşiv (`is_archived`) ve geçmiş tarihini kontrol etmez. Rezerve işlemi gerçekleşir.
- **Etki:** Kullanıcılar iptal edilen veya geçmiş etkinliklere bilet alabilir, sayacı artırabilir.
- **En Küçük Çözüm:** `book_event` içine şu kontroller eklenmelidir:
  ```sql
  SELECT capacity, booked_count, max_tickets_per_user, status, is_published, is_archived, event_date
    INTO v_capacity, v_booked, v_max_per_user, v_status, v_published, v_archived, v_event_date
    FROM public.events WHERE id = p_event_uuid FOR UPDATE;

  IF NOT v_is_admin THEN
    IF v_status <> 'active' OR NOT v_published OR v_archived THEN
      RAISE EXCEPTION 'Bu etkinlik şu anda rezervasyona açık değildir.';
    END IF;
    IF v_event_date <= now() THEN
      RAISE EXCEPTION 'Geçmiş etkinliklere rezervasyon yapılamaz.';
    END IF;
  END IF;
  ```
- **Doğrulama Yolu:** `status = 'cancelled'` olan bir etkinliğe rezervasyon denenmeli ve exception fırlattığı doğrulanmalıdır.

---

### BUG-002: İptal Edilen Etkinliklerin "Rezervasyonlarım" Listesinden Kaybolması ve Bildirim Linkinin Bozulması
- **Önem:** Yüksek
- **Durum:** Doğrulandı
- **Konum:** [`0029_event_soft_delete_and_status.sql:14-21`](file:///C:/Users/Mert/event-reservation-app/supabase/migrations/0029_event_soft_delete_and_status.sql#L14-L21), [`0012_notification_system.sql:67-76`](file:///C:/Users/Mert/event-reservation-app/supabase/migrations/0012_notification_system.sql#L67-L76), [`MyBookings.tsx:59, 103`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/pages/MyBookings.tsx#L59)
- **Tetikleyici Senaryo:** Yönetici bir etkinliğin durumunu `cancelled` yapar. `trg_notify_on_event_cancel` trigger'ı kullanıcılara "Event Cancelled" başlıklı bildirim yollar (`link_url: /events/:id`). Kullanıcı bildirim linkine tıklar veya `/my-bookings` sayfasına gider.
- **Beklenen Davranış:** Kullanıcının iptal edilen etkinliğini "Etkinlik iptal edildi" etiketiyle görebilmesi, bildirim linkine tıkladığında etkinliğin iptal detaylarını okuyabilmesi.
- **Mevcut Davranış:** 
  1. `0029` migration'ındaki RLS politikası: `USING (status = ANY (ARRAY['active', 'completed']) AND is_published = true AND is_archived = false)`.
  2. Etkinlik `cancelled` olduğu an normal kullanıcılar `public.events` tablosunda o satırı okuyamaz (`SELECT` boş döner).
  3. `MyBookings.tsx` içinde `const event = reservation.events; if (!event) return null;` satırı çalıştığı için etkinlik listeden sessizce tamamen silinir!
  4. Bildirimdeki linke (`/events/:id`) tıklandığında `EventDetails.tsx` etkinliği çekemez ve ekranda jenerik `Etkinlik bulunamadı.` hatası çıkar.
  5. Ayrıca trigger `reservations` tablosundaki `status` alanını güncellemez, kullanıcı veritabanında hala `confirmed` kalır.
- **Etki:** Kullanıcı rezerve ettiği bir etkinlik iptal edildiğinde hem rezervasyonunun kaybolduğunu görür hem de bildirim linkinde 404 benzeri hatayla karşılaşır.
- **En Küçük Çözüm:** 
  - `public.events` RLS politikasını kullanıcının rezervasyonu olan iptal edilmiş etkinlikleri de görebileceği şekilde güncellemek (veya `status IN ('active', 'completed', 'cancelled')`).
  - `trg_notify_on_event_cancel` fonksiyonunda `UPDATE public.reservations SET status = 'cancelled' WHERE event_id = NEW.id AND status = 'confirmed'` çalıştırmak.
- **Doğrulama Yolu:** Bir etkinliği iptal edip rezervasyonlu kullanıcının `/my-bookings` ve `/events/:id` sayfalarında kartı "Etkinlik iptal edildi" şeklinde gördüğü doğrulanmalıdır.

---

### BUG-003: Yeni Etkinlik Bildiriminin Taslak Oluşturulurken Gitmesi ve Yayında Tetiklenmemesi
- **Önem:** Orta
- **Durum:** Doğrulandı
- **Konum:** [`0012_notification_system.sql:88-114`](file:///C:/Users/Mert/event-reservation-app/supabase/migrations/0012_notification_system.sql#L88-L114) (`trg_notify_on_new_event`)
- **Tetikleyici Senaryo:** Yönetici `/admin/events` sayfasında "Yayında" anahtarını kapatarak bir taslak etkinlik kaydeder (`is_published: false`).
- **Beklenen Davranış:** Bildirimin taslak aşamasında değil, etkinlik gerçek anlamda yayına alındığında (`is_published` true olduğunda) kullanıcılara gitmesi.
- **Mevcut Davranış:** `trg_notify_on_new_event` trigger'ı `AFTER INSERT ON public.events` olarak çalışır ve `is_published` durumuna bakmaz. Taslak kaydedildiği an tüm onaylı kullanıcılara "A new event ... is now available!" bildirimi atılır. Kullanıcılar bildirime tıkladığında RLS taslak etkinliği gizlediği için "Etkinlik bulunamadı" hatasıyla karşılaşır. Yönetici daha sonra etkinliği yayına aldığında (`UPDATE`) ise hiçbir trigger çalışmaz.
- **Etki:** Kullanıcılara bozuk link içeren spam bildirimler gider; gerçek yayınlanma anında ise kimseye haber verilmez.
- **En Küçük Çözüm:** Trigger'ı `AFTER INSERT OR UPDATE OF is_published ON public.events` olarak yeniden tanımlamak ve `WHEN (NEW.is_published = true AND (TG_OP = 'INSERT' OR OLD.is_published = false) AND NEW.status = 'active' AND NOT NEW.is_archived)` koşulunu eklemek.
- **Doğrulama Yolu:** `is_published: false` ile etkinlik oluşturulup bildirim tablosuna satır eklenmediği; ardından `is_published: true` yapıldığında bildirim satırlarının eklendiği doğrulanmalıdır.

---

### SEC-002: `@layk/core` İçinde Sabit Kodlanmış Fallback Supabase Anahtarları
- **Önem:** Orta
- **Durum:** Doğrulandı
- **Konum:** [`packages/core/src/lib/supabase.ts:31-32`](file:///C:/Users/Mert/event-reservation-app/packages/core/src/lib/supabase.ts#L31-L32)
- **Tetikleyici Senaryo:** Ortam değişkenlerinin (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) `.env` dosyasında eksik veya tanımsız olması durumu.
- **Beklenen Davranış:** İstemcinin ortam değişkenleri eksikse açıkça hata fırlatması ve güvenli biçimde durması.
- **Mevcut Davranış:** Kod içine geliştirme ortamından kalma gerçek bir canlı Supabase URL'i ve publishable anon key sabit (hardcoded) olarak yazılmıştır:
  ```typescript
  export const supabaseUrl = resolvedSupabaseUrl || 'https://<REDACTED_PROJECT_ID>.supabase.co';
  export const supabaseAnonKey = resolvedSupabaseAnonKey || '<REDACTED_ANON_KEY>';
  ```
- **Etki:** Farklı bir ortama (örneğin müşteri test/canlı ortamına) deploy edildiğinde env değişkenleri bağlanamazsa, uygulama sessizce geliştirici/demo veritabanına bağlanma riski taşır.
- **En Küçük Çözüm:** Sabit kodlanmış fallback anahtarları kaldırmak, değişkenler eksikse hata üretmek.
- **Doğrulama Yolu:** `.env.local` dosyası geçici olarak yeniden adlandırılıp build/çalışma anında güvenli bir hata mesajı alındığı gözlemlenmelidir.

---

### BUG-004: `TicketChat` Bileşeninde Kullanıcının Kendi Gönderdiği Mesaja Bildirim Sesi Çalınması
- **Önem:** Düşük / UX
- **Durum:** Doğrulandı
- **Konum:** [`TicketChat.tsx:84-90`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/components/TicketChat.tsx#L84-L90)
- **Tetikleyici Senaryo:** Kullanıcı veya yönetici destek sohbet penceresinde bir mesaj yazıp gönderir.
- **Beklenen Davranış:** Yalnızca karşı taraftan gelen yeni mesajlarda sesli bildirim çalması.
- **Mevcut Davranış:** Realtime kanalından dönen `INSERT` payload'ı `setMessages` hook'una düşer. Kodda `msg.sender_id === currentUserId` kontrolü yapılmadan `new Audio('/notification.mp3').play()` çağrılmaktadır. Kullanıcı kendi yazdığı mesaja bildirim sesi duymaktadır. Ayrıca side effect doğrudan React setState updater'ı içerisine konulmuştur.
- **Etki:** Rahatsız edici kullanıcı deneyimi ve React 19 yan etki kuralı ihlali.
- **En Küçük Çözüm:** Mesaj gönderen kontrolü eklemek: `if (msg.sender_id !== currentUserId) { new Audio(...).play().catch(() => {}); }`.
- **Doğrulama Yolu:** Destek penceresinde mesaj atılarak kendi mesajında ses çalmadığı, karşı taraftan gelen mesajda ses çaldığı gözlemlenmelidir.

---

### BUG-005: React 19 ve `eslint-plugin-react-hooks` Kuralları Nedeniyle `npm run lint` Başarısızlığı
- **Önem:** Orta
- **Durum:** Doğrulandı (Komut çıktısı mevcut)
- **Konum:** [`EventDetails.tsx:281`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/pages/EventDetails.tsx#L281), [`MyBookings.tsx:126`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/pages/MyBookings.tsx#L126), [`Support.tsx:32`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/pages/Support.tsx#L32), [`UserProfile.tsx:190, 198`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/pages/UserProfile.tsx#L190)
- **Tetikleyici Senaryo:** Kök dizinde veya `apps/web` içinde `npm run lint` komutunun çalıştırılması.
- **Mevcut Davranış:** Komut `code 1` ile çökmekte ve 20 problem (19 error, 1 warning) raporlamaktadır. Hataların tamamı `useEffect` içinde senkron `setState` çağırmaktan (`react-hooks/set-state-in-effect`) ve deklarasyondan önce fonksiyona erişmekten kaynaklanmaktadır.
- **Etki:** CI/CD süreçlerinin kırılması, kontrolsüz re-render riskleri.
- **En Küçük Çözüm:** İlgili state eşitlemelerini event handler'lara taşımak veya render anında türetmek (`useMemo`).
- **Doğrulama Yolu:** `npm run lint` komutunun 0 hata ile tamamlanması.

---

### A11Y-001: `Switch.tsx` İçinde Butonun `<label>` ile Sarmalanması
- **Önem:** Düşük
- **Durum:** Doğrulandı
- **Konum:** [`Switch.tsx:13-35`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/components/Switch.tsx#L13-L35)
- **Tetikleyici Senaryo:** Kullanıcının gizli hesap veya yayın anahtarına tıklaması.
- **Mevcut Davranış:** `<label htmlFor={id}>` etiketi doğrudan `<button id={id} role="switch">` elemanını sarmalamaktadır. HTML standardına göre `<label>` yalnızca form girdileri (`input`, `select`) ile ilişkilendirilebilir. Buton ile kullanıldığında bazı tarayıcılarda çift `click` tetiklenmesi veya ekran okuyucularda çift duyuru riski oluşur.
- **En Küçük Çözüm:** Sarmalayıcı `<label>` yerine `<div>` veya `<span>` kullanmak ve butonda `aria-label` veya `aria-labelledby` tanımlamak.
- **Doğrulama Yolu:** Erişilebilirlik ağacında (Accessibility Inspector) switch kontrolünün tek odak ve duyuruyla çalıştığı doğrulanmalıdır.

---

### ARCH-001: Kullanılmayan ve Rotalanmamış Yetim Sayfalar
- **Önem:** Orta
- **Durum:** Doğrulandı
- **Konum:** [`apps/web/src/pages/Support.tsx`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/pages/Support.tsx) (211 satır), [`apps/web/src/pages/AdminEventManagement.tsx`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/pages/AdminEventManagement.tsx) (11 satır)
- **Kanıt:** `apps/web/src/App.tsx` router yapılandırmasında ve diğer hiçbir kaynak dosyada bu sayfaların import'u bulunmamaktadır. Destek özelliği `UserProfile.tsx?tab=support` içine taşınmış, ancak eski bağımsız sayfa silinmeden projede unutulmuştur.
- **Etki:** Proje boyutunun gereksiz şişmesi, bakım maliyeti ve kod arayan geliştiricilerin yanlış dosyayı referans alma riski.
- **Çözüm Yönü:** Bu dosyalar güvenli silme adayı olarak [cleanup-candidates.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/cleanup-candidates.md) listesine alınmıştır.

---

### ARCH-002: Kod Bölme (Code Splitting) Bulunmaması ve 632 kB Tekil Bundle
- **Önem:** Orta
- **Durum:** Doğrulandı (Build çıktısı mevcut)
- **Konum:** [`apps/web/src/App.tsx:1-18`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/App.tsx#L1-L18)
- **Kanıt:** `npm run build` sonucunda Vite şu uyarıyı üretmektedir:
  ```
  dist/assets/index-BBVrYtrp.js 632.37 kB │ gzip: 172.11 kB
  (!) Some chunks are larger than 500 kB after minification.
  ```
  `App.tsx` dosyasında tüm sayfalar (`AdminDashboard`, `AdminEvents`, `AdminTickets`, `AdminBroadcast`) senkron olarak statik import edilmiştir.
- **Etki:** Yalnızca etkinlik listesine bakmak isteyen normal bir son kullanıcı, 1439 satırlık admin panelini, CSV dışa aktarıcısını ve admin sohbet kodlarını ilk açılışta indirmek zorunda kalır (Core Web Vitals / LCP kaybı).
- **Çözüm Yönü:** `React.lazy()` ve `<Suspense>` ile rota bazlı kod bölme uygulanmalıdır.

---

### DOC-001: `CLAUDE.md` Dokümantasyonu ile `ProtectedRoute.tsx` Arasındaki Yetki Çelişkisi
- **Önem:** Düşük
- **Durum:** Doğrulandı
- **Konum:** [`CLAUDE.md:87`](file:///C:/Users/Mert/event-reservation-app/CLAUDE.md#L87), [`ProtectedRoute.tsx:19-27`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/components/ProtectedRoute.tsx#L19-L27)
- **Kanıt:** `CLAUDE.md` dosyasında şu iddia yer almaktadır:
  > *"`ProtectedRoute`/`PublicRoute` (`apps/web/src/components/`) read `useAuth()` from `@layk/core` and redirect based on `session`/`profile.role`/`profile.approval_status`."*
  Ancak `ProtectedRoute.tsx` kodu incelendiğinde `profile.approval_status` kontrolü **kesinlikle bulunmamaktadır**. Yalnızca `profile.role !== allowedRole` kontrolü yapılmaktadır.
- **Çözüm Yönü:** Ya `ProtectedRoute.tsx` içine onay kontrolü eklenmeli (önerilen) ya da doküman güncellenmelidir.

---

### INT-001: SMS Gönderiminin Yalnızca Bir Taslak (Stub) Olması
- **Önem:** Düşük
- **Durum:** Doğrulandı
- **Konum:** [`supabase/functions/send-booking-sms/index.ts:80-93`](file:///C:/Users/Mert/event-reservation-app/supabase/functions/send-booking-sms/index.ts#L80-L93)
- **Kanıt:** Edge Function kodunda:
  ```typescript
  console.log('[send-booking-sms] Would send SMS/WhatsApp:', { ... provider: 'twilio (stub - not yet configured)' });
  if (!TWILIO_ACCOUNT_SID ...) return new Response(JSON.stringify({ ok: true, stub: true }));
  ```
  Ayrıca trigger `app.supabase_project_ref` ve `app.supabase_service_role_key` GUC parametrelerinin PostgreSQL veritabanında ayarlanmış olmasını beklemektedir.
- **Etki:** Müşteriye SMS çalıştığı söylenirse yanlış beklenti oluşur. Gerçek bir SMS/WhatsApp sağlayıcısı bağlanmadığı sürece bu fonksiyon sadece veritabanı logu üretmektedir.
