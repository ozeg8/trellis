# GitHub'a yükleme

1. `trellis-github-ready.zip` dosyasını ayrı bir klasöre çıkartın.
2. GitHub'da yeni bir repository oluşturun.
3. **Add file → Upload files** ile çıkarttığınız klasörün içindeki dosyaları ve
   klasörleri yükleyin. ZIP dosyasının kendisini yüklemeyin. `.gitignore`
   dosyasının da yüklendiğini kontrol edin.
4. **Commit changes** ile kaydedin.

Paket yalnızca `PUBLISH_FILES.txt` içindeki kaynak dosyaları içerir.
Kişisel panolar, `.data`, yedekler, loglar, ekran görüntüleri, tarayıcı oturumları
ve kurulu paketler dahil değildir. Kullandığınız proje klasörünü sonradan topluca
yüklemeyin; `.gitignore` elle yapılan yüklemelerde kişisel dosyaları engellemez.

## Yerelde açma

Güncel güvenlik yamalarını içeren, desteklenen bir Node.js LTS sürümü kurun.
Resmî sürüm durumu: https://nodejs.org/en/about/previous-releases

Windows'ta önce `start.cmd` dosyasını çalıştırın ve sunucu penceresini açık tutun.
Ardından **Yerel uygulama.url** kısayoluna çift tıklayın.
Kısayol `http://127.0.0.1:4173/` adresini varsayılan tarayıcıda açar;
sunucuyu kendisi başlatmaz. Windows internet kısayolunu açmazsa adresi
tarayıcıya doğrudan yazabilirsiniz.

Terminalden başlatmak için `node server.mjs`, testler için
`node --test server.test.mjs` kullanabilirsiniz. Bağımlılık kurulumu gerekmez.

## Yayınlama sınırı

GitHub'a yüklemek kaynak kodunu paylaşır. Bu uygulama Node.js sunucusu ve yerel
veri dosyası kullandığından GitHub Pages üzerinde doğrudan çalışmaz.
Sunucu yalnızca bu bilgisayardaki `127.0.0.1` adresini dinler.
İnternete açık çok kullanıcılı barındırma için hazırlanmış değildir.

Lisans henüz seçilmemiştir; kaynak kodunun herkese açık olması tek başına
yeniden kullanım izni vermez.
