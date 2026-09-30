# Arsitektur — DeepSeek Harness Web AI

Dokumen ini menjelaskan bagaimana komponen aplikasi saling terhubung, aliran
data, dan keputusan desain penting.

## Diagram alur utama

```
Browser (React SPA)
   │  fetch /api/*  +  EventSource (SSE)
   │  iframe  ─────────────────────────────┐
   ▼                                       │
Node.js HTTP server (Express 5)           │
   │  ├─ autentikasi (cookie httpOnly)     │
   │  ├─ rate limit + validasi path        │
   │  ├─ REST API /api/*                   │
   │  └─ reverse proxy /app/*  ◄───────────┘
   ▼
DeepSeek Harness (`dsh web`, loopback 127.0.0.1:3099)
   │  token proses + fence Host/Origin
   ▼
AI provider (DeepSeek / OpenAI compatible, AI_API_KEY)
   │
   ▼
Supabase (Auth, Postgres, Storage)  ──  GitHub OAuth (opsional)
```

## Komponen

| Bagian | Lokasi | Tugas |
| --- | --- | --- |
| Entry server | `server.js` | listen `0.0.0.0:$PORT`, `/health`, graceful shutdown |
| Aplikasi HTTP | `src/server/app.js` | security header, urutan route, SPA fallback, mount proxy `/app` |
| API | `src/server/routes/*.js` | projects, files, sessions, auth, github, config |
| Reverse proxy | `src/server/proxy/harnessProxy.js` | teruskan `/app/*` ke harness, suntik token, tulis ulang path absolut |
| Orkestrasi AI | `src/server/services/harness.js` | spawn/stop `dsh web`, tangkap token, idle timeout |
| State chat | `src/server/services/harnessState.js` | zip/restore `DSH_HOME` ke Supabase Storage |
| File workspace | `src/server/services/workspace.js` | baca/tulis file proyek + sinkron Storage |
| Data | `src/server/services/db.js` | proyek, sesi, pesan (Supabase; fallback lokal saat dev) |
| Frontend | `src/client/` | React SPA: login, dashboard, workspace, settings |

## Keputusan desain

### 1. Harness GUI di-mount sebagai reverse proxy, bukan UI chat custom

`dsh web` menyediakan GUI (thread, diff, tool call, streaming) yang sudah sesuai
kebutuhan PRD untuk streaming realtime. Membangun ulang UI chat berarti
menggandakan risiko error dan biaya RAM. Karena itu:

- GUI harness di-mount di `/app/*` (Express → `127.0.0.1:$HARNESS_PORT`).
- API aplikasi tetap di `/api/*`, tidak ada bentrok.
- Halaman workspace menampilkan GUI di panel "AI Chat" (iframe).

Konsekuensinya: endpoint `POST /api/sessions/:id/message` mengembalikan `501`
dengan kode `chat_via_harness_gui` (lihat `docs/API.md`). PRD §70 mengizinkan
penyesuaian endpoint bila integrasi Harness menuntut struktur berbeda.

### 2. Rewrite path absolut di dalam respons harness

Bundle harness memakai path absolut (`"/api"`, `"/plugins/events"`). Saat GUI
dilayani dari `/app/`, path tersebut harus menjadi `/app/api`, `/app/plugins/...`.
Proxy menulis ulang body bertipe `text/html` / `javascript` (dengan dekompresi
gzip/deflate/brotli bila ada) dan header `Location`.

### 3. Token proses, bukan sesi browser

Saat `dsh web` start, ia mencetak `dsh web: <url>?token=...`. Token itu
di-capture dari stdout dan disuntikkan ke request document pertama (ketika
browser belum punya cookie `dsh-auth-*`). Setelah cookie terpasang, token tidak
dikirim lagi.

### 4. Fence Host/Origin

Harness menolak request dengan Host/Origin yang tidak dikenal. Proxy **tidak**
merewrite header `Host` (Origin browser harus cocok), dan menambahkan
`--trusted-host` berisi hostname publik (`TRUSTED_HOST` /
`RENDER_EXTERNAL_HOSTNAME`), `Host` request, origin, serta `localhost` untuk dev.

### 5. Satu sesi aktif

`MAX_ACTIVE_SESSIONS=1`. Saat user berpindah proyek, sesi lama dihentikan
terlebih dahulu. Alasan: Render Free hanya punya ~512 MB RAM dan `dsh` adalah
proses Node penuh.

### 6. Persistensi tanpa disk permanen

Render tidak punya disk persisten. Dua lapisan dipakai:

1. **File proyek** → `data/workspaces/<project-id>` disinkronkan ke bucket
   Supabase `projects` (`syncWorkspace`) dan dipulihkan saat proyek dibuka
   (`restoreWorkspace`).
2. **State harness / history chat** → folder `DSH_HOME` di-zip (maks 24 MB,
   skip `node_modules`) ke bucket `harness-state` setiap kali engine berhenti,
   lalu dipulihkan sebelum engine start berikutnya.

### 7. Mode lokal tanpa Supabase

Jika `SUPABASE_URL`/`SUPABASE_ANON_KEY` kosong (development), server:

- melewati verifikasi token dan memakai user `dev-local`,
- menyimpan data di `data/dev-store.json`,
- melewati sinkronisasi Storage.

Produksi **tidak bisa** start tanpa kredensial Supabase (`missingRequiredEnv`).

## Keamanan

- Cookie sesi `dhw-access` bersifat `httpOnly`, `SameSite=Lax`, `Secure` di produksi.
- Semua jalur file melewati `resolveInside()` (blokir `..`, absolut, NUL, kedalaman berlebih).
- Rate limit per IP untuk login, pembuatan proyek, upload, chat, dan start sesi.
- Header keamanan: CSP, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options`, `Referrer-Policy`.
- Pesan error 5xx tidak pernah dibocorkan ke klien (hanya untuk `AppError` yang memang disengaja).
- Token GitHub disimpan di cookie `httpOnly`, tidak pernah di query string.
- Tidak ada shell interpolation: harness di-spawn dengan `spawn(process.execPath, args)` tanpa `shell: true`.

## Batasan RAM & timeout

| Batas | Nilai | Env |
| --- | --- | --- |
| Sesi aktif | 1 | `MAX_ACTIVE_SESSIONS` |
| Idle timeout | 30 menit | `SESSION_TIMEOUT_MINUTES` |
| Upload | 50 MB | `MAX_UPLOAD_MB` |
| Chat request | 10/menit/IP | `MAX_CHAT_REQUESTS_PER_MINUTE` |
| State chat di Storage | 24 MB | konstanta `harnessState.js` |

## Shutdown

`SIGTERM`/`SIGINT` → server berhenti menerima koneksi baru → harness dihentikan
(SIGTERM, lalu SIGKILL setelah 10 d) → state harness disinkronkan ke Storage →
proses keluar. Total dibatasi 20 detik agar Render tidak memaksa kill.
