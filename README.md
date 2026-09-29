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
| `npm run test:db` | Migration testleri: `supabase/tests/` — geçici, yerel gerçek PostgreSQL sunucusunda tüm migration'lar sırayla uygulanır (rezervasyon yetkisi, kapasite yarışı, uygulama içi bildirimler, dış gönderim olmaması) |
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
okundu işaretler ve siler (RLS). SMS, WhatsApp ve mobil/web push gönderimi **yoktur** — `0032` dış gönderim trigger'larını
kaldırdı; Edge Function yoktur. `users.push_token` kolonu eski veriyi korumak için duruyor, kullanılmıyor.

## Deploy (Vercel)

Kök `vercel.json`: build `npm run build:web`, çıktı `apps/web/dist`, tüm yollar `index.html`'e yönlendirilir
(SPA yenilemede 404 olmaması için; kaldırmayın). `apps/web/vercel.json` aynı rewrite'ı, proje kökü `apps/web`
seçilmişse kullanılmak üzere içerir.

**Vercel'de zorunlu:** Production ve Preview ortamlarında `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY`.
Önceki sürüm bu değişkenleri production build'de fiilen okumuyordu (sabit demo projeye bağlanıyordu); bu yüzden Vercel'de
tanımlı oldukları varsayılmamalıdır — ilk deploy'dan önce proje ayarlarından kontrol edin, yoksa build bilerek başarısız olur.
Service-role anahtarı Vercel'e eklenmez.

## Veritabanı migration'ları

- Dosyalar `supabase/migrations/NNNN_aciklama.sql` sırasıyla uygulanır ve şemanın tek kaynağıdır.
- Uygulanmış bir migration değiştirilmez; her değişiklik yeni numaralı bir dosyadır.
- RLS politikaları genellikle `DROP POLICY IF EXISTS` + `CREATE POLICY` ile bütünüyle yeniden tanımlanır.
- Uygulama: gözden geçirdikten sonra Supabase CLI (`supabase link`, `supabase db push`) veya panelin SQL Editor'ü.
  Hangi migration'ların uzak veritabanında uygulandığı bu repodan doğrulanamaz; deploy öncesi panelden kontrol edin.
- `supabase/checks/verify_0031_0032.sql`: SQL Editor'da çalıştırılacak salt okunur doğrulama (0031 + 0032); `HATA` satırı
  olmamalı. `npm run test:db` aynı sorguyu yerel veritabanında da çalıştırır.

## Bilinen açık konular

SEC-001 (rezervasyon yetkisi), BUG-001 (kapanmış etkinliğe rezervasyon) ve BUG-003 (taslak etkinlik bildirimi)
`0031_booking_guards_and_publish_notification.sql` ile düzeltildi; migration uzak veritabanına uygulanana kadar canlıda
açık sayılmalıdır. İptal akışı (BUG-002) açıktır. Ayrıntı: `docs/project-audit/findings.md` (yerel, git'te yok sayılır).
