# KuCoin Daily Radar 5–6% — Website V1.4

Website responsive PC/Android untuk memantau KuCoin Spot/USDT. **Pemantauan dan paper trading sahaja**. Tiada API key, order automatik, leverage atau janji pulangan.

## Tambahan V1.4

### Smart Entry Timing & False Breakout
- `timing.js` menggunakan candle **15 minit yang sudah lengkap/ditutup** sahaja.
- **FALSE BREAKOUT**: breakout sebelumnya telah kembali ditutup di bawah paras lama, atau candle semasa menembusi resistance tetapi ditolak dan ditutup di bawah paras (upper wick dominan). Ia menyekat BUY yang mungkin muncul pada snapshot lama dan dikecualikan daripada senarai entry awal.
- **PULLBACK WATCH**: selepas breakout tertutup dalam lima candle terdahulu, candle semasa menguji kawasan rujukan, kemudian ditutup di atasnya. Ia *bukan BUY*.
- **CONFIRMED BREAKOUT**: close lebih tinggi daripada 20-candle resistance sebanyak 0.1%, badan candle >=45% julat dan close di 30% atas julat. Label timing ini *bukan* jaminan signal BUY rasmi, yang masih memerlukan semua syarat ketat lain.
- **WAIT RETEST / WATCH RESISTANCE**: kandidat untuk pemantauan sahaja.
- **Zon rujukan ATR14**: dari 20-candle resistance hingga resistance + min(0.5 ATR, 0.8% paras resistance). Zon tidak dikeluarkan untuk false breakout/overextended dan **bukan limit order atau harga entry yang dijamin**. Bacaan `LIVE DALAM ZON` bukan arahan membeli.
- **Risk LOW/MEDIUM/HIGH** ialah label risiko relatif kepada heuristik harga/volume/spread; LOW **tidak bermaksud selamat**.
- `Technical/Radar Score` dan label risiko ditunjukkan secara berasingan.

### Signal Performance Tracker
- `signal-tracker.js` mengesan BUY rasmi **yang sempat dicatat server** semasa scan, selepas close 15 minit, dan menilai pergerakan OHLC 15 minit **selepas** masa signal.
- `TP+5%` dan `TP+6%` ialah sasaran **harga kasar**, setiap satu dikira berasingan; `SL−2%` ialah paras harga kasar, tempoh pemerhatian maksimum 24 jam.
- `WIN`, `LOSS`, `AMBIGUOUS` (TP dan SL dalam candle sama), `INCOMPLETE` (candle hilang), `EXPIRED` (24 jam tiada TP/SL), `PENDING` (belum cukup data). Hanya WIN dan LOSS termasuk dalam kadar *hit rate* dipaparkan.
- Status hasil bukan simulasi pelaksanaan order, tidak termasuk yuran, slippage, bid/ask, taker fill, dan bukan backtest sejarah. Boleh terlepas signal di luar shortlist maksimum 52 coin.
- **Rekod tracker RAM sahaja**, tidak dipersist; data akan hilang apabila Render restart/spin-down. Jangan gunakan sebagai rekod prestasi jangka panjang. Trading Journal manual tetap tersimpan dalam localStorage browser dan tidak disegerakkan antara peranti.

### Fungsi V1.0–V1.3 dikekalkan
- Semua ticker USDT via API awam KuCoin, harga refresh 30s, shortlist candle 15m/1h (sehingga 52 coin/scan) setiap 2 minit semasa proses server aktif.
- BUY/WATCH/WAIT; EMA20/EMA50/EMA200, RSI, ADX, RVOL, breakout 20 candle.
- Anti-chase, Anti-FOMO OVEREXTENDED, Near BUY / Early Momentum, Early Breakout.
- Dashboard PC/mobile, paparan coin lengkap, kalkulator TP bersih selepas fee berdasarkan entry **manual**, Trading Journal dengan export CSV, backup/import JSON.

## Deployment GitHub + Render (service yang sama)
1. **Backup dahulu** Trading Journal di website lama: buka Trading Journal → Backup JSON.
2. Extract ZIP dan upload **isi** folder ke root repository `fadhliroslan89/intraday` pada branch `main`, termasuk `public/`, `test/`, `timing.js`, `signal-tracker.js`, `server.js`, `analytics.js`, `market.js`, `package.json`, `README.md`.
3. Jika GitHub minta, overwrite fail yang sama nama; pastikan folder `public/` kekal di root dan `package.json` tidak berada dalam subfolder tambahan.
4. Commit changes. Jika Render Auto Deploy hidup, tunggu status **Live** untuk commit baharu; jika tidak, pilih Manual Deploy → Deploy latest commit.
5. Semak https://intraday-t1ln.onrender.com dan label V1.4. Hard refresh jika browser simpan cache.
6. Semak bahagian Smart Entry Timing dan Signal Performance. Tracker kosong pada awalnya adalah normal kerana tidak ada signal BUY dicatat sejak server mula.

Render Free tidak menyediakan proses 24/7 kerana instance boleh tidur/restart. Sekiranya sambungan KuCoin gagal, dashboard menandakan data offline dan tidak menjana signal daripada data rekaan.

## Fail penting
- `server.js` — HTTP server (Node 20+).
- `market.js` — akses KuCoin, cache, candidate selection, snapshot, tracker.
- `analytics.js` — analisis EMA/RSI/ADX, BUY/WATCH, Anti-FOMO, Near BUY.
- `timing.js` — klasifikasi setup candle & Smart Entry Timing.
- `signal-tracker.js` — outcome signal berbasis candle tertutup dan hasil yang tidak pasti.
- `public/index.html`, `public/app.js`, `public/styles.css`, `public/trade-math.js` — website, journal & kalkulator.
- `test/*.test.js` — ujian unit/integrasi.

## Jalankan / uji secara lokal
```sh
npm test
npm start
```
Buka http://localhost:3000. Untuk Render: runtime Node, build `npm install`, start `npm start`, region Singapore, root directory kosong jika file di root.

**Peringatan:** Sasaran 5–6% ialah sasaran dagangan, bukan pulangan yang dijamin. Gunakan paper trade terlebih dahulu; modal sebenar mempunyai risiko kehilangan.
