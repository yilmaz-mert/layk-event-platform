# Doğrulama, Test ve Kontrol Matrisi (verification-plan.md)

> **Son çalıştırma — 2026-09-29:** web `tsc -b` ✓, core `tsc --noEmit` ✓, `npm run build` ✓ (ana chunk 556.57 kB / gzip 158.99 kB; >500 kB uyarısı),
> `npm run lint` ✓ **0 problem**, `refresh-demo-data.test.js` 7/7 ✓, `upload-event-images.test.js` 4/4 ✓, `npm ci --dry-run` ✓.
> Env probe build: verilen URL/anahtar pakette, eski demo proje referansı 0; env eksikken build değer loglamadan durur.
> Tarayıcı (Playwright, **mock Supabase + mock Realtime**, 390/1280 px): profil destek sekmesi ve `?ticketId` doğrudan bağlantısı,
> sekmeden çıkınca/çıkış yapınca kanal temizliği, admin kullanıcı penceresi, ortak seçiciler (klavye, Escape), admin lazy yükleme,
> eski chunk için tek yenileme + hata ekranı (preview build) — hepsi geçti. Switch: Chromium + WebKit etkileşim testi geçti.
> **Gerçek backend, gerçek cihaz ve ekran okuyucu ile doğrulama yapılmadı.** Aşağıdaki manuel matris (3.1–3.4) hâlâ geçerlidir.

Bu doküman, inceleme sırasında gerçekleştirilen güvenli yerel kontrolleri, mevcut test durumunu, çalıştırılamayan senaryoları ve teslim öncesi uygulanacak doğrulama matrisini belgeler.

---

## 1. İnceleme Sırasında Gerçekleştirilen Güvenli Kontroller

İnceleme aşamasında veritabanına yazmayan, dışarıya istek atmayan ve mevcut kodu bozmayan şu kontroller icra edilmiştir:

| Kontrol | Çalıştırılan Komut | Sonuç | Durum / Not |
| :--- | :--- | :--- | :--- |
| **Git Durumu** | `git status` / `git diff` | **Başarılı (0)** | Kullanıcının uncommitted ve untracked değişiklikleri tespit edildi ve korundu. |
| **Derleme (Build)** | `npm run build` | **Başarılı (0)** | Vite derlemesi tamamlandı (`dist/assets/index-BBVrYtrp.js 632.37 kB`). |
| **Statik Kod Analizi (Lint)** | `npm run lint` | **Hata (1)** | 20 problem (19 error, 1 warning) raporlandı (Bkz: `BUG-005`). |
| **Demo Veri Birim Testi** | `node scripts/refresh-demo-data.test.js` | **Başarılı (0)** | 7/7 test geçti (tarih kaydırma, hafta günü değişmezliği, kapsam koruması). |
| **Görsel Eşleme Birim Testi** | `node scripts/upload-event-images.test.js` | **Başarılı (0)** | 4/4 test geçti (Türkçe harf normalizasyonu, slug sanitization, 16 görsel eşleşmesi). |
| **Web / Core Test Koşucusu** | `npm test` | **Mevcut Değil** | `apps/web` ve `packages/core` için Jest/Vitest test koşucusu yapılandırılmamış. |

---

## 2. Çalıştırılamayan / Kapsam Dışında Bırakılan Kontroller

Aşağıdaki işlemler güvenlik ve veri bütünlüğü ilkeleri gereğince bilinçli olarak çalıştırılmamıştır:
1. **Canlı Veritabanı Yazma İşlemleri:** `supabase db push`, `supabase migration up` gibi komutlar çalıştırılmamıştır.
2. **Demo Veri Yenileme Betiği:** `node scripts/refresh-demo-data.js` betiği veritabanına doğrudan veri yazdığı için çalıştırılmamıştır (yalnızca `.test.js` saf birim testi çalıştırılmıştır).
3. **Görsel Yükleme Betiği:** `node scripts/upload-event-images.js` yerel masaüstü dizini (`C:\Users\Mert\Desktop\reservation`) ve canlı Storage gerektirdiği için çalıştırılmamıştır.
4. **Edge Functions Deploy / Test:** `send-booking-sms` ve `send-push` fonksiyonları canlı SMS veya push tetiklememesi için çalıştırılmamıştır.
5. **Mobil Native / Expo Başlatma:** Mobil uygulama kapsam dışı olduğu için `expo start` veya simulator testleri yapılmamıştır.

---

## 3. Teslim Öncesi Doğrulama ve Test Senaryoları (E2E / Manuel Matris)

Bulguların düzeltilmesinin ardından müşteri teslimi öncesinde sırasıyla işletilecek senaryolar:

### 3.1. Güvenlik ve Yetki Doğrulama Senaryosu (SEC-001)
- [ ] Yeni bir kullanıcı kaydı aç (`/login` -> "Yeni hesap oluştur").
- [ ] Durumu henüz `pending` iken tarayıcı konsolundan `supabase.rpc('book_event', ...)` çağrısı yap.
- [ ] **Beklenen:** İşlem `42501` yetki hatası ile reddedilmeli, rezervasyon oluşmamalıdır.
- [ ] Yönetici panelinden (`/admin`) hesabı onayla.
- [ ] Tekrar rezervasyon yap.
- [ ] **Beklenen:** Rezervasyon başarıyla oluşmalıdır.

### 3.2. Etkinlik Yaşam Döngüsü ve İptal Senaryosu (BUG-001 & BUG-002)
- [ ] Bir etkinlik oluştur ve kullanıcı hesabı ile rezervasyon yap.
- [ ] Yönetici panelinden etkinliğin durumunu `cancelled` (İptal Edildi) olarak güncelle.
- [ ] Kullanıcı hesabında çan simgesindeki bildirimi kontrol et.
- [ ] Bildirim linkine (`/events/:id`) tıkla.
- [ ] **Beklenen:** Sayfa "Etkinlik bulunamadı" hatası vermemeli, etkinliğin iptal edildiğini açıkça göstermelidir.
- [ ] Kullanıcının `/my-bookings` sayfasına git.
- [ ] **Beklenen:** Rezervasyon kaybolmamalı, "Etkinlik iptal edildi" rozetiyle görünmelidir.
- [ ] İptal edilmiş veya tarihi geçmiş bir etkinliğe doğrudan `book_event` RPC'si çağır.
- [ ] **Beklenen:** "Bu etkinlik şu anda rezervasyona açık değildir" hatası dönmelidir.

### 3.3. Eşzamanlılık ve Kapasite Sınır Testi
- [ ] Kontenjanı 1 olan bir etkinlik oluştur.
- [ ] İki farklı tarayıcı/kullanıcı oturumunda aynı anda "Rezervasyon Yap" butonuna bas.
- [ ] **Beklenen:** Kullanıcılardan biri onay almalı, diğeri ise "Bu etkinlik tamamen dolu" hatası almalıdır. `events.booked_count` kesinlikle 1 olmalı, kapasite aşılmamalıdır.

### 3.4. Destek Sohbeti ve Ses Kontrolü (BUG-004)
- [ ] Kullanıcı olarak yeni bir destek talebi oluştur (`/profile?tab=support`).
- [ ] Bir mesaj yaz ve "Gönder" butonuna bas.
- [ ] **Beklenen:** Kendi gönderdiğin mesajda bildirim sesi çalmamalıdır.
- [ ] Yönetici hesabından (`/admin/tickets`) mesaja cevap yaz.
- [ ] **Beklenen:** Kullanıcı tarafında çan bildirimi gelmeli ve ses çalmalıdır.

### 3.5. Derleme ve CI Sağlığı (BUG-005 & ARCH-002)
- [ ] `npm run lint` komutunu çalıştır.
- [ ] **Beklenen:** 0 hata ile başarıyla tamamlanmalıdır.
- [ ] `npm run build` komutunu çalıştır.
- [ ] **Beklenen:** `React.lazy` sonrası ana chunk boyutu 500 kB altına inmelidir.
