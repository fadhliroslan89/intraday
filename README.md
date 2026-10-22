# KUCOIN DAILY RADAR 5–6% — Website V1.3

Website responsive untuk PC / telefon, menggunakan KuCoin Spot USDT Public API. Memantau ticker, mengira setup berdasarkan candle **15 minit yang sudah tutup** dan trend 1 jam. **Tidak ada trade automatik atau API key.** Sasaran 5–6% ialah sasaran *setiap posisi*, bukan pulangan yang boleh dijamin.

## Kemas kini daripada V1.2 ke V1.3

1. Panel **EARLY BREAKOUT RADAR** di bawah Near BUY, atas Full Market Screen.
2. Bandingkan purata turnover tiga candle 15m terbaru yang sudah tutup dengan tiga candle sebelumnya untuk **Volume Acceleration**, selain Relative Volume 20 candle.
3. **EARLY BREAKOUT** memerlukan gap breakout 20 candle antara 0% hingga 2.5%, Relative Volume sekurang-kurangnya 1.3x, acceleration sekurang-kurangnya 1.1x, trend pada sekurang-kurangnya satu timeframe, score ≥40, liquidity yang cukup serta candle segar. Ia **bukan BUY**.
4. **BUILDING** = momentum atau proximity diperhatikan tetapi belum cukup kriteria EARLY BREAKOUT; bukan BUY.
5. **Anti-FOMO** menandakan **OVEREXTENDED** jika harga naik ≥25% dalam 24 jam, harga ≥6% di atas EMA20 15m, momentum 45m ≥8% atau RSI ≥76. Calon tersebut dikeluarkan daripada Near BUY, Early Breakout dan status BUY/WATCH apabila snap data live diperiksa. Diletakkan dalam tab amaran `Overextended` supaya jelas mengapa ditolak.
6. **CAUTION** untuk +12% dalam 24 jam, ≥3.5% daripada EMA20, momentum 45m >5%, RSI >71 atau harga live di atas zon candle; masih boleh ditunjuk dengan amaran, bergantung pada syarat lain.
7. **QUALITY RANK** ialah ranking heuristik gabungan score, gap, RVOL, acceleration, ADX, trend dan liquidity. Ini **bukan probabiliti menang**, dan **tidak menggantikan BUY score**.
8. Modal Coin Intelligence memaparkan amaran risiko, pecutan volume, jarak breakout dan TP/SL rujukan asal serta kalkulator TP bersih berdasarkan entry paper trade sebenar.

Penapis BUY V1.1 (breakout candle tertutup, EMA, ADX ≥22, RVOL ≥1.5, score ≥80 dan zon harga) **dikekalkan**, dengan blok anti-FOMO tambahan. Tab Near BUY V1.2, Trading Journal, favorited coins, pengiraan fee, export CSV / JSON serta fungsi import **dikekalkan**.

## Cara update website sedia ada (`intraday`)

1. Muat turun ZIP V1.3 dan **extract**.
2. Buka repository GitHub `fadhliroslan89/intraday`, branch `main`.
3. `Add file → Upload files`, pilih semua **isi folder** yang diextract (`server.js`, `market.js`, `analytics.js`, `package.json`, `README.md`, `public/`, `test/`). Pastikan `package.json` berada di root. Gantikan fail lama yang sama nama, kemudian **Commit changes**.
4. Render `intraday` biasanya auto-deploy; jika tidak, `Manual Deploy → Deploy latest commit`. Tidak perlu mencipta servis atau alamat baharu.
5. Buka `https://intraday-t1ln.onrender.com` dan hard refresh (`Ctrl+Shift+R` atau `Cmd+Shift+R`). Pastikan label **V1.3** dan panel **Early Breakout radar** kelihatan.
6. Semak amaran LIVE DATA / offline. **Deploy yang berjaya sahaja belum membuktikan data KuCoin tepat.** Bandingkan beberapa harga dengan KuCoin / TradingView sebelum paper trade.

Jika upload melalui laman GitHub tidak membenarkan anda menggantikan fail dengan drag-and-drop secara mudah, gunakan GitHub desktop/CLI untuk commit fail yang diubah atau buang fail lama sebelum memuat naik; jangan letak isi folder di dalam satu subfolder tambahan.

## Jalankan di komputer

- Node.js 20+ diperlukan.

```bash
npm install
npm test
npm start
```

Buka `http://localhost:3000`; di Render `npm start` menggunakan `process.env.PORT`.

## API dan pengehadan

- Harga KuCoin `GET /api/v1/market/allTickers`, metadata `/api/v2/symbols` setiap 6 jam, dan candle `/api/v1/market/candles` 15m / 1h.
- Harga refresh 30 saat dan scan candle setiap 120 saat. Shortlist dinamik sehingga **52 pasangan/pusingan**, **bukan** semua 813 pasaran diteliti secara teknikal pada setiap pusingan. Bilangan sebenar berubah.
- API awam KuCoin, hosting dan rate-limit mungkin mempengaruhi freshness. Tiada data pasaran direka semasa API gagal. Website Render Free boleh tidur ketika tiada aktiviti; tiada jaminan scan berterusan / notifikasi ketika tab ditutup.
- Jurnal disimpan dalam **localStorage per-browser**, bukan cloud sync. Backup JSON/import untuk pindah ke PC / mobile. Update website tidak sengaja memadam jurnal, tetapi mengosongkan storage browser boleh memadamnya: eksport backup dulu.
- Tiada backtest sistematik, tiada angka win-rate yang diverifikasi. Semua threshold cuma hipotesis awal yang perlu diuji melalui paper trading dengan fee, spread, slippage dan risiko sebenar.

## Ujian

`npm test` menjalankan ujian indikator, expiry, readiness, anti-chase, klasifikasi anti-FOMO, shortlist, volume acceleration dan pengiraan fee. UI desktop/mobile juga telah diuji menggunakan **fixture data simulasi** (bukan sambungan live KuCoin).
