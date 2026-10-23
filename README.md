# Diagnostics update V1.7.3

V1.7.3 menambah panel **Kenapa belum FINAL READY?** (dibuka bila perlu) untuk mengenal pasti syarat BUY yang paling kerap tidak lulus dalam snapshot semasa. **BUY, Telegram, TP4/TP6, SQL history dan semua gate lama tidak diubah.** Ini bukan analisis sejarah 24 jam. Baca `DIAGNOSIS-NO-SIGNAL.md`.

# KuCoin Daily Radar 4–6% — Website V1.7.3

Website PC/mobile untuk **pemantauan peluang dan paper trading**, bukan bot order atau jaminan keuntungan 4–6% sehari. Kekalkan URL Render dan repo GitHub `intraday` sedia ada.


## Perubahan utama V1.7.3 — Target 4–6%

TP1: **+4% bersih anggaran**; TP2: **+6% bersih anggaran**. Syarat kelayakan BUY tidak diubah (termasuk 24h range ≥5% untuk signal rasmi). Semua harga TP1 diperbaharui dalam BUY Signal Center, Coin Intelligence, Trading Journal serta Telegram FINAL READY. Simpanan Neon PostgreSQL dan pairing Telegram kekal. Rekod lama TP5 ditanda LEGACY, tidak dikira sebagai TP4.

**Cara update:** Backup jurnal JSON → extract ZIP ini → upload SEMUA isi ke root GitHub `intraday` branch `main` → commit → semak Render Live → refresh app Android / PC sehingga label V1.7.3 muncul. Jangan ubah atau hantar token Telegram/Neon.

## V1.7 — Telegram FINAL READY alert (berasingan daripada notifikasi browser)

**Tiada order automatik.** Telegram hanya diberitahu apabila server sendiri mengira status `READY` menggunakan modul yang sama dengan BUY Signal Center (`public/signal-center-model.js`): BUY rasmi, candle 15m telah tutup dan masih segar, harga live dalam zon anti-chase, tiada False Breakout/Anti-FOMO dan timing risk bukan HIGH.

- Integrasi baharu: `telegram-alert.js`, halaman status di BUY Signal Center, dan ujian `test/telegram.test.js`. Semua fungsi V1.6 dan Neon kekal.
- Telegram Bot API secara server-side (`sendMessage`, `getUpdates`); token/kod pairing **hanya** berada dalam Render Environment dan tidak dipulangkan oleh endpoint website.
- Pairing mudah: bot `/start KOD_PAIRING` daripada Telegram peribadi, Chat ID disimpan di **PostgreSQL Neon**. Sesuai untuk satu chat Telegram sahaja. `/test` ialah mesej ujian, **bukan signal BUY**; `/status` memeriksa pairing.
- Dedup: `symbol + timestamp candle 15m` disimpan sebagai kunci unik di PostgreSQL; satu alert per coin/candle dengan pemprosesan atomik. Gagal hantar boleh dicuba sehingga 3 kali **hanya apabila READY masih wujud**. Dalam kes jarang berlaku apabila Telegram sudah terima tetapi DB gagal mengesahkan penghantaran, alert boleh berulang; ini best effort, bukan jaminan tepat sekali.
- Butiran mesej: symbol, masa candle MYT, harga ticker semasa ketika scan, zon rujukan, TP1 +4%/TP2 +6% bersih anggaran selepas model kos, SL −2% kasar, skor, RVOL/ADX, pautan dashboard dan amaran risiko.
- Tidak memerlukan webhooks atau mendedahkan endpoint rahsia; Render Free mesti **aktif** untuk poll Telegram dan scan KuCoin. Boleh terlepas signal ketika sleep/restart. Analisis candle tertakluk kepada shortlist hingga 52 coin, bukan seluruh pasaran.
- Jika token/kod belum diisi atau Neon terputus, server terus berfungsi untuk dashboard tetapi alert **gagal secara selamat (fail closed)**; tiada penghantaran tanpa storage dedup yang boleh dipercayai.

**Setup langkah demi langkah:** rujuk [`SETUP-TELEGRAM.md`](SETUP-TELEGRAM.md).

## Cara update daripada V1.6

1. Download ZIP versi terkini dan extract. Backup JSON Trading Journal melalui website dahulu.
2. GitHub `fadhliroslan89/intraday` → branch `main` → Add file → Upload files. Upload **isi folder**, bukan ZIP sahaja, ganti fail lama dan tambah `telegram-alert.js`, `test/telegram.test.js` serta `SETUP-TELEGRAM.md`.
3. Commit. Tunggu Render `intraday` deploy terbaru `Live`. URL website kekal sama, dan `DATABASE_URL` Neon kekal digunakan.
4. Buat bot melalui BotFather, tambah `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_PAIR_CODE` dalam Render → Environment. Simpan dan deploy. Jangan letak kedua-duanya dalam GitHub.
5. Dari Telegram, buka bot sendiri dan hantar `/start <kod pairing>` kemudian `/test`. Website patut memaparkan **TELEGRAM · AKTIF**. Status Telegram hanya akan aktif apabila token benar, Neon bersambung dan akaun telah dipasangkan.

**Ujian lokal**: `npm test`. Browser diuji dengan data simulasi; **penghantaran live ke Telegram/Neon daripada persekitaran ujian ini tidak dapat disahkan**. Semak `/test` sendiri selepas deploy.

---

## V1.6 — BUY Signal Center (satu panel utama)

Versi ini **mengekalkan sepenuhnya** engine KuCoin V1.5, PostgreSQL Neon, signal tracker, journal manual dan peraturan BUY; ia menambah satu panel utama sahaja serta modul pembentangan keputusan (`public/signal-center-model.js`).

- Website bermula dengan **BUY Signal Center**. Senarai sebelah kiri boleh dipilih (mobile: swipe ke kiri/kanan); butiran sebelah kanan/bawah menunjukkan harga live, masa candle, skor, RVOL, ADX/RSI, pengesahan trend 1H, zon harga dan sebab status.
- **READY** hanya jika sumber server mempunyai status `BUY` rasmi, candle segar/confirmed, tiada Anti-FOMO/false breakout, harga live dalam zon anti-chase dan timing tidak HIGH/NO_DATA/WAIT. Sebarang masalah menjadikannya WAIT / AVOID / OFFLINE. Ini **penapis tambahan pada paparan**, bukan pengubahan atau penghasilan signal BUY.
- **WAIT** ialah calon Early / Near Buy / Watch / Qualified Watch yang belum layak. **AVOID** ialah coin bermasalah atau lemah menurut syarat semasa. Apabila tiada calon, panel akan paparkan *tiada setup* — tidak mencipta BUY palsu.
- TP1 +4% bersih / TP2 +6% bersih dan SL −2% kasar ditunjukkan **hanya apabila READY**, dikira dengan harga ticker live sebagai **simulasi rujukan**, bukan fill/entry sebenar. Kos menggunakan model tracker 0.10% fee + 0.10% slippage per sisi. TP kosong semasa WAIT/AVOID.
- Footer ringkas dalam panel memaparkan jumlah rekod BUY yang diperhatikan, kadar TP4 bersih jika ada data sah, dan status database.
- Semua panel lama (Top Opportunity, Near BUY, Early Breakout, Entry Timing, Signal Performance, Full Market Screener) dipindahkan ke seksyen **Buka analisis terperinci & panel lama** yang tertutup secara lalai. **Trading Journal** dan **Panduan** kekal pada tab atas.

### Cara update daripada V1.5

1. Sebagai langkah berjaga-jaga, lakukan Trading Journal → **Backup JSON** dahulu.
2. Extract `KuCoin_Daily_Radar_Website_v1.6.zip` dan upload **semua fail & folder kandungannya** ke root repository GitHub `intraday` di branch `main`, menimpa versi sebelumnya. Jangan upload ZIP sahaja.
3. Fail penting baharu ialah `public/signal-center-model.js`, bersama `public/app.js`, `public/index.html`, `public/styles.css`, `test/signal-center.test.js` yang dikemas kini. Pastikan file baharu berada dalam `public/` tepat seperti susunan ZIP.
4. Render auto deploy jika diaktifkan. Jika tidak, **Manual Deploy → Deploy latest commit**. URL Render dan pemboleh ubah `DATABASE_URL` di Render kekal; jangan isi rahsia dalam GitHub.
5. Refresh website dan pastikan label **V1.6** serta **BUY Signal Center** muncul. Semak status database & satu coin WATCH/READY pada paparan sebenar. Data KuCoin live dan Neon tidak boleh disahkan dalam ujian offline kami.

### Perkara penting

Website **bukan bot auto-buy**. READY tidak menjamin untung; harga live berubah dan sasaran kasar/bersih berbeza. Statistik Signal Performance ialah pengamatan signal dari imbasan server, bukan prestasi transaksi pengguna. Render Free boleh tidur dan terlepas peluang. Kami menguji unit + browser **dengan data simulasi**, bukan kadar kejayaan pasaran sebenar.

---

## Perubahan V1.5 — Opportunity Quality Filter

- **Stablecoin/pegged exclusion** (`opportunity.js`): mengecualikan USDC, DAI, USDE, USDT, FDUSD, PYUSD, dan beberapa aset berpatok daripada shortlist *candle analysis* dan semua senarai peluang. Pasangan ini masih boleh wujud dalam jumlah ticker KuCoin keseluruhan.
- **Qualified Watch** memerlukan semua ini: 15m candle sah/segar, Radar Score ≥45, RVOL ≥1.15x, ADX ≥20, range 24h ≥4%, volume 24h ≥USDT 5 juta, spread ≤0.55%, tiada OVEREXTENDED atau FALSE BREAKOUT dan setup timing yang dikenali. `WATCH RESISTANCE` memerlukan jarak breakout 0–2.5%. Ini **heuristik**, bukan ukuran probabiliti menang.
- **Ditapis Keluar** ialah senarai audit, berasingan daripada peluang. Sebab gagal ditunjukkan, termasuk volume lemah, ADX rendah, range kecil dan sebagainya. Sekiranya tiada coin lulus, panel Qualified Watch boleh kosong. Tidak dilonggarkan semata-mata untuk muncul signal.
- Signal BUY rasmi kekal pada syarat ketat V1.4 (EMA/RSI/ADX/RVOL/breakout, dll). Near BUY, Early Breakout, False Breakout, Anti-FOMO, Coin Intelligence, Trading Journal manual dan paparan responsif dikekalkan.

## Signal Performance — TP bersih anggaran

- Tracker terus memerhati BUY yang benar-benar diambil semasa scan candle 15m tertutup, **bukan backtest sejarah**. Tiada order dihantar dan tiada rekod fill/broker sebenar.
- Dua kadar pergerakan **kasar** (+4%/+6%) dikekalkan dan dua penilaian **net anggaran** ditambah. Anggapan mula-mula: 0.10% fee + 0.10% slippage **setiap side** (boleh disunting pada `COST` dalam `signal-tracker.js`).
- TP bersih +4% memerlukan kira-kira **+4.42%** pergerakan harga kasar; TP bersih +6% kira-kira **+6.42%**. SL harga kasar −2% menyebabkan kira-kira −2.39% bersih selepas kos (mengikut model kos ini). Ini hanyalah anggaran; spread, liquidity, order fill, fee sebenar dan turun naik slippage tidak dimodelkan.
- TP dan SL dalam candle sama dianggap `AMBIGUOUS` dan dikecualikan daripada kadar hit. Kegagalan sambungan candle dianggap `INCOMPLETE`, bukan kemenangan. `EXPIRED` selepas 24h tanpa sentuh TP/SL menggunakan bar lengkap; hanya `WIN`/`LOSS` untuk kadar hit dipaparkan. Histori terhad kepada 2000 signal terbaharu (anti-duplicate by candle).

## Simpanan sejarah signal: pilihan PostgreSQL

**PENTING: tanpa DATABASE_URL, `Signal Performance` kekal MEMORY ONLY dan akan hilang jika Render Free tidur/restart.** Render Free mempunyai filesystem sementara; SQLite/local JSON **tidak** menyelesaikan masalah ini. Fungsi persistent direka dan diuji dengan fake database, tetapi sambungan PostgreSQL sebenar belum dapat diuji dalam persekitaran ini.

Untuk simpan rekod secara kekal merentas restart:

1. Bina pangkalan data **Neon PostgreSQL** di https://console.neon.tech/ (atau servis PostgreSQL luaran yang menyokong TLS). Pastikan terma, kuota dan status langganan mengikut akaun anda.
2. Dalam Neon Console pilih project → **Connect**, salin Postgres connection string `postgresql://...?...sslmode=require`. **JANGAN** tampal rahsia ini ke chat atau GitHub.
3. Buka Render Dashboard → pilih Web Service `intraday` → **Environment** → **Add Environment Variable**:
   - KEY: `DATABASE_URL`
   - VALUE: connection string PostgreSQL sebenar daripada Neon
4. Simpan perubahan; Render akan deploy/restart service jika dikonfigurasi begitu. Database table `radar_signal_state` dibuat oleh server apabila sambungan berjaya.
5. Buka website → **Signal performance tracker**. Status **PERSISTENT · DATABASE CONNECTED** bermakna sambungan aktif; status **MEMORY ONLY** bermakna rekod belum tersimpan kekal.
6. Jika masalah, semak Render Logs. Jangan kongsi connection string. Simpan backup pada penyedia database kerana tiada jaminan kekal selama-lamanya jika projek/plan DB tamat atau dipadam.

Tracker menggunakan satu JSONB row dalam PostgreSQL; akses database hanya dari Node server. Ini untuk deployment **single-instance** seperti Render Free, bukan sistem trading berbilang worker serentak. Data tidak diselaraskan dengan jurnal paper trade tempatan (browser localStorage). Sejarah **sebelum V1.5** yang hilang semasa restart tidak boleh dipulihkan secara automatik.

## Update GitHub + Render

1. Eksport **Trading Journal → Backup JSON** pada website lama terlebih dahulu.
2. Extract ZIP V1.5. Upload **SEMUA ISI** folder ke root repo `https://github.com/fadhliroslan89/intraday`, branch `main`. Jangan upload ZIP sebagai satu fail atau buat folder `v1.5` yang menyebabkan `package.json` tiada di root.
3. Fail baharu: `opportunity.js`, `signal-store.js`. Fail kemas kini: `server.js`, `market.js`, `analytics.js`, `signal-tracker.js`, `package.json`, `public/` dan `test/`.
4. Commit changes. Render auto-deploy jika diaktifkan, atau Manual Deploy → Deploy latest commit.
5. Semak website `https://intraday-t1ln.onrender.com` dan label **V1.5**. Tab baharu: **Qualified Watch** dan **Ditapis Keluar**.
6. **Pilihan:** sambungkan PostgreSQL seperti arahan di atas untuk status PERSISTENT. Website tanpa DB masih berfungsi, tetapi rekod auto-signal tetap sementara.

Jika mahu uji secara lokal (Node.js 20+):

```sh
npm install
npm test
npm start
```

Tanpa database, log mungkin memberitahu scanner gagal hubungi KuCoin jika akses API di rangkaian tempatan disekat. Dalam keadaan itu website tidak patut menganggap harga/signal offline sebagai live.


## Android Install / PWA V1.7.3

Daily Radar kini mempunyai `public/manifest.webmanifest`, ikon PNG 192/512px, service worker (`public/sw.js`) dan halaman offline. Selepas deploy GitHub → Render, buka website melalui Chrome di Android, pilih menu tiga titik → **Add to Home screen → Install**, atau klik **Pasang App** apabila butang tersedia. Jika tab masih menunjukkan V1.6/V1.7, deployment belum terkini atau browser masih menyimpan sesi lama.

**Penting:** Service worker tidak menyimpan harga, signal, API atau data dagangan. Ia hanya menyediakan halaman penerangan ketika offline, bukan scanner offline. Telegram masih memerlukan server Render aktif. Tiada APK yang diperlukan. Tidak perlu ubah DATABASE_URL/TELEGRAM_BOT_TOKEN.

## V1.7.3 — Migrasi target TP1 5% → 4%

- TP1 4% **bersih anggaran** selepas kos 0.10% fee + 0.10% slippage setiap sisi; TP2 kekal 6%, SL kekal −2% kasar.
- **Penapis BUY, scoring, volatility, range 24h ≥5%, dan pemilihan shortlist 52 coin tidak dilonggarkan.**
- Rekod signal baharu menyimpan `target1Pct:4` serta `outcome4/outcome4Net`. Rekod terdahulu tanpa `target1Pct` terus dikendalikan sebagai `target1Pct:5` (LEGACY). **Kadar TP4 hanya menggunakan rekod baharu**, bukan rekod 5% lama; TP6 masih boleh dinilai untuk kedua-dua generasi.
- PostgreSQL Neon dan Telegram pairing sedia ada kekal, **tidak perlu cipta semula bot**. Alert lama bagi candle sama tidak dihantar semula.
- Selepas deploy semak Telegram `/test` dan Signal Center. Tiada jaminan kenaikan 4–6% dalam sehari.
