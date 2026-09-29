# Layk Platform — Kapsamlı Proje İnceleme ve Bilgi Dizini

Bu dizin, **Layk Event Platform** projesinin müşteri teslimine hazırlanması amacıyla gerçekleştirilen statik ve mimari incelemenin kalıcı bilgi merkezidir.

> **Önemli Not:** Bu inceleme aşamasında hiçbir uygulama kodu değiştirilmemiş, dosya silinmemiş, veritabanına yazılmamış ve migration uygulanmamıştır. Amaç; sistemin mevcut davranışını, mimarisini, veri akışlarını ve risklerini kanıtlarıyla ortaya koyarak sonraki düzeltme adımlarını güvenli kılmaktır.

---

## 1. Hızlı Bağlantılar ve İnceleme Haritası

| Doküman | İçerik ve Amaç |
| :--- | :--- |
| [architecture.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/architecture.md) | Sistem mimarisi, monorepo yapısı, paket bağımlılıkları, runtime ve build ayarları |
| [feature-map.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/feature-map.md) | Kullanıcı akışları, ekranlar, yetki kontrolleri ve özellik bazlı veri akışları |
| [database-map.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/database-map.md) | Kronolojik migration analizi, tablolar, RLS politikaları, RPC'ler ve trigger'lar |
| [findings.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/findings.md) | Sabit ID'li (SEC, BUG, ARCH, A11Y, DOC), önceliklendirilmiş ve kanıtlı bulgular |
| [cleanup-candidates.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/cleanup-candidates.md) | Yetim dosyalar, ölü kodlar, yinelenen yardımcılar ve güvenli temizlik adayları |
| [refactoring-plan.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/refactoring-plan.md) | `codebase-design` ilkelerine uygun derin modül tasarımı ve kod açıklamaları |
| [mobile-removal.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/mobile-removal.md) | Mobil uygulamanın kaldırılmasının kök yapı, CI, Edge Functions ve DB bağlantıları |
| [verification-plan.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/verification-plan.md) | Yapılan kontroller, çalıştırılamayan testler ve teslim öncesi doğrulama matrisi |

---

## 2. İnceleme Kapsamı ve Ortam Bilgisi

- **Tarih:** 29 Eylül 2026
- **İncelenen Çalışma Dalı (Branch):** `feature/mobile-monorepo` (HEAD)
- **Çalışma Ağacı Durumu:** 
  - Değişiklik yapılmış (uncommitted): `apps/web/src/lib/eventDisplay.ts`, `apps/web/src/pages/EventDetails.tsx`, `apps/web/src/pages/UserProfile.tsx`
  - Takipsiz dosya (untracked): `supabase/migrations/0030_attendee_visibility_non_reciprocal.sql`
  - *Bu değişiklikler kullanıcıya ait olup inceleme süresince aynen korunmuştur.*
- **Kapsam İçi:**
  - `apps/web`: React 19 + Vite 8 + Tailwind CSS v4 Single Page Application.
  - `packages/core`: `@layk/core` paylaşılan Supabase istemcisi, auth hook'u ve formatlayıcılar.
  - `supabase/migrations`: 0001 - 0030 arası tüm SQL şema ve güvenlik migration'ları.
  - `supabase/functions`: Deno Edge Functions (`send-booking-sms`, `send-push`).
  - Kök yapılandırmalar (`package.json`, `turbo.json`, `vercel.json`, `app.json`, `tsconfig.json`).
  - `scripts/`: Demo veri yenileme, görsel yükleme ve test betikleri.
- **Kapsam Dışı:**
  - `apps/mobile`: İleride projeden tamamen kaldırılacağı için iç ekranları ve native kodları incelenmemiştir (yalnızca kaldırılmayı etkileyen monorepo ve backend bağlantıları incelenmiştir).
  - `node_modules`, `dist`, `.turbo`, `.expo`, `.git` çıktıları.

---

## 3. Kullanılan Yetkinlikler (Skills) ve Durum

- **`codebase-design`**: Modül derinliği (deep vs shallow), arayüz sınırları (seams) ve sorumluluk izolasyonu için kullanıldı.
- **`diagnosing-bugs`**: Şüpheli mantık ve yarış koşullarının (race conditions) kod kanıtlarıyla izlenmesi için uygulandı.
- **`vercel-react-best-practices`**: React 19 hooks, render optimizasyonu ve bundle boyutu kuralları referans alındı.
- **`web-design-guidelines`**: UX, form etiketleme ve erişilebilirlik (a11y) kontrollerinde kullanıldı.
- *Not:* `improve-codebase-architecture` skill'i çalışma alanında mevcut olmadığından otomatik kurulum yapılmamış, mimari değerlendirme `codebase-design` skill'i ve yerleşik mühendislik ilkeleri ile yürütülmüştür.

---

## 4. Dokümantasyon Bakım ve Güncelleme Kılavuzu

Bu bilgi dizini projenin yaşayan mimari referansıdır:
1. **Yeni bir Migration eklendiğinde:** [database-map.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/database-map.md) kronolojik listesine eklenmeli, etkilenen tablo politikaları güncellenmelidir.
2. **Bir Ekran veya Rota değiştiğinde:** [feature-map.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/feature-map.md) ve [architecture.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/architecture.md) dosyalarındaki rota tablosu güncellenmelidir.
3. **Bir Bulgu düzeltildiğinde:** [findings.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/findings.md) dosyasındaki bulgu durumu `Doğrulandı`'dan `Çözüldü` olarak işaretlenmeli ve doğrulama komutu/adımı not edilmelidir.
4. **Mobil uygulama çıkarıldığında:** [mobile-removal.md](file:///C:/Users/Mert/event-reservation-app/docs/project-audit/mobile-removal.md) adım listesi sırasıyla işletilmeli ve tamamlandığında arşive kaldırılmalıdır.
