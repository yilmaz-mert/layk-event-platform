# scripts/

Demo verisini ve etkinlik görsellerini bakımı için kullanılan yerel betikler. Hiçbiri build/deploy'un parçası değildir.
Veritabanına yazan betikler service-role anahtarı ister; anahtar yalnızca yerel `.env.local` dosyasında durur
(`*.local` git'te yok sayılır). Hiçbir betikte sabit proje/anahtar yoktur — ortamı açıkça verin:

```bash
node --env-file=.env.local scripts/<betik>.js
```

## Dosya sınıflandırması

| Dosya | Sınıf | Açıklama |
| :--- | :--- | :--- |
| `refresh-demo-data.js` | **Bakım kaynağı — tutulur** | Demo etkinlik tarihlerini referans güne göre kaydırır; önce yedek + rollback SQL üretir, veritabanına **yazar**. `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (veya `--supabase-url` / `--service-key`) gerekir. |
| `refresh-demo-data.test.js` | **Bakım kaynağı — tutulur** | Saf planlama fonksiyonlarının testi (7 test): `node scripts/refresh-demo-data.test.js` |
| `upload-event-images.js` | **Bakım kaynağı — tutulur** | `EVENT_IMAGES_DIR` klasöründeki görselleri etkinlik başlıklarıyla eşleyip `event-banners` bucket'ına yükler ve `image_url` günceller; önce `backups/` altına yedek yazar. Service-role anahtarı gerekir. |
| `upload-event-images.test.js` | **Bakım kaynağı — tutulur** | Başlık normalizasyonu / eşleme testi (4 test) |
| `verify-image-urls.js` | **Bakım kaynağı — tutulur** | Salt okunur: canlı etkinliklerin `image_url` değerlerini listeler (anon anahtar yeter). |
| `inspect-detected-users.sql` | **Bakım sorgusu — tutulur** | Salt okunur denetim sorgusu; dosyada veri yoktur, ama çalıştırıldığında kullanıcı e-postaları döner — çıktısını repoya koymayın. |
| `refresh-demo-data.sql` | **Eski operasyon çıktısı** | 2026-09-23 referans günlü yenilemenin üretilmiş SQL'i (uygulanmış). Yeniden kullanılmaz; betik her çalışmada yenisini üretir. Teslimden önce kaldırılabilir. |
| `rollback-demo-data.sql` | **Rollback — yerelde saklayın** | `demo_refresh_20260922210342` snapshot'ını geri alır. Demo verisi bu snapshot'a dönme ihtimali kalmayana kadar tutun; repoya alınması zorunlu değildir. |
| `update-event-images.sql` | **Eski operasyon çıktısı** | Uygulanmış görsel URL güncellemesi; demo projeye özgü Storage URL'leri içerir. |
| `rollback-event-images.sql` | **Rollback — yerelde saklayın** | Görsel URL'lerini önceki değerlere döndürür. **Dikkat:** bu URL'lerin gösterdiği eski dosyalar Storage'dan silinirse rollback bozulur; bu yüzden admin formu değiştirilen banner'ları silmez. |
| `backups/*.json` | **Yerel çıktı — git'te yok sayılır** | Betiklerin işlem öncesi snapshot'ları (`demo_refresh_*`, `image_urls_backup_*`). Rollback için gerekli olabilir; silmeyin, repoya eklemeyin. |

Veri içeriği kontrolü (2026-09-29): betik ve SQL dosyalarında gizli anahtar yok; `refresh-demo-data.js` içindeki
e-postalar `example.com` seed hesaplarıdır. `update-/rollback-event-images.sql` demo Supabase projesinin herkese açık
Storage URL'lerini içerir.

## Hangi dosyalar repoya girmeli?

Öneri: bakım kaynakları (`*.js`, `*.test.js`, `inspect-detected-users.sql`, bu README) izlenebilir.
Eski operasyon çıktıları ve rollback SQL'leri projeye özgü olduğu için yerelde tutulmalı veya teslimde ayrıca arşivlenmelidir.
Bu karar sahibindir; dosyalar bu turda stage edilmedi veya silinmedi.
