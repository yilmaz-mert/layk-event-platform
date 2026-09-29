# Mimari ve Bağımlılık Raporu (architecture.md)

Bu doküman, Layk platformunun monorepo orkestrasyonunu, paket sınırlarını, build/deploy mekanizmalarını ve çalışma zamanı yapılandırmasını açıklar.

---

## 1. Monorepo Mimarisi ve Paket Haritası

Proje, **Turborepo (2.9.18)** ve **npm workspaces** ile yönetilen bir monorepo yapısına sahiptir:

```
event-reservation-app/
├── apps/
│   ├── web/                    # React 19 SPA (Vite 8 + TypeScript + Tailwind CSS v4)
│   └── mobile/                 # Expo ~54 + React Native 0.81 (Kaldırılacak)
├── packages/
│   └── core/                   # @layk/core paylaşılan çekirdek kütüphane
├── supabase/                   # Supabase backend (PostgreSQL, Migrations, Edge Functions)
├── scripts/                    # Veri yenileme, görsel taşıma ve test betikleri
├── turbo.json                  # Monorepo görev ardışık düzeni (pipeline)
├── vercel.json                 # Kök Vercel dağıtım ayarları
└── package.json                # Kök bağımlılıklar ve npm çalışma alanları
```

### Paketler Arası İlişki ve Seam Analizi

```mermaid
flowchart TD
    subgraph Apps
        Web["apps/web (Vite 8 + React 19)"]
        Mobile["apps/mobile (Expo / RN - Aday)"]
    end

    subgraph Packages
        Core["packages/core (@layk/core)"]
    end

    subgraph Backend
        SupaDB[(Supabase PostgreSQL)]
        SupaStorage[(Supabase Storage)]
        EdgeFuncs["Supabase Edge Functions"]
    end

    Web -->|İstemci, Auth, Formatlayıcılar| Core
    Mobile -.->|Yalnızca Supabase client & formatlayıcılar| Core
    Core -->|@supabase/supabase-js| SupaDB
    Web -->|Doğrudan Storage & RPC| SupaStorage
    Web -->|Doğrudan Storage & RPC| SupaDB
    SupaDB -->|pg_net Webhook| EdgeFuncs
```

> [!IMPORTANT]
> `web` ve `mobile` kesinlikle UI bileşeni paylaşmaz. Yalnızca `@layk/core` üzerinden auth context ve formatlama yardımcılarını tüketirler. Ancak kritik bir tasarım kısıtı olarak: **Mobil uygulama auth hook'unu (`useAuth`) paylaşmaz**, `apps/mobile/src/hooks/useAuthMobile.tsx` üzerinde SecureStore tabanlı bağımsız bir auth adapter kullanır.

---

## 2. Proje Nasıl Başlatılıyor, Build Ediliyor ve Yayınlanıyor?

### Başlatma (Development)
- **Kökten başlatma:** `npm run dev`
  - `turbo dev` komutunu çalıştırır. `turbo.json` içinde `persistent: true` ve `cache: false` olarak ayarlanmıştır. `apps/web` (Vite) ve `apps/mobile` (Expo) paralel olarak başlar.
- **Yalnızca Web'i başlatma:** `cd apps/web && npm run dev` (Vite port 5173 üzerinde hızlı HMR ile çalışır).

### Build Süreci
- **Kökten build:** `npm run build` veya `npm run build:web`
  - `turbo build --filter=web` komutunu çalıştırır.
  - `turbo.json` kuralına göre:
    ```json
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    }
    ```
  - `apps/web`'in `package.json` build komutu: `tsc -b && vite build`.
  - TypeScript proje referansları derlenir (`tsc -b`), ardından Vite bundle üretir ve çıktıyı `apps/web/dist` altına yazar.
- **Gözlem (Build Çıktısı):**
  - Yapılan yerel doğrulamada `dist/assets/index-BBVrYtrp.js` boyutu **632.37 kB** (gzip: 172.11 kB) olarak ölçülmüştür.
  - Kod bölme (dynamic import / code splitting) bulunmadığı için admin sayfaları dahil tüm kod tek bir bundle içinde yüklenmektedir (Bkz: [findings.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/findings.md) - `ARCH-002`).

### Yayınlama (Deploy - Vercel)
- Proje **Vercel** üzerine statik SPA olarak dağıtılmaktadır.
- Kök `vercel.json`:
  ```json
  {
    "buildCommand": "npm run build:web",
    "installCommand": "npm install",
    "outputDirectory": "apps/web/dist",
    "rewrites": [
      { "source": "/(.*)", "destination": "/index.html" }
    ]
  }
  ```
- Ayrıca `apps/web/vercel.json` dosyası da bulunmaktadır:
  ```json
  {
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
  }
  ```
- Tüm istekler SPA Router (`react-router-dom`) tarafından karşılanabilmesi için `/index.html` dosyasına yönlendirilir (sayfa yenilemelerinde 404 hatasını önleyen kural).

---

## 3. Ortam Değişkenleri ve Platform Geçişi (Cross-Platform Env Trick)

`packages/core/src/lib/supabase.ts` dosyasında özel bir ortam değişkeni çözümleme mekanizması bulunmaktadır:

1. **Sorun:** React Native Hermes motoru, kod ayrıştırma (parsing) aşamasında `import.meta` ifadesini desteklemez ve derleme anında çöker.
2. **Çözüm:** `@layk/core` yalnızca `process.env` okur.
3. **Web Köprüsü:** `apps/web/vite.config.ts` dosyası, derleme sırasında `loadEnv` ile `VITE_*` değişkenlerini okur ve Vite'ın `define` nesnesi ile `process.env.VITE_*` olarak koda enjekte eder:
   ```typescript
   // apps/web/vite.config.ts
   const env = loadEnv(mode, process.cwd(), 'VITE_')
   const define = Object.fromEntries(
     Object.entries(env).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)])
   )
   ```
4. **Çekirdek Çözümleyici:** `packages/core/src/lib/supabase.ts`:
   ```typescript
   function resolveEnv(viteKey: string, expoKey: string): string {
     if (typeof process !== 'undefined' && process.env) {
       return (process.env[viteKey] || process.env[expoKey] || '');
     }
     return '';
   }
   ```
5. **Gözlem ve Risk:** `supabaseUrl` ve `supabaseAnonKey` değişkenleri bulunamadığında `packages/core/src/lib/supabase.ts:31-32` satırlarında **sabit kodlanmış (hardcoded) canlı bir Supabase referansı ve anon anahtar** yer almaktadır. Bu durum [findings.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/findings.md) (`SEC-002`) altında belgelenmiştir.

---

## 4. Kök Yapılandırmalar ve Bağımlılık Analizi

| Dosya | Görev ve İçerik | Durum / Risk |
| :--- | :--- | :--- |
| `package.json` (Kök) | Monorepo workspaces (`apps/*`, `packages/*`), turbo scriptleri | `expo: ~54.0.0` devDependency ve `react-native` overrides içerir (Mobil bağlantısı). |
| `turbo.json` | `build`, `dev`, `lint` görev bağımlılıkları | Stabil, ancak test görevi pipeline'da tanımlı değil. |
| `tsconfig.json` (Kök) | TypeScript kök yapılandırması | `"extends": "expo/tsconfig.base"` kullanıyor. Mobil çıkarılınca kopacak. |
| `app.json` (Kök) | Expo EAS proje kimliği (`projectId`) | Yalnızca mobil için gerekli; web için gereksiz. |
| `vercel.json` | Vercel SPA build/output ayarları | Web dağıtımını doğrudan kontrol eden kritik dosya. |
| `.npmrc` | `legacy-peer-deps=true` | React 19 / Expo bağımlılık çakışmalarını aşmak için konulmuş. |

---

## 5. Modül Sınırları ve Mimari Değerlendirme (`codebase-design`)

- **`packages/core`**:
  - Dış arayüz (`src/index.ts`): `supabase`, `createSupabaseClient`, `AuthProvider`, `useAuth`, `cn`, `formatShortDate`, `formatDateTime`, `formatTime`, `formatPrice`.
  - Derinlik (Depth): `useAuth` hook'u retry mekanizmasını, session yönetimini ve durum yönetimini arkasında gizler (derin modül). Ancak `format.ts` ve `eventDisplay.ts` arasında yetki ve sorumluluk mükerrerliği vardır.
- **`apps/web/src/pages/`**:
  - Route orkestratörü olması gereken sayfaların bir kısmı (özellikle `AdminDashboard.tsx` 1439 satır, `AdminEvents.tsx` 1200 satır) çok fazla sunum, modal yönetimi, CSV çıktısı ve veritabanı sorgusunu tek bir dosyada birleştirmektedir.
- **Yetim Modüller**:
  - `apps/web/src/pages/Support.tsx` ve `apps/web/src/pages/AdminEventManagement.tsx` hiçbir rota veya bileşen tarafından çağrılmamaktadır (Bkz: [cleanup-candidates.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/cleanup-candidates.md)).
