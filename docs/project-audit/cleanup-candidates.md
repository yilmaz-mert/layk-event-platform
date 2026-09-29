# Temizlik ve Sadeleştirme Adayları (cleanup-candidates.md)

Bu doküman, projede kullanılmayan dosyaları, yetim bileşenleri, mükerrer yardımcı fonksiyonları ve operasyonel betiklerin durumunu sınıflandırır.

> [!CAUTION]
> Bu aşamada hiçbir dosya **silinmemiştir**. Listelenen öğeler, müşteri teslimi öncesinde ya da sırasında incelenip onay alınarak temizlenmelidir.

---

## 1. Temizlik Adayları Sınıflandırma Tablosu

| Öğe | Dosya / Yol | Durum / Öneri | Neden / Kanıt |
| :--- | :--- | :--- | :--- |
| **Yetim Sayfa** | `apps/web/src/pages/Support.tsx` | **Güvenli Silme Adayı** | Rotalarda tanımlı değil; destek işlevi `UserProfile.tsx?tab=support` içine taşınmış. |
| **Boş Placeholder** | `apps/web/src/pages/AdminEventManagement.tsx` | **Güvenli Silme Adayı** | 11 satırlık boş taslak; rotalarda yok, hiçbir yerden çağrılmıyor. |
| **Kullanılmayan Varlık** | `apps/web/public/icons.svg` | **Önce Doğrulanmalı** | 5 KB'lık SVG sprite; kodda ve HTML'de hiçbir referansı yok (Lucide ikonları kullanılıyor). |
| **Mobil EAS Yapılandırması** | Kök `app.json` | **Mobil Kaldırılırken Silinecek** | Yalnızca Expo EAS mobil build kimliğini (`projectId`) içerir. |
| **Mobil Expo Önbelleği** | Kök `.expo/` dizini | **Güvenli Silme Adayı** | Expo yerel durumu; gitignore'a eklenmeli veya temizlenmeli. |
| **Mükerrer Formatlayıcı** | `packages/core/src/lib/format.ts:formatTime` | **Birleştirme Adayı** | `apps/web/src/lib/eventDisplay.ts:formatEventTime` ile neredeyse aynı işi yapıyor. |
| **Operasyonel Betikler** | `scripts/*` ve `scripts/backups/*` | **KORUNMALI** | Demo veri yenileme, görsel eşleme ve rollback betikleri (dokümante edilerek saklanmalı). |
| **Uygulanmış Migration'lar** | `supabase/migrations/0001` - `0030` | **KORUNMALI** | Veritabanı şema tarihçesi; kesinlikle silinmemelidir. |

---

## 2. Adayların Detaylı Değerlendirmesi

### 2.1. `apps/web/src/pages/Support.tsx` (211 Satır)
- **Amacı:** Kullanıcı destek biletlerini listelemek ve bilet açmak için yazılmış ilk bağımsız sayfa.
- **Kullanılmadığına İlişkin Kanıt:** `apps/web/src/App.tsx` router ağacında `/support` rotası yoktur. `NotificationBell.tsx` ve `0020_security_patch_and_links.sql` bildirimleri `/profile?tab=support` adresine yönlendirmektedir. Destek bileti açma ve mesajlaşma doğrudan `UserProfile.tsx` içerisine yerleştirilmiştir.
- **Dinamik Import / Dış Kullanım:** Yok.
- **Silinirse Etkilenebilecek Yerler:** Hiçbir yer.
- **Öneri:** **Güvenli Silme Adayı.**

---

### 2.2. `apps/web/src/pages/AdminEventManagement.tsx` (11 Satır)
- **Amacı:** Etkinlik yönetimi için açılmış boş bir sayfa iskeleti: `[ Placeholder — event management tools will appear here in the next phase ]`.
- **Kullanılmadığına İlişkin Kanıt:** `apps/web/src/App.tsx` içinde rota olarak `/admin/events` ([`AdminEvents.tsx`](file:///C:/Users/Mert/event-reservation-app/apps/web/src/pages/AdminEvents.tsx)) kullanılmaktadır. Bu dosya tamamen atıl durumdadır.
- **Silinirse Etkilenebilecek Yerler:** Hiçbir yer.
- **Öneri:** **Güvenli Silme Adayı.**

---

### 2.3. `apps/web/public/icons.svg` (5.03 KB)
- **Amacı:** İlk prototip aşamasından kalan SVG sembol sprite dosyası.
- **Kullanılmadığına İlişkin Kanıt:** Projede tüm ikonlar `lucide-react` kütüphanesinden SVG component olarak import edilmektedir. Ne `index.html` ne de `src/` içindeki hiçbir dosya `icons.svg` dosyasına `<use href="...">` veya `fetch` ile bağlanmamaktadır.
- **Silinirse Etkilenebilecek Yerler:** Dışarıdan statik link verilmiş olma ihtimali düşüktür; yine de dağıtım öncesi teyit edilmelidir.
- **Öneri:** **Önce Doğrulanmalı.**

---

### 2.4. Kök `app.json` ve `.expo/`
- **Amacı:** Expo Application Services (EAS) mobil build projesini tanımlamak.
- **Kullanılmadığına İlişkin Kanıt:** Web uygulamasının Vite veya Vercel derlemesinde hiçbir rolü yoktur.
- **Öneri:** Mobil uygulama repodan ayrıştırıldığında kök dizinden silinmelidir.

---

### 2.5. Mükerrer Saat Formatlayıcıları (`formatTime` vs `formatEventTime`)
- **`packages/core/src/lib/format.ts` (satır 22):**
  ```typescript
  export function formatTime(iso: string): string {
    return new Intl.DateTimeFormat('tr-TR', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }
  ```
- **`apps/web/src/lib/eventDisplay.ts` (satır 18):**
  ```typescript
  const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
  export function formatEventTime(iso: string): string {
    return timeFmt.format(new Date(iso));
  }
  ```
- **Fark:** `eventDisplay.ts` listelerde hizalama sağlamak için `hour: '2-digit'` kullanırken, `@layk/core` `hour: 'numeric'` kullanmaktadır.
- **Öneri:** Web uygulamasındaki kullanım tek bir yerde (`@layk/core` veya `eventDisplay`) konsolide edilmeli ve tekilleştirilmelidir.

---

### 2.6. `scripts/` Dizinindeki Operasyonel Dosyalar (KORUNMALI)
Aşağıdaki dosyalar kod tabanında doğrudan import edilmedikleri için "kullanılmıyor" gibi görünebilir, ancak **proje bakım ve veri güvenliği açısından değerlidir**:
- `scripts/refresh-demo-data.js` & `refresh-demo-data.test.js`: Demo verilerin referans tarihe göre gün gün kaydırılmasını sağlayan ve birim testi bulunan operasyonel betik.
- `scripts/rollback-demo-data.sql`: Canlı demo yenilemesini geri alma snapshot SQL'i.
- `scripts/upload-event-images.js` & `upload-event-images.test.js`: Yerel görselleri Supabase storage'a yükleyen yardımcı betik.
- `scripts/update-event-images.sql` & `rollback-event-images.sql`: Görsel URL'lerini güncelleyen ve geri alan SQL scriptleri.
- `scripts/backups/*.json`: Yapılan işlemlerin geri dönüş JSON yedekleri.
- **Öneri:** **KORUNMALI.** Silinmemeli, `scripts/README.md` oluşturularak bakım operasyonları dokümante edilmelidir.
