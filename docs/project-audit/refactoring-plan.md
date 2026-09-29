# Modülerleştirme ve Refaktör Planı (refactoring-plan.md)

Bu doküman, `codebase-design` ilkeleri doğrultusunda aşırı sorumluluk taşıyan dosyaların derin modüllere dönüştürülmesini, arayüz sınırlarını (seams) ve kod içi açıklama ihtiyaçlarını planlar.

---

## 1. Modülerleştirme İlkeleri (`codebase-design`)

- **Yalnızca satır sayısına göre dosya bölünmeyecektir.** Bölme işlemi, net bir sorumluluk alanı ve küçük bir arayüz (small interface + deep implementation) sunduğunda yapılacaktır.
- **Tek kullanımlık gereksiz soyutlama katmanlarından kaçınılacaktır.**
- **Seam (Michael Feathers):** Değişikliğin ve test edilebilirliğin odaklandığı temiz arayüz noktaları belirlenecektir.

---

## 2. Yeniden Yapılandırılacak Derin Modül Adayları

### 2.1. `AdminDashboard.tsx` (1439 Satır) -> `UserDetailDrawer` Ayrıştırması

- **Mevcut Durum:** Sayfa; metrik kartlarını, kullanıcı onay tablosunu, onaylı kullanıcı listesini, kullanıcı filtrelerini ve aynı zamanda seçilen kullanıcının geçmişini, rezervasyonlarını, iptal işlemlerini ve o kullanıcı adına manuel rezervasyon yapma modalını tek bir devasa fonksiyonda barındırmaktadır.
- **Önerilen Modül:** `apps/web/src/components/admin/UserDetailDrawer.tsx`
- **Sorumluluk:** Seçilen kullanıcının profil detaylarını, aktif/geçmiş rezervasyonlarını listelemek, yönetici tarafından iptal edilmesini sağlamak ve yeni rezervasyon ekleme akışını yönetmek.
- **Arayüz (Interface):**
  ```typescript
  interface UserDetailDrawerProps {
    userId: string | null;
    isOpen: boolean;
    onClose: () => void;
    onUserUpdated: () => void;
  }
  ```
- **Sağlayacağı Fayda:**
  - `AdminDashboard.tsx` satır sayısı yarı yarıya (~700 satır) azalır.
  - Sayfa yalnızca dashboard durumunu ve kullanıcı listesini orkestre eder.
  - Kullanıcı detay çekmecesinin state'i (rezervasyon listesi, form yükleniyor durumu) ana tablonun render döngüsünden ayrılır.
- **Geçiş Riski:** Düşük. Sadece callback ve userId prop'u üzerinden bağlanır.

---

### 2.2. `AdminEvents.tsx` (1200 Satır) -> `EventModal` Ayrıştırması

- **Mevcut Durum:** Etkinlik tablosu, kartlar, filtreler ve arama mantığının yanında; görsel yükleme, form doğrulama, tarih dönüştürme ve Storage `event-banners` yüklemesini yöneten ~400 satırlık `EventModal` bileşeni dosya içine gömülüdür.
- **Önerilen Modül:** `apps/web/src/components/admin/EventModal.tsx`
- **Sorumluluk:** Etkinlik oluşturma ve düzenleme formunu yönetmek, görseli işleyip Storage'a yüklemek ve etkinlik payload'ını veritabanına kaydetmek.
- **Arayüz (Interface):**
  ```typescript
  interface EventModalProps {
    editEvent: EventRecord | null;
    categories: EventCategory[];
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
  }
  ```
- **Sağlayacağı Fayda:**
  - Form state'i (`FormState`, `previewUrlRef`, `submitting`) etkinlik listeleme sayfasının hafızasından tamamen ayrılır.
  - Modal kapalıyken gereksiz render döngüleri önlenir.
- **Geçiş Riski:** Çok düşük. Mevcut `EventModal` fonksiyonunun bağımsız dosyaya taşınmasından ibarettir.

---

### 2.3. `UserProfile.tsx` (590 Satır) -> `UserSupportSection` Ayrıştırması

- **Mevcut Durum:** Kullanıcı profil ayarları (isim, telefon, adres, avatar yükleme/silme, gizlilik toggle'ı ve geri sayım sayacı) ile birlikte; destek biletlerinin listelenmesi, bilet açma formu, Realtime dinleyicileri ve `TicketChat` entegrasyonu aynı dosyada yer almaktadır.
- **Önerilen Modül:** `apps/web/src/components/profile/UserSupportSection.tsx`
- **Sorumluluk:** Kullanıcının destek taleplerini listelemek, yeni talep formu açmak ve seçili talebi `TicketChat` ile bağlamak.
- **Arayüz (Interface):**
  ```typescript
  interface UserSupportSectionProps {
    userId: string;
    initialTicketId?: string | null;
  }
  ```
- **Sağlayacağı Fayda:**
  - Destek sekmesi seçilmediğinde destek taleplerinin veritabanından çekilmesi engellenir (`loadTickets` çağrısı yalnızca bu modül mount olduğunda çalışır).
  - Profil formu ile destek sohbetinin Realtime state'leri birbirini tetiklemez.
- **Geçiş Riski:** Düşük.

---

### 2.4. `App.tsx` ve Rota Bazlı Kod Bölme (`React.lazy`)

- **Mevcut Durum:** Tüm sayfalar statik `import` ile derlendiği için son kullanıcı 632 kB'lık tekil JS bundle indirmektedir.
- **Önerilen Yapı:**
  ```typescript
  // apps/web/src/App.tsx
  import { lazy, Suspense } from 'react';

  const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
  const AdminEvents = lazy(() => import('@/pages/AdminEvents'));
  const AdminEventDetails = lazy(() => import('@/pages/AdminEventDetails'));
  const AdminBroadcast = lazy(() => import('@/pages/AdminBroadcast'));
  const AdminTickets = lazy(() => import('@/pages/AdminTickets'));
  ```
- **Sağlayacağı Fayda:** Admin paneli kodları son kullanıcının ilk yükleme paketinden çıkarılır, ilk yükleme boyutu ~250 kB seviyesine iner.

---

## 3. Kod Açıklamaları (Comments) ve Dokümantasyon İhtiyaçları

Satır satır ne yaptığını anlatan gereksiz yorumlar yerine, **"Neden böyle yapıldı?"**, **güvenlik varsayımı** veya **platform kısıtı** içeren açıklamalar eklenmelidir:

1. **`apps/web/src/pages/EventDetails.tsx` (Kapasite Tavan Hesabı):**
   - *Mevcut Durum:* `maxSeatsForUpdate` formülü karmaşık görünüyor:
     ```typescript
     Math.min(event.max_tickets_per_user, Math.max(1, spotsLeft + reservation.tickets_requested))
     ```
   - *Gerekli Yorum:* Kullanıcı kendi rezervasyonunu güncellerken elinde tuttuğu biletler zaten `booked_count` içindedir; bu yüzden kalan yere kullanıcının kendi biletleri geri eklenerek doğru tavan limit hesaplanır.
2. **`packages/core/src/lib/supabase.ts` (Hermes & `process.env` Kısıtı):**
   - *Mevcut Durum:* `resolveEnv` fonksiyonu var.
   - *Gerekli Yorum:* React Native Hermes derleyicisinin Babel aşamasında `import.meta` gördüğünde çökmesi nedeniyle Vite tarafında `define` ile `process.env` tanımlandığı belirtilmeli; ancak fallback anon anahtarlarının güvenlik riski giderilmelidir.
3. **`apps/web/src/components/Switch.tsx` (Erişilebilirlik ve DOM Kuralı):**
   - *Mevcut Durum:* `<label htmlFor={id}>` bir butonu sarmalıyor.
   - *Gerekli Düzeltme & Yorum:* HTML W3C standardına göre butonlar labelable control değildir. Çift tıklama olaylarını önlemek amacıyla `aria-labelledby` kullanımı belgelenmelidir.
4. **Eskimiş / Yanıltıcı Yorumların Temizlenmesi:**
   - `CLAUDE.md` içindeki `ProtectedRoute` onay durumu açıklaması gerçeği yansıtacak şekilde revize edilmelidir (Bkz: `DOC-001`).
