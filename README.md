# DeepSeek Harness Web AI

Web UI untuk menjalankan **DeepSeek Harness** (agen coding AI) di browser,
dengan login Supabase, workspace file, dan deploy gratis di **Render Free Web
Service**.

Ringkasnya:

- Buka browser → login → buat project → edit file → tekan **Start AI session**
  → ngobrol dengan agen AI lewat panel **AI Chat**.
- File project disimpan di Supabase Storage (tidak ada disk permanen di Render).
- Satu sesi AI aktif pada satu waktu (hemat RAM).

Dokumen lain:

- [`docs/API.md`](docs/API.md) — daftar endpoint, request, respons, kode error.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — cara kerja di balik layar.
- [`PRD.md`](PRD.md) — dokumen kebutuhan asli.

---

## 1. Apa aplikasi ini

Aplikasi Node.js yang terdiri dari tiga bagian:

1. **Server** (`server.js` + `src/server`) — REST API, autentikasi, dan reverse
   proxy menuju proses `dsh web`.
2. **Frontend** (`src/client`) — aplikasi React (login, daftar project, editor
   file, panel AI).
3. **DeepSeek Harness** (`@deepseek-ai/dsh`) — proses AI yang dijalankan di
   loopback (`127.0.0.1`) dan tidak pernah diekspos langsung ke internet.

---

## 2. Requirement

| Kebutuhan | Versi |
| --- | --- |
| Node.js | 24.x (wajib, lihat `engines` di `package.json`) |
| npm | 10+ (ikut dengan Node) |
| Akun Supabase | gratis |
| Akun Render | gratis |
| API key AI | DeepSeek (atau provider kompatibel OpenAI) |
| RAM saat deploy | Render Free = 512 MB |

---

## 3. Install Node

**Windows / macOS:** unduh dari <https://nodejs.org> versi **24 LTS**.

**Linux (Debian/Ubuntu):**

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

Cek versi:

```bash
node -v   # harus v24.x
npm -v
```

> Catatan: di Termux (Android) aplikasi ini bisa di-install, tetapi proses
> `dsh` sendiri tidak jalan (native module Android tidak tersedia). Untuk
> testing lokal gunakan mesin Linux/macOS/Windows.

---

## 4. Clone repository

```bash
git clone <url-repositori-anda> deepseek-harness-web
cd deepseek-harness-web
```

---

## 5. Install dependency

```bash
npm ci
```

`npm ci` memakai `package-lock.json` sehingga versi sama persis dengan yang
diuji. (Gunakan `npm install` hanya bila menambah paket baru.)

---

## 6. Setup `.env`

Salin contoh lalu isi:

```bash
cp .env.example .env
```

```env
NODE_ENV=development
PORT=3000

# Supabase (lihat langkah 7)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Provider AI untuk harness
DEEPSEEK_API_KEY=
AI_BASE_URL=            # opsional, default: provider DeepSeek
AI_MODEL=               # opsional

# GitHub OAuth (opsional)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Batas
MAX_UPLOAD_MB=50
MAX_ACTIVE_SESSIONS=1
SESSION_TIMEOUT_MINUTES=30
```

Jangan pernah mengisi `.env` dengan secret asli lalu meng-commit-nya —
`.env` sudah masuk `.gitignore`.

---

## 7. Setup Supabase

1. Buka <https://supabase.com> → **New project** (pilih region terdekat).
2. Tunggu selesai, lalu buka **SQL Editor**.
3. Jalankan isi `supabase/migrations/001_initial.sql`, lanjutkan dengan
   `supabase/migrations/002_rls.sql`. (Ini membuat tabel `projects`,
   `sessions`, `messages`, `files`, mengaktifkan RLS, dan membuat bucket
   `projects`, `artifacts`, `harness-state`.)
4. Buka **Project Settings → API** dan salin:
   - `Project URL` → `SUPABASE_URL`
   - `anon` `public` → `SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`
5. (Opsional) **Authentication → Providers → Email**: matikan *Confirm email*
   bila ingin langsung bisa login tanpa konfirmasi inbox.

Tanpa Supabase, aplikasi tetap bisa jalan dalam **mode development lokal**
(user `dev-local`, data disimpan di `data/dev-store.json`) — tetapi mode ini
sengaja **diblokir** saat `NODE_ENV=production`.

---

## 8. Setup GitHub OAuth (opsional)

Dipakai untuk menghubungkan GitHub (belum termasuk import repo — gunakan upload
zip dulu).

1. GitHub → **Settings → Developer settings → New OAuth App**.
2. `Authorization callback URL`: `https://<app-anda>.onrender.com/api/github/callback`
   (saat local: `http://localhost:3000/api/github/callback`).
3. Isi `GITHUB_CLIENT_ID` dan `GITHUB_CLIENT_SECRET` di `.env`.

---

## 9. Jalankan server development

```bash
# terminal 1 — frontend (Vite, port 5173)
npm run dev

# terminal 2 — backend (port 3000)
npm run dev:server
```

Buka <http://localhost:5173>. Vite meneruskan `/api`, `/health`, dan `/app` ke
port 3000.

Testing:

```bash
npm test        # 18 smoke test (tanpa Supabase & tanpa API key)
```

---

## 10. Build & jalankan production

```bash
npm ci
npm run build     # vite build + inisialisasi profile harness
npm start
```

Lalu cek:

```bash
curl -i http://localhost:3000/health
# HTTP/1.1 200 OK
# {"status":"ok", ...}
```

`npm start` membaca `PORT` dari environment (default 3000) dan selalu listen di
`0.0.0.0` — ini wajib untuk Render.

---

## 11. Deploy ke Render

1. Push repository ke GitHub.
2. Render → **New → Web Service** → pilih repository.
3. Render otomatis membaca `render.yaml`. Periksa:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
4. Di tab **Environment** isi:
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `DEEPSEEK_API_KEY`, dan opsional `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`.
   `NODE_ENV=production` sudah diatur `render.yaml`.
   `PORT` disediakan Render.
5. **Create Web Service** → tunggu build selesai → buka URL
   `https://<nama>.onrender.com`.
6. Update **Site URL** di Supabase (**Authentication → URL Configuration**) ke
   URL tersebut.

---

## 12. Setup UptimeRobot (anti spin-down)

Render Free mematikan service setelah ~15 menit tanpa request.

1. Daftar di <https://uptimerobot.com> → **Add New Monitor**.
2. Monitor type **HTTP(s)**, URL: `https://<nama>.onrender.com/health`.
3. Interval: 5 menit.

Setiap ping akan membangunkan service (cold start ± 50 detik).

---

## 13. Troubleshooting

### Harness gagal start

Gejala: panel AI menampilkan `The AI engine exited before it was ready…`.

Cek:

1. `node -v` harus 24.x di mesin lokal / build Render.
2. Versi `@deepseek-ai/dsh` sesuai `package.json` (jalankan `npm ci`, bukan
   `npm install` lama).
3. Variabel environment: `DEEPSEEK_API_KEY` harus terisi; tanpa key, harness
   tetap bisa start tetapi panggilan AI akan gagal.
4. Log: `render logs` atau terminal lokal (log JSON, cari `harness_starting`,
   `harness_ready`, `harness_output`).

### Supabase gagal

Cek: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sudah
terisi; migration `001`/`002` sudah dijalankan; RLS policy aktif (server memakai
`service_role`, jadi RLS tidak menghalangi; `anon` key hanya untuk Auth).

### Render 502 / 503

Cek:

- `PORT` jangan di-set manual (Render yang menentukan); aplikasi membaca
  `process.env.PORT`.
- `startCommand` = `npm start`, bukan `node server.js` dengan port tetap.
- Aplikasi bind ke `0.0.0.0` (sudah bawaan `server.js`).
- Startup logs: pastikan muncul `server_started`.

### Login menolak / sesi hilang

- Pastikan **Site URL** Supabase sudah benar.
- Cookie `dhw-access` butuh HTTPS di produksi (sudah `Secure` otomatis).

### Port sudah terpakai (lokal)

```bash
PORT=3001 npm run dev:server
```

---

## 14. Limitasi Render Free

| Limitasi | Dampak | Penanganan |
| --- | --- | --- |
| 512 MB RAM | `dsh` + server + browser sulit berbagi | `MAX_ACTIVE_SESSIONS=1`, tanpa local model, `NODE_OPTIONS` hanya setelah diukur |
| Tidak ada disk persisten | file & chat hilang saat restart | sinkron ke Supabase Storage (project files + `DSH_HOME`) |
| Spin-down 15 menit | cold start ± 50 detik | UptimeRobot ping `/health` |
| Satu proses | tidak bisa horizontal scaling | arsitektur single-instance |
| Build timeout | `npm ci` + `vite build` + init harness | pakai lockfile, tanpa Docker |

Belum/bisa dikembangkan kemudian: import repo GitHub (sementara upload zip),
preview gambar, dan share project publik.
