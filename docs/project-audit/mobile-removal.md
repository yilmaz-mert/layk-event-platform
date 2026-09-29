# Mobil Uygulamanın Kaldırılması Etki ve Bağlantı Kılavuzu (mobile-removal.md)

> **Durum — Tamamlandı (2026-09-29).** Yapılanlar: `apps/mobile` (izlenen 39 dosya + yerel `android/`, `.env.local`, `node_modules`),
> kök `app.json`, `.expo/`, kök `tsconfig.json` (yalnızca `expo/tsconfig.base` genişletiyordu), `.npmrc` (`legacy-peer-deps` artık gereksiz;
> kurulum peer çakışmasız), kök `expo` devDependency'si ve `react-native` override'ı kaldırıldı; `react` sabitlemesi sürüm kaymasını önlemek için korundu.
> `dev` betiği yalnızca web'i başlatır. Lockfile 481 → 128 kB; web paketlerinde sürüm değişikliği yok. `@layk/core` korundu; Hermes kaynaklı
> `resolveEnv`/`process.env` yolu ve `createSupabaseClient` (yalnızca mobil kullanıyordu) kaldırıldı, env okuması `import.meta.env`'e geçti (bkz. SEC-002).
> Vite `define` bloğu kaldırıldı.
>
> **Bilinçli olarak dokunulmayanlar (yalnızca listelendi):** Edge Function `send-push` (Expo Push API), `users.push_token` kolonu (0021),
> `trg_send_push_on_notification` trigger'ı (0022–0024) ve `extensions.http_post` içindeki Expo URL fallback'i. Web'de push yok; bu trigger her
> bildirimde boşuna webhook çağırıyor olabilir — kaldırmak/pasifleştirmek yeni bir migration ve uzak ortam kararı gerektirir. Uzak kaynaklar silinmedi.

`apps/mobile` uygulaması ileride projeden tamamen çıkarılacaktır. Bu doküman, mobil uygulamanın kaldırılmasının kök dizin, build ardışık düzeni (pipeline), ortak paketler (`@layk/core`), veritabanı trigger'ları ve Edge Functions üzerindeki tüm bağlantılarını haritalar.

> [!IMPORTANT]
> **Ortak Kodun Korunması İlkesi:** Mobil kullanıyor diye web uygulamasının ihtiyaç duyduğu hiçbir ortak kod silinebilir sayılamaz. Web uygulaması `@layk/core` paketini (Auth, Supabase client, tarih/fiyat formatlayıcıları ve `cn` yardımcılarını) yoğun şekilde tüketmektedir.

---

## 1. Kök Dizin ve Çalışma Alanı (Workspace) Bağlantıları

Mobil uygulama çıkarılırken kök dizinde yapılması gereken değişiklikler:

### 1.1. `package.json` (Kök)
- **`devDependencies`:** `"expo": "~54.0.0"` doğrudan silinmelidir.
- **`overrides`:**
  ```json
  "overrides": {
    "react": "19.2.7",
    "react-native": "0.81.5"
  }
  ```
  `react-native` override'ı silinmelidir. React sürümü web'in ihtiyacına göre standardize edilmelidir.
- **`scripts`:**
  - `"dev": "turbo dev"`: Mobil kalktığında yalnızca web'i başlatacak şekilde `"dev": "turbo dev --filter=web"` veya doğrudan web scripti haline getirilebilir.
- **`workspaces`:**
  - `apps/mobile` klasörü silindiğinde `apps/*` glob'u yalnızca `apps/web`'i görecektir. İstenirse repo monorepo yerine doğrudan tekil web projesine de dönüştürülebilir.

### 1.2. `tsconfig.json` (Kök)
- **Mevcut Durum:**
  ```json
  {
    "compilerOptions": {},
    "extends": "expo/tsconfig.base"
  }
  ```
- **Kritik Etki:** Kök `tsconfig.json`, `expo` paketinin `tsconfig.base` şablonunu miras almaktadır. `expo` kaldırıldığında bu dosya derleme hatası verecektir.
- **Yapılacak İşlem:** `extends` kaldırılmalı, Node veya temel TypeScript yapılandırması konulmalıdır.

### 1.3. `app.json` ve `.expo/`
- Kök dizindeki `app.json` dosyası yalnızca Expo Application Services (EAS) mobil build projesini (`projectId: 53cd81df-...`) barındırır.
- Bu dosya ve `.expo/` dizini doğrudan silinmelidir.

---

## 2. Ortak Paket (`@layk/core`) ve Web Derleyicisi Bağlantıları

### 2.1. `@layk/core` Silinemez!
`packages/core` paketi web tarafından şu noktalarda kullanılmaktadır:
- [`apps/web/src/App.tsx`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/App.tsx): `AuthProvider`
- [`apps/web/src/components/*`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/components): `useAuth`, `cn`
- [`apps/web/src/pages/*`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/pages): `supabase`, `useAuth`, `formatDateTime`, `formatPrice`, `cn`

**Gelecek Seçenekleri:**
- **Seçenek A (Monorepo kalsın):** `packages/core` aynen kalır, yalnızca web tarafından tüketilir.
- **Seçenek B (Düz SPA olsun):** `packages/core/src/*` dosyaları doğrudan `apps/web/src/core/` veya `apps/web/src/lib/` altına taşınır, monorepo katmanı tamamen ortadan kaldırılır.

### 2.2. Hermes Kısıtının Kalkması ve Vite Sadeleştirmesi
- `packages/core/src/lib/supabase.ts` içindeki `resolveEnv(viteKey, expoKey)` fonksiyonu ve `process.env` kısıtı, React Native Hermes motorunun `import.meta` desteği olmamasından kaynaklanıyordu.
- Mobil çıkarıldığında `apps/web/vite.config.ts` dosyasındaki şu karmaşık blok kaldırılabilir:
  ```typescript
  // ARTIK GEREK YOK:
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const define = Object.fromEntries(
    Object.entries(env).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)])
  )
  ```
- Doğrudan standart Vite yöntemi olan `import.meta.env.VITE_SUPABASE_URL` kullanımına geçilebilir.

---

## 3. Backend, Veritabanı ve Edge Functions Bağlantıları

Mobil uygulamanın kaldırılması veritabanı ve sunucu tarafında şu bileşenleri etkiler:

### 3.1. Edge Function: `send-push`
- **Konum:** [`supabase/functions/send-push/index.ts`](file:///C:/Users/Mert/event-reservation-app/supabase/functions/send-push/index.ts)
- **Durum:** Bu fonksiyon doğrudan Expo Push API'sine (`https://exp.host/--/api/v2/push/send`) bildirim atar.
- **Etki:** Mobil kalktığında Expo push bildirimlerinin gideceği bir cihaz kalmayacaktır.
- **İşlem:** Eğer web için Web Push (PWA/Service Worker) planlanmıyorsa, `send-push` Edge Function'ı yayından kaldırılabilir (un-deploy).

### 3.2. Veritabanı Trigger ve Kolonları
- **`public.users.push_token`:** Yalnızca mobil Expo uygulamasından doldurulmaktadır (`0021_push_token.sql`). Web'de push token kaydı yoktur.
- **`trg_send_push_on_notification`:** `notifications` tablosuna her bildirim eklendiğinde `send-push` Edge Function'ını çağırır (`0022_send_push_webhook.sql`).
- **`extensions.http_post`:** `0024_definitive_http_post_fix.sql:66` satırında fallback olarak Expo push URL'i sabit kodlanmıştır:
  ```sql
  _url text := COALESCE(url, uri, 'https://exp.host/--/api/v2/push/send');
  ```
- **Öneri:** Mobil kaldırıldığında `trg_send_push_on_notification` trigger'ı pasifize edilmeli veya kaldırılmalıdır; aksi halde her web içi bildirimde veritabanı boşuna Expo webhook çağrısı yapmaya devam edecektir.

---

## 4. Dokümantasyon Temizliği

Aşağıdaki dosyalardaki mobil referansları, mimari şemalar ve yönergeler mobil çıkarıldığında revize edilmelidir:
1. **`AGY.md`**: "Mobile Companion", Expo SDK 54, React Native 0.81, NativeWind ve EAS build başlıkları.
2. **`CLAUDE.md`**: Mobil komutları (`expo run:android`, `expo run:ios`), `useAuthMobile.tsx` açıklamaları ve NativeWind stil kuralları.
