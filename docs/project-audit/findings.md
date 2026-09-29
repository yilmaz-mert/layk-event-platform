# Önceliklendirilmiş Bulgular ve Kanıtlar (findings.md)

Bu dokümanda yer alan tüm bulgular, kod yolları, veritabanı migration'ları ve çalıştırılan araç çıktılarıyla somut olarak kanıtlanmıştır.

---

## Bulgu Özet Tablosu

| ID | Başlık | Önem | Durum | Kategori |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-001** | `book_event` RPC'sinde `approval_status` (Hesap Onayı) Kontrolünün Bulunmaması | **Kritik** | Doğrulandı | Güvenlik / Yetki |
| **BUG-001** | İptal, Arşivlenmiş, Tamamlanmış ve Taslak Etkinliklerin `book_event` ile Rezerve Edilebilmesi | **Yüksek** | Doğrulandı | İş Mantığı |
| **BUG-002** | İptal Edilen Etkinliklerin Kullanıcı Sayfasından Gizlenmesi ve Bildirim Linkinin 404 Vermesi | **Yüksek** | Doğrulandı | RLS / Veri Akışı |
| **BUG-003** | Yeni Etkinlik Bildiriminin Taslak Oluşturulurken Gitmesi ve Yayında Tetiklenmemesi | **Orta** | Doğrulandı | Trigger Mantığı |
| **SEC-002** | `@layk/core` İçinde Sabit Kodlanmış Fallback Supabase Anahtarları | **Orta** | Doğrulandı | Yapılandırma Güvenliği |
| **BUG-004** | `TicketChat` Bileşeninde Kullanıcının Kendi Gönderdiği Mesaja Bildirim Sesi Çalınması | **Düşük** | Doğrulandı | UX / State |
| **BUG-005** | React 19 ve `eslint-plugin-react-hooks` Kuralları Nedeniyle `npm run lint` Başarısızlığı | **Orta** | Doğrulandı | Kod Kalitesi / CI |
| **A11Y-001** | `Switch.tsx` İçinde Butonun `<label>` ile Sarmalanması ve Çift Tetiklenme Riski | **Düşük** | Doğrulandı | A11y / DOM |
| **ARCH-001** | Kullanılmayan ve Rotalanmamış Yetim Sayfalar (`Support.tsx`, `AdminEventManagement.tsx`) | **Orta** | Doğrulandı | Mimari Temizlik |
| **ARCH-002** | Kod Bölme (Code Splitting) Bulunmaması Nedeniyle 632 kB Dev Tekil Bundle | **Orta** | Doğrulandı | Performans |
| **DOC-001** | `CLAUDE.md` Dokümantasyonu ile `ProtectedRoute.tsx` Arasındaki Yetki Çelişkisi | **Düşük** | Doğrulandı | Dokümantasyon |
| **INT-001** | SMS Gönderiminin Yalnızca Bir Taslak (Stub) Olması ve Veritabanı GUC Parametre Bağımlılığı | **Düşük** | Doğrulandı | Entegrasyon |

---

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
