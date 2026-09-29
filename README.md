# L'Ayk — Etkinlik Rezervasyon Platformu

React (Vite) tek sayfa web uygulaması + Supabase (Postgres, Auth, Realtime, Storage).
Kullanıcılar etkinlikleri keşfeder, rezervasyon yapar ve destek talebi açar; yöneticiler kullanıcı onayı,
etkinlik, duyuru ve destek yönetimini `/admin` altında yapar.

> Mobil (Expo) uygulama projeden kaldırıldı; repo yalnızca web uygulamasını içerir.

## Klasör yapısı

```
apps/web/            React 19 + Vite 8 + TypeScript + Tailwind CSS v4 (Vercel'e deploy edilir)
  src/pages/         Rota sayfaları (kullanıcı + admin; admin sayfaları lazy yüklenir)
  src/components/    Ortak bileşenler; admin/ ve profile/ alt klasörleri
  src/hooks/         useToast, useTheme
  src/lib/           Saf yardımcılar (tarih/doluluk gösterimi, kullanıcı adı, görsel işleme)
packages/core/       @layk/core — Supabase istemcisi, AuthProvider/useAuth, cn, format yardımcıları
supabase/migrations/ Numaralı SQL migration'ları (şemanın tek kaynağı)
scripts/             Demo veri ve görsel bakım betikleri — bkz. scripts/README.md
docs/project-audit/  Teslim öncesi inceleme raporları ve bulgu durumları
```

## Gereksinimler

- Node.js 22 LTS veya üzeri (geliştirmede 24 kullanıldı), npm 11 (`packageManager` alanı).
- Bir Supabase projesi (URL + publishable/anon anahtar).

## Kurulum ve geliştirme

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # yoksa aşağıdaki iki değişkenle oluşturun
npm run dev          # yalnızca web (turbo dev --filter=web) → http://localhost:5173
```

## Komutlar

| Komut (kökte) | Açıklama |
| :--- | :--- |
| `npm run dev` | Web geliştirme sunucusu |
| `npm run build` / `npm run build:web` | `tsc -b && vite build` → `apps/web/dist` |
| `npm run lint` | ESLint (web) |
| `npx tsc --noEmit -p packages/core` | Core tip kontrolü |
| `npm run test:db` | Migration testleri: `supabase/tests/` — geçici, yerel gerçek PostgreSQL sunucusunda tüm migration'lar sırayla uygulanır (rezervasyon yetkisi, kapasite yarışı, etkinlik iptali/yeniden açılması, uygulama içi bildirimler, dış gönderim olmaması) |
| `node scripts/refresh-demo-data.test.js`, `node scripts/upload-event-images.test.js` | Betiklerin saf-fonksiyon testleri |

Web ve core için ayrı bir test koşucusu (Jest/Vitest) yoktur. `test:db` ilk çalıştırmada `embedded-postgres`
ikili dosyalarını kullanır (Docker gerekmez); uzak veritabanına bağlanmaz. Supabase'in auth/storage/pg_net parçaları
taklittir; olası dış HTTP çağrıları yalnızca bir tabloya yazılır ve testler bunun boş kaldığını doğrular — ayrıntı: `supabase/tests/db-harness.mjs`.

## Ortam değişkenleri

Değerleri repoya koymayın; `*.local` dosyaları git tarafından yok sayılır.

| Değişken | Nerede | Gizli mi? | Amaç |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Web (build anında gömülür) | Hayır | Supabase proje URL'i |
| `VITE_SUPABASE_ANON_KEY` | Web (build anında gömülür) | Hayır — publishable/anon anahtar, tarayıcı paketinde görünür | Supabase istemci anahtarı; yetki RLS ile sınırlanır |
| `SUPABASE_SERVICE_ROLE_KEY` | Yalnızca yerel betikler (`scripts/`) | **Evet** — RLS'i aşar | Demo veri/görsel bakımı; **asla** `VITE_` önekiyle veya Vercel'e koymayın |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `upload-event-images.js` (alternatif adlar) | URL/anon: hayır | Betik içinde proje bağlantısı |
| `EVENT_IMAGES_DIR` | `upload-event-images.js` | Hayır | Yüklenecek banner görsellerinin yerel klasörü |

**Eksik değişken davranışı:** `vite build`, `VITE_SUPABASE_URL` veya `VITE_SUPABASE_ANON_KEY` yoksa değişken adını
belirten bir hatayla durur (değer loglanmaz). Geliştirme sunucusunda aynı durumda uygulama açılışta açık bir hata fırlatır.
Uygulamada artık sabit kodlanmış yedek proje yoktur.

## Bildirimler

Yalnızca **uygulama içi bildirimler** desteklenir: kayıtlar `public.notifications` tablosuna veritabanı trigger'ları
(yeni etkinlik, etkinlik iptali, kapasite uyarısı, destek yanıtı) ve admin ekranları (duyuru, kullanıcı detayı) tarafından
yazılır; web'deki bildirim zili bunları Supabase Realtime ile günceller. Kullanıcı yalnızca kendi bildirimlerini görür,
okundu işaretler ve siler (RLS). Etkinlik iptali ve yeniden açılması yalnızca gerçek durum geçişinde bildirim üretir
(ayrıntı: aşağıdaki “Etkinlik iptali”). SMS, WhatsApp ve mobil/web push gönderimi **yoktur** — `0032` dış gönderim trigger'larını
kaldırdı; repoda Edge Function yoktur. `users.push_token` kolonu eski veriyi korumak için duruyor, kullanılmıyor.

## Etkinlik iptali

> `0033_event_cancellation_keeps_reservations.sql` ile gelir; **canlıya henüz uygulanmadı** (bkz. migration bölümü).

- Yönetici etkinliği iptal edince rezervasyonlar, bilet sayıları ve doluluk korunur; etkinlik Keşfet'ten kalkar, yeni
  rezervasyon ve kişi sayısı değişikliği kapanır. Kullanıcı yalnızca kendi rezervasyonunu iptal edebilir (yer serbest kalır).
- Rezervasyonlarım'da kayıt “İptal edilen etkinlikler” altında “Etkinlik iptal edildi” olarak görünür. Detay sayfası iptal
  durumunu ve varsa organizatörün iptal açıklamasını (`events.cancellation_note`) gösterir; kullanıcının kendi iptali ayrı
  yazılır. İptal edilmiş etkinliği yalnızca o etkinlikte rezervasyon kaydı olan kullanıcılar görür (kendi iptal ettiği kayıt
  dahil); misafirler ve diğer kullanıcılar göremez, taslak/arşiv görünürlüğü değişmez.
- Bildirimler: iptal bildirimi etkinlik yayında, arşiv dışında ve gelecek tarihliyken iptal edilirse onaylı rezervasyon
  sahiplerine gider. Yeniden açılma bildirimi, bu iptalden sonra etkinlik ilk kez yeniden rezerve edilebilir olduğunda
  (aktif, yayında, arşiv dışında, gelecek tarih) yalnızca rezervasyonu devam edenlere, güncel tarih ve (varsa) mekanla
  gider. Aynı durumun tekrar kaydedilmesi veya düzenleme bildirimi çoğaltmaz; ilk yayın bildirimini alan kullanıcıya
  ayrıca yeniden açılma bildirimi gitmez. Kullanıcının kendi iptal ettiği rezervasyon otomatik geri gelmez.
- Yönetici panelinde iptal ve yeniden etkinleştirme onay ister; yeniden etkinleştirme onayı korunan onaylı rezervasyon
  ve toplam bilet sayısını gösterir.

## Deploy (Vercel)

Kök `vercel.json`: build `npm run build:web`, çıktı `apps/web/dist`, tüm yollar `index.html`'e yönlendirilir
(SPA yenilemede 404 olmaması için; kaldırmayın). `apps/web/vercel.json` aynı rewrite'ı, proje kökü `apps/web`
seçilmişse kullanılmak üzere içerir.

**Vercel'de zorunlu:** Production ve Preview ortamlarında `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` (ikisi de
public değerdir). Eksikse build bilerek başarısız olur. Service-role anahtarı Vercel'e eklenmez.

## Veritabanı migration'ları

- Dosyalar `supabase/migrations/NNNN_aciklama.sql` sırasıyla uygulanır ve şemanın tek kaynağıdır.
- Uygulanmış bir migration değiştirilmez; her değişiklik yeni numaralı bir dosyadır.
- RLS politikaları genellikle `DROP POLICY IF EXISTS` + `CREATE POLICY` ile bütünüyle yeniden tanımlanır.
- **Mevcut canlı proje:** 0001–0032 uygulanmıştır (son olarak 0030–0032, 2026-09-29, SQL Editor). **0033 henüz
  uygulanmadı:** önce SQL Editor'da 0033, ardından web deploy (yeni web sürümü 0033'ün kolonlarını okur). Migration'lar SQL
  Editor ile uygulandığından Supabase CLI'nin migration geçmişi bunları bilmez: bu projede `supabase db push`
  **çalıştırmayın** (eski dosyaları yeniden çalıştırmayı dener). Yeni bir değişiklik yalnızca yeni numaralı dosya olarak
  SQL Editor'da çalıştırılır; CLI'ye geçilecekse önce uygulanmış sürümler `supabase migration repair --status applied`
  ile işaretlenmelidir.
- **Yeni/boş proje:** dosyalar sırayla uygulanır (SQL Editor veya `supabase link` + `supabase db push`).
- `supabase/checks/verify_0031_0032.sql`: SQL Editor'da çalıştırılacak salt okunur doğrulama (0031 + 0032); `HATA` satırı
  olmamalı. `npm run test:db` aynı sorguyu yerel veritabanında da çalıştırır.

## Bilinen açık konular

SEC-001 (rezervasyon yetkisi), BUG-001 (kapanmış etkinliğe rezervasyon) ve BUG-003 (taslak etkinlik bildirimi) `0031` ile
çözüldü; SMS/push `0032` ile kaldırıldı — ikisi de canlıda uygulandı. Kalan maddeler:

- **BUG-002 (kodda çözüldü, canlıda açık):** ürün kararı `0033` ve web değişiklikleriyle uygulandı (bkz. “Etkinlik
  iptali”); 0033 canlıya uygulanıp web yayınlanana kadar canlıda eski davranış sürer.
- **Bundle boyutu (ARCH-002, kısmen):** ana chunk ~556 kB; build 500 kB uyarısı verir, işlevsel engel değildir.
- **Uzak temizlik (yapılmadıysa):** kullanılmayan `send-push` / `send-booking-sms` Edge Function'ları, `TWILIO_*`
  secret'ları ve `app.supabase_service_role_key` / `app.supabase_project_ref` veritabanı ayarları.

Ayrıntı: [docs/project-audit/findings.md](docs/project-audit/findings.md).
