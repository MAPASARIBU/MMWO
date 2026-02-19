# Panduan Deployment Online untuk MMWO

Dokumen ini berisi langkah-langkah untuk melakukan deployment (mengonlinekan) aplikasi MMWO (Mill Maintenance Work Order) ke layanan cloud. Kita akan menggunakan **Railway** atau **Render** sebagai opsi platform yang mudah dan gratis/murah untuk Node.js dengan database PostgreSQL.

## Persiapan Awal

Sebelum memulai, pastikan Anda memiliki:

1.  **Git (Wajib)**: [Download di sini](https://git-scm.com/download/win). Install dengan pilihan default (Next terus sampai selesai). Setelah install, restart VS Code/Terminal Anda.
2.  **Akun GitHub**: [Daftar di sini](https://github.com/join) jika belum punya. Kode aplikasi harus di-upload ke GitHub repository.
2.  **Akun Railway atau Render**:
    -   [Railway](https://railway.app/) (Disarankan untuk kemudahan setup database & app sekaligus)
    -   [Render](https://render.com/) (Alternatif bagus)
3.  **Koneksi Internet Stabil**.

---

## Tahap 1: Upload Kode ke GitHub

1.  Buka terminal/command prompt di folder proyek `mmwo` Anda.
2.  Inisialisasi Git (jika belum):
    ```bash
    git init
    ```
3.  Pastikan file `.env` dan folder `node_modules` **TIDAK** ikut di-upload. Cek file `.gitignore` dan pastikan isinya minimal:
    ```
    node_modules
    .env
    ```
4.  Commit dan push kode Anda:
    ```bash
    git add .
    git commit -m "Siap deploy"
    # Buat repository baru di GitHub, lalu ikuti instruksi 'push existing repository'
    # Contoh:
    # git remote add origin https://github.com/username-anda/mmwo.git
    # git branch -M main
    # git push -u origin main
    ```

---

## Tahap 2: Deployment di Railway (Rekomendasi)

Railway mendeteksi aplikasi Node.js dan Provision database PostgreSQL dengan sangat mudah.

1.  **Login ke Railway** menggunakan akun GitHub Anda.
2.  Klik **"New Project"** -> **"Deploy from GitHub repo"**.
3.  Pilih repository `mmwo` yang baru Anda upload.
4.  Klik **"Add Variables"**. Masukkan environment variables yang dibutuhkan (lihat file `.env.example` Anda):
    -   `NODE_ENV`: `production`
    -   `SESSION_SECRET`: (Isi dengan string acak yang panjang dan aman)
    -   **JANGAN** isi `DATABASE_URL` dulu secara manual, Railway akan menyediakannya nanti.
5.  Klik tab **"Settings"** -> **"Generate Domain"** untuk mendapatkan alamat URL publik aplikasi Anda (misal: `mmwo-production.up.railway.app`).

### Menambahkan Database

1.  Di dashboard project Railway Anda, klik tombol **"New"** (atau klik kanan di area kosong).
2.  Pilih **"Database"** -> **"PostgreSQL"**.
3.  Tunggu sebentar hingga database siap.
4.  Railway secara otomatis akan membuat variable `DATABASE_URL` di project Anda. Namun, kita perlu menghubungkannya ke aplikasi `mmwo`.
5.  Jika Railway tidak otomatis menghubungkan (inject variable), buka kartu **PostgreSQL** -> tab **Connect** -> copy **Postgres Connection URL**.
6.  Kembali ke kartu aplikasi `mmwo` -> tab **Variables** -> Tambahkan `DATABASE_URL` dan paste URL tadi.

### Setup Database Schema (Penting!)

Aplikasi butuh table-table agar bisa jalan. Railway bisa menjalankan perintah build otomatis.

1.  Di kartu aplikasi `mmwo`, buka tab **Settings**.
2.  Cari bagian **Build Command**. Defaultnya mungkin kosong atau `npm run build`.
3.  Ubah **Build Command** menjadi:
    ```bash
    npm install && npx prisma generate && npx prisma migrate deploy && node prisma/seed.js
    ```
    *Penjelasan: Ini akan menginstall dependency, generate client prisma, melakukan migrasi database (membuat table), dan mengisi data awal (seed).*
4.  Dan pastikan **Start Command** adalah:
    ```bash
    node src/app.js
    ```
5.  Railway akan mendeteksi perubahan dan melakukan redeploy.

### Selesai!

Buka URL domain yang sudah digenerate tadi. Aplikasi Anda seharusnya sudah online.

---

## Tahap 3: Deployment di Render (Alternatif)

Jika memilih Render:

1.  **Login ke Render** dengan GitHub.
2.  **Buat Database PostgreSQL**:
    -   Klik **New +** -> **PostgreSQL**.
    -   Beri nama (misal: `mmwo-db`).
    -   Copy **Internal DB URL** setelah selesai dibuat.
3.  **Buat Web Service**:
    -   Klik **New +** -> **Web Service**.
    -   Pilih repository `mmwo`.
    -   **Build Command**: `npm install && npx prisma generate`
    -   **Start Command**: `node src/app.js`
    -   **Environment Variables**:
        -   `NODE_ENV`: `production`
        -   `SESSION_SECRET`: (rahasia)
        -   `DATABASE_URL`: (Paste Internal DB URL dari langkah 2)
4.  **Migrasi Database**:
    -   Render tidak menjalankan migrasi di build command secara default dengan mudah.
    -   Cara termudah: Masuk ke menu **Shell** di dashboard Web Service Render setelah deploy (meski error karena belum ada table).
    -   Ketik manual:
        ```bash
        npx prisma migrate deploy
        node prisma/seed.js
        ```

---

## Troubleshooting

-   **Error Database**: Pastikan `DATABASE_URL` benar dan server database statusnya aktif.
-   **Error "Client was not generated"**: Pastikan perintah `npx prisma generate` ada di Build Command.
-   **Aplikasi Crash**: Cek menu **Logs** di dashboard Railway/Render untuk melihat pesan error detailnya.
