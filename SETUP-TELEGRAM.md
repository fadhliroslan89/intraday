# Daily Radar V1.7 — Setup Telegram FINAL READY

Panduan untuk website yang sudah ada di `https://intraday-t1ln.onrender.com` dan Render service `intraday`. Jangan kongsi token, kod pairing atau `DATABASE_URL` dalam chat, GitHub, screenshot atau media sosial.

## 1. Deploy kod V1.7 dahulu

- Backup Trading Journal melalui **Trading Journal → Backup JSON**.
- Extract ZIP V1.7; upload semua kandungan folder ke root GitHub repository `intraday` (branch `main`). Ganti fail lama, jangan upload ZIP sahaja.
- Semak Render hingga **Deploy succeeded · Live** dan website menunjukkan **V1.7**.
- Jangan tukar `DATABASE_URL` Neon yang telah berfungsi.

## 2. Cipta bot rasmi Telegram

1. Buka Telegram (telefon atau desktop) dan cari **@BotFather** yang rasmi/verified, atau buka https://t.me/BotFather.
2. Hantar `/newbot`.
3. Beri nama paparan, contoh `Daily Radar Alert`.
4. Beri username yang belum digunakan dan berakhir dengan `bot`, contoh `mydailyreadybot` (jika tersedia).
5. BotFather akan memberi **HTTP API token**. Simpan sebagai rahsia; jangan paparkan dalam screenshot.
6. Klik pautan ke bot yang dicipta. Belum perlu cari Chat ID.

## 3. Masukkan 2 Environment Variables di Render

Render Dashboard → Web Service `intraday` → **Environment** → Add variable.

| Key | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Token daripada BotFather (rahsia) |
| `TELEGRAM_PAIR_CODE` | Pilih satu kod rawak 16–24 aksara (huruf/nombor), **minimum 12**. Jangan guna contoh umum. |

- Pastikan `DATABASE_URL` Neon masih sedia ada. Jangan padam atau tukar.
- Tekan **Save, deploy** dan semak deployment berjaya.
- `PUBLIC_SITE_URL` adalah pilihan sahaja. Tanpa variable ini, pautan mesej ke `https://intraday-t1ln.onrender.com`.
- Jangan edit `server.js` untuk meletakkan token dalam kod.

## 4. Pairing terus melalui bot Telegram

- Buka chat bot yang **kau cipta sendiri** dan hantar `/start KOD_PAIRING` (ganti KOD_PAIRING dengan nilai yang sama seperti `TELEGRAM_PAIR_CODE`).
- Contoh format sahaja: `/start <kod-rahsia-sendiri>` — jangan taip tanda `<` dan `>`.
- Bot patut membalas `✅ Daily Radar V1.7 berjaya dipasangkan!`.
- Kemudian hantar `/test`. Bot membalas mesej **UJIAN TELEGRAM**, jelas bukan signal BUY.
- Hantar `/status` jika mahu semak.
- Refresh website; status di bawah BUY Signal Center akan menjadi **TELEGRAM · AKTIF**.
- Pairing hanya untuk satu chat Telegram. Untuk tukar pengguna/chat, perlu reset rekod konfigurasi Neon secara terkawal; **jangan** kongsi token atau pairing code kepada orang lain.

## 5. Alert LIVE bagaimana berfungsi?

- Server akan semak semula status READY selepas imbasan candle dan refresh ticker. Hanya **FINAL READY** dihantar.
- Mesej menghantar entry zone, harga live waktu imbasan, TP kasar yang diperlukan bagi +5/+6% net anggaran (model fee/slippage), SL dan pautan website.
- **Tidak** menghantar notifikasi untuk WAIT, AVOID, Near BUY, False Breakout, OVEREXTENDED, candle lama, atau harga di luar zon.
- Rekod Telegram dihantar disimpan di PostgreSQL Neon untuk elak mesej berulang pada signal candle sama. Percubaan semula terhad jika Telegram API gagal. Penghantaran tepat-sekali tidak boleh dijamin pada kegagalan rangkaian/DB serentak.
- Alert ini bukan auto-buy. Harga live ketika mesej sampai mungkin sudah di luar zon; semak semula website dan carta KuCoin/TradingView sebelum sebarang keputusan.
- **Render Free akan spin down selepas 15 minit tanpa incoming traffic**, jadi tiada imbasan berkala/Telegram polling ketika tidur. Untuk alert yang lebih boleh diharapkan sepanjang hari, gunakan host sentiasa aktif atau perkhidmatan worker berjadual yang sesuai.

## 6. Masalah biasa

- **TELEGRAM · PERLU SETUP:** Semak kedua-dua Environment Variables tersimpan tepat; redeploy.
- **BELUM AKTIF:** Bot belum dipasangkan. Hantar `/start KOD_PAIRING` daripada private chat kepada bot sendiri. Pastikan kod sama dan 12+ aksara.
- **DATABASE REQUIRED:** Semak `Signal Performance` menunjukkan `PERSISTENT · DATABASE CONNECTED` dan Render Logs memaparkan `Signal DB connected`.
- **Tiada balasan /test:** Pastikan bot yang betul, service Render sedang hidup, token betul, dan buka Render Logs untuk `Telegram pairing/poll`. `/test` tidak berfungsi ketika server tidur.
- **Tiada signal REAL READY:** Ini normal jika pasaran tidak melepasi semua syarat. Ujian bot bukan BUY dan tidak menambah tracker win rate.
- **Bot token terdedah:** Buka BotFather → `/revoke` untuk gantikan token dan update Render secepat mungkin.

## Privasi & pengesahan

Semua rahsia kekal pada server, bukan pada JavaScript frontend. Ujian tempatan hanya menggunakan Telegram API mock serta data pasaran simulasi; setup sebenar perlu diuji melalui `/test` selepas Render deploy.
