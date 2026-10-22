# KUCOIN DAILY RADAR 5–6% — Website V1.0

Website mesra **PC dan telefon** yang mengimbas harga pasangan KuCoin Spot/USDT melalui API awam KuCoin, mengira signal berdasarkan candle 15m yang **sudah tutup**, dan mengadakan Trading Journal manual. **Tidak menghantar order. Tiada API key diperlukan.**

## Fungsi

- Pantau ticker **semua pasangan USDT** yang aktif, refresh 30s.
- Analisis OHLCV **15 minit + 1 jam** untuk shortlist dinamik **maksimum 52 pasangan** (volum, movers, range), refresh setiap 120s. Bukan 52 coin tetap.
- Score 0–100 berdasarkan EMA20/50/200 15m, EMA20/50 1h, RSI, ADX, breakout 20 candle, Relative Volume, liquidity, spread.
- **BUY** hanya jika syarat ketat lengkap dan candle sah; **WATCH** untuk skor >=60 + liquidity, **WAIT** untuk selainnya.
- TP1 **+5%**, TP2 **+6%**, SL rujukan **−2%** daripada harga close candle sah terakhir. Harga entry sebenar mungkin berbeza.
- Mobile cards + desktop table, carian, filter, ranking, favorite per-browser, top opportunities, carta mini.
- Paper Trading Journal (manual trade entry / manual closing price, fees dua hala, P/L, win rate). Data localStorage per browser; eksport CSV dan backup/import JSON.
- Browser notification untuk signal baru semasa laman **dibuka** dan browser memberikan kebenaran. Tiada server push atau notifikasi background bila laman ditutup.

## Cara jalan atas PC (Node.js 20+)

```bash
npm install
npm start
```

Buka `http://localhost:3000` di browser komputer.

## Deploy laman baharu melalui GitHub + Render

1. Buat **repository GitHub baharu**, contoh: `kucoin-daily-radar`. **Jangan** upload ke repo `signals` lama kerana kita mahu kekalkan screener scalping terdahulu tanpa ubah.
2. Extract ZIP dan upload semua fail project (pastikan `package.json`, `server.js`, `market.js`, `analytics.js`, `public/` ada di root repo).
3. Di [dashboard.render.com](https://dashboard.render.com/) → **New** → **Web Service** → Connect repository baru.
4. Pilih **Node**, region **Singapore**, plan **Free** (jika masih tersedia). Build command `npm install`, start command `npm start`, health check `/health`.
5. Klik **Deploy Web Service**. Render akan berikan URL seperti `https://nama-projek.onrender.com`. Buka link **yang sama** di PC dan telefon.
6. URL lama `https://signals-ax4g.onrender.com` tidak disentuh.

Alternatif: `render.yaml` disertakan untuk Blueprint, tetapi manual setup lebih mudah untuk kali pertama.

## Perlu tahu

- Tiada data DEMO/fake. Jika data KuCoin gagal, dashboard akan lapor offline dan signal stale disekat.
- **Semua ticker** dipantau tetapi **tidak semua pasangan mendapat analisis candle setiap pusingan**: ini kawalan API/rate limit. Juga pasangan berliquidity rendah mungkin tiada OHLCV yang lengkap.
- API KuCoin boleh gagal disebabkan rangkaian, kebenaran rangkaian penyedia hosting, rate limit, atau perubahan API. Endpoint yang digunakan: `GET /api/v1/market/allTickers`, `/api/v2/symbols`, `/api/v1/market/candles`.
- Refresh harga 30s, OHLCV paling laju berubah selepas candle 15m tertutup. Ini bukan WebSocket atau jaminan real-time tick-by-tick.
- Render Free boleh *spin down* semasa tiada trafik, jadi website mungkin lambat pulih dan scanner tidak berjalan 24/7. Browser alert juga tidak berfungsi jika tab tutup/telefon tidur.
- Tiada sync jurnal antara peranti. **Backup JSON** di telefon dan **Import JSON** di PC untuk pindah data manual.
- **Tidak wujud jaminan** sasaran 5–6% harian. Target 5–6% ialah *per posisi*, bukan setiap hari pada keseluruhan modal. Prestasi signal belum dibacktest secara sistematik. Gunakan paper trading dan kawal kos broker, slippage, spread serta risiko.

## API docs

- https://www.kucoin.com/docs-new/rest/spot-trading/market-data/get-all-tickers/
- https://www.kucoin.com.tr/docs/rest/spot-trading/market-data/get-klines

## Test

```bash
npm test
```
