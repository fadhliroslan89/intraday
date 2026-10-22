# Daily Radar Android PWA V1.7.1

1. Upload semua isi ZIP ke GitHub repository `intraday`, branch `main`. Pastikan folder `public/icons/` dan fail `public/manifest.webmanifest`, `public/sw.js`, `public/pwa-install.js` turut masuk.
2. Semak Render deployment terkini `Live`.
3. Buka `https://intraday-t1ln.onrender.com/` dalam **Chrome Android**.
4. Pastikan label di atas ialah **V1.7.1**.
5. Menu 3 titik (⋮) → **Add to Home screen** → **Install**. Jika butang `Pasang App` muncul, boleh tekan itu.
6. Jika pilihan belum muncul, tutup tab dan buka semula website; semak bahawa `/manifest.webmanifest`, `/icons/icon-192.png`, `/icons/icon-512.png` boleh dibuka melalui alamat yang sama. Kemas kini Chrome jika perlu.

**Shortcut bukan pemasangan PWA.** Shortcut hanya membuka web dalam Chrome. PWA dalam mod standalone masih memerlukan internet bagi data market. Telefon tidak memantau coin sendiri di background; Telegram notification dihantar oleh server dan Render Free yang tidur boleh terlepas alert.
