---
title: Syariah Swing Radar Pro
emoji: 📈
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Syariah Swing Radar Pro v1.0.0 - IDX (ISSI / JII / JII70)

Aplikasi screener otomatis komprehensif untuk saham-saham syariah Bursa Efek Indonesia (BEI) berbasis **3 Pilar Analisis & Manajemen Risiko**:
1. **Analisis Teknikal Presisi (40%):** `MA50 > MA100 > MA200`, RSI, Breakout Resistance, Support Pullback, Stoch RSI Golden Cross, MACD.
2. **Bandarmologi & Smart Money Flow (35%):** Volume Price Analysis (VPA), Volume Absorption, 5-Day Cumulative Volume Delta, dan 20-Day VWAP.
3. **Fundamental Syariah Standar OJK (25%):** Rasio Utang Riba (DER < 45%), Profitabilitas ROE > 10%, Valuasi PER & PBV.
4. **Proteksi Khusus Anti-Falling Knife:** Menjaga modal agar tidak membeli pisau jatuh pada saham yang sedang breakdown support atau fase distribusi berat.

---

## 📱 Cara Memasang & Membuka Aplikasi di HP Android (PWA Standalone)

Aplikasi ini sudah mendukung **Progressive Web App (PWA)** standar resmi Google untuk Android:
1. Pastikan HP Android dan Komputer terhubung ke jaringan Wi-Fi yang sama (atau melalui hotspot HP).
2. Di komputer, klik ganda `Jalankan_Radar_Saham_v1.0.bat`. Terminal akan menampilkan alamat IP HP Anda (misal: `http://192.168.136.24:8000`).
3. Di HP Android Anda:
   - Buka browser **Google Chrome** dan ketik alamat IP tersebut (atau scan QR code dari modal web PC).
   - Ketuk tombol **"Pasang HP"** di pojok kanan atas, ATAU ketuk menu titik tiga (⋮) Chrome lalu pilih **"Tambahkan ke Layar Utama" (Add to Home screen) / "Install Aplikasi"**.
4. Ikon **"Syariah Radar"** akan langsung muncul di Layar Utama & App Drawer HP Anda.
5. Saat dibuka dari HP, aplikasi berjalan **layar penuh (fullscreen standalone)** layaknya aplikasi native Android Play Store tanpa address bar browser.

---

## 💻 Menjalankan di Komputer (PC)

- **1-Click Jalankan Aplikasi:** Klik ganda file `Jalankan_Radar_Saham_v1.0.bat` (atau `run_server.bat`) $\rightarrow$ buka `http://localhost:8000`.
- **Screener Mode Terminal (Opsional):** Klik ganda file `run_screener.bat`.

---

## 🛠️ Fitur-Fitur Utama Versi 1.0 (v1.0.0)

- **75 Universe Saham Syariah Terkurasi:** ISSI, JII, dan JII70 dengan likuiditas tinggi.
- **Pencarian Cerdas & Diagnosa Saham:** Jika saham belum lolos (misal: BRIS terkena Anti-Falling Knife), sistem menjelaskan alasannya secara transparan.
- **Kalkulator Lot Sizing Otomatis:** Perhitungan lot berdasarkan toleransi risiko portofolio (1-2%) dan target profit bertahap (TP1 & TP2).
- **1-Click Salin Trading Plan:** Format teks siap paste ke WhatsApp atau buku catatan trading.
- **⭐ Watchlist Saya:** Simpan saham pantauan favorit langsung di memori HP/PC.
- **Notifikasi Bot Telegram:** Kirim sinyal harian Grade A+ otomatis ke chat Telegram Anda.
- **Penambahan Saham Kustom:** Validasi otomatis ke BEI via Yahoo Finance.

---

## 🚀 Rencana Rilis Mendatang (v2.0+)
- Deploy ke Cloud VPS (sehingga PC tidak perlu terus menyala).
- Push Notifications otomatis & Webhook eksekusi broker (jika API sekuritas tersedia).
