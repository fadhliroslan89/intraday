# KuCoin Daily Radar 5–6% — Website V1.5

Website PC/mobile untuk **pemantauan peluang dan paper trading**, bukan bot order atau jaminan keuntungan 5–6% sehari. Kekalkan URL Render dan repo GitHub `intraday` sedia ada.

## Perubahan V1.5 — Opportunity Quality Filter

- **Stablecoin/pegged exclusion** (`opportunity.js`): mengecualikan USDC, DAI, USDE, USDT, FDUSD, PYUSD, dan beberapa aset berpatok daripada shortlist *candle analysis* dan semua senarai peluang. Pasangan ini masih boleh wujud dalam jumlah ticker KuCoin keseluruhan.
- **Qualified Watch** memerlukan semua ini: 15m candle sah/segar, Radar Score ≥45, RVOL ≥1.15x, ADX ≥20, range 24h ≥4%, volume 24h ≥USDT 5 juta, spread ≤0.55%, tiada OVEREXTENDED atau FALSE BREAKOUT dan setup timing yang dikenali. `WATCH RESISTANCE` memerlukan jarak breakout 0–2.5%. Ini **heuristik**, bukan ukuran probabiliti menang.
- **Ditapis Keluar** ialah senarai audit, berasingan daripada peluang. Sebab gagal ditunjukkan, termasuk volume lemah, ADX rendah, range kecil dan sebagainya. Sekiranya tiada coin lulus, panel Qualified Watch boleh kosong. Tidak dilonggarkan semata-mata untuk muncul signal.
- Signal BUY rasmi kekal pada syarat ketat V1.4 (EMA/RSI/ADX/RVOL/breakout, dll). Near BUY, Early Breakout, False Breakout, Anti-FOMO, Coin Intelligence, Trading Journal manual dan paparan responsif dikekalkan.

## Signal Performance — TP bersih anggaran

- Tracker terus memerhati BUY yang benar-benar diambil semasa scan candle 15m tertutup, **bukan backtest sejarah**. Tiada order dihantar dan tiada rekod fill/broker sebenar.
- Dua kadar pergerakan **kasar** (+5%/+6%) dikekalkan dan dua penilaian **net anggaran** ditambah. Anggapan mula-mula: 0.10% fee + 0.10% slippage **setiap side** (boleh disunting pada `COST` dalam `signal-tracker.js`).
- TP bersih +5% memerlukan kira-kira **+5.42%** pergerakan harga kasar; TP bersih +6% kira-kira **+6.42%**. SL harga kasar −2% menyebabkan kira-kira −2.39% bersih selepas kos (mengikut model kos ini). Ini hanyalah anggaran; spread, liquidity, order fill, fee sebenar dan turun naik slippage tidak dimodelkan.
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
