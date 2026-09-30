# API — DeepSeek Harness Web AI

Semua endpoint memakai JSON kecuali disebut lain. Base URL sama dengan origin
aplikasi (`https://<app>.onrender.com`).

## Autentikasi

Layanan ini single-user-per-akun memakai Supabase Auth:

1. Browser login lewat Supabase JS (`signInWithPassword` / `signUp`).
2. Browser mengirim token ke `POST /api/auth/session`.
3. Server memverifikasi token dengan `auth.getUser()` lalu menyetel cookie
   `dhw-access` (`httpOnly`, `SameSite=Lax`, `Secure` di produksi, 7 hari).
4. Request berikutnya diverifikasi otomatis dari cookie (header `Authorization:
   Bearer <token>` juga diterima).

Tanpa `SUPABASE_URL` + `SUPABASE_ANON_KEY` (mode development) server berjalan
dengan user `dev-local` dan tidak memverifikasi token.

Contoh login:

```bash
# 1. dapatkan token dari Supabase
TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"secret123"}' | jq -r .access_token)

# 2. set cookie sesi
curl -i -X POST localhost:3000/api/auth/session \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" \
  -d "{\"access_token\":\"$TOKEN\"}" -c cookies.txt
```

## Format error

```json
{ "error": { "message": "Project not found.", "code": "not_found" } }
```

| Kode | HTTP | Kapan |
| --- | --- | --- |
| `bad_request` | 400 | input tidak valid, path tidak aman |
| `unauthorized` | 401 | sesi tidak ada / kedaluwarsa |
| `forbidden` | 403 | resource milik user lain |
| `not_found` | 404 | proyek/sesi/file tidak ada |
| `conflict` | 409 | nama file sudah ada |
| `too_large` | 413 | melebihi `MAX_UPLOAD_MB` |
| `rate_limited` | 429 | terlalu banyak request |
| `busy` | 503 | engine sedang start / sesi lain berjalan |
| `harness_offline` | 503 | `/app/*` diminta saat engine mati |
| `harness_unreachable` | 502 | engine tidak merespons |
| `unavailable` | 503 | dependensi (Supabase/GitHub) belum dikonfigurasi |
| `chat_via_harness_gui` | 501 | chat dilakukan lewat GUI harness |
| `internal_error` | 500 | kesalahan tak terduga (pesan disembunyikan) |

---

## Sistem

### `GET /health`

Cepat, tidak pernah menyentuh provider AI.

```json
{ "status": "ok", "uptime_seconds": 12, "node_env": "production",
  "features": { "supabase": true, "github": false, "ai": true } }
```

### `GET /api/config`

Konfigurasi untuk client (tanpa secret server).

```json
{ "supabase": { "url": "https://…", "anonKey": "…" },
  "features": { "supabase": true, "github": false, "ai": true },
  "limits": { "maxUploadMb": 50, "maxActiveSessions": 1, "sessionTimeoutMinutes": 30,
              "maxChatRequestsPerMinute": 10, "maxPromptChars": 20000,
              "maxToolOutputChars": 20000 },
  "github": null }
```

---

## Autentikasi

| Method | Path | Body | Respons |
| --- | --- | --- | --- |
| POST | `/api/auth/session` | `{ "access_token": "…" }` | `{ "user": { "id", "email" } }` + cookie |
| DELETE | `/api/auth/session` | – | `{ "ok": true }` |
| GET | `/api/auth/me` | – | `{ "user": { "id", "email" } }` |

---

## Proyek

### `GET /api/projects`

`{ "projects": [ { "id", "user_id", "name", "description", "repository_url",
"storage_path", "created_at", "updated_at" } ] }`

### `POST /api/projects`

```json
{ "name": "my-app", "description": "optional", "repository_url": "optional" }
```

`201` → `{ "project": { … } }`. Wajib login, rate limit 20/menit.

### `GET /api/projects/:id`

`{ "project": { … } }`

### `DELETE /api/projects/:id`

Menghapus baris proyek, file Storage, dan workspace lokal.
`{ "ok": true }`

---

## File

Semua path bersifat relatif terhadap workspace proyek dan melewati validasi
anti-traversal (`..`, path absolut, karakter NUL, kedalaman maksimal 32).

### `GET /api/projects/:id/files`

```json
{ "files": [ { "path": "src", "name": "src", "type": "dir", "size": 0 },
             { "path": "src/app.js", "name": "app.js", "type": "file", "size": 42 } ] }
```

### `POST /api/projects/:id/files`

`{ "path": "src/app.js", "type": "file" | "dir" }` → `201 { "ok": true, "path": "…" }`

### `PUT /api/projects/:id/files`

`{ "path": "src/app.js", "content": "…" }` → `{ "path": "…", "size": 42 }`
(Otomatis memicu autosave dari client dengan debounce 1.2 detik + `Ctrl/Cmd+S`.)

### `GET /api/projects/:id/files/content?path=…`

`{ "file": { "path", "text", "size", "binary": false } }`
File biner/larger dari 2 MB mengembalikan `binary: true` tanpa `text`.

### `GET /api/projects/:id/files/raw?path=…`

Mengembalikan isi file apa adanya (`Content-Type` sesuai ekstensi).

### `DELETE /api/projects/:id/files?path=…`

`{ "ok": true }`

### `POST /api/projects/:id/files/rename`

`{ "from": "a.txt", "to": "b.txt" }` → `{ "ok": true }`

### `POST /api/projects/:id/sync`

Menyimpan isi workspace ke Supabase Storage bucket `projects`.
`{ "uploaded": 12 }`

### `POST /api/projects/:id/upload`

Body: biner zip (`Content-Type: application/zip`), maksimal `MAX_UPLOAD_MB`.
Entri tidak aman (zip-slip) ditolak.

```json
{ "ok": true, "extracted": 24 }
```

---

## Sesi & AI engine

### `POST /api/sessions`

```json
{ "projectId": "uuid", "title": "opsional" }
```

`201` → `{ "session": { … }, "harness": { "running": true, "ready": true, … } }`

Proses: restore workspace → restore state chat → spawn `dsh web` (loopback) →
tangkap token → buat baris sesi. Jika engine gagal, respons `503 busy` dengan
pesan dari log.

### `GET /api/sessions?projectId=uuid`

`{ "sessions": [ … ] }`

### `GET /api/sessions/:id`

`{ "session": { … }, "harness": { … }, "logs": ["…"] }`

### `DELETE /api/sessions/:id`

Menandai sesi `stopped` dan menghentikan engine. `{ "ok": true }`

### `GET /api/sessions/:id/messages?limit=50&offset=0`

Riwayat pesan tersimpan (tabel `messages`). Karena chat berjalan di GUI
harness, tabel ini berisi pesan yang direkam lewat API — pesan lengkap juga
hidup di bucket `harness-state`.

```json
{ "messages": [], "limit": 50, "offset": 0, "total": 0 }
```

### `POST /api/sessions/:id/message`

`501`

```json
{ "error": { "code": "chat_via_harness_gui",
  "message": "Chat streaming is provided by the DeepSeek Harness GUI embedded in the workspace. Open the AI Chat panel to talk to the agent." } }
```

**Catatan:** endpoint ini disengaja. Streaming chat dilakukan oleh GUI harness
di `/app/*` (SSE `EventSource`), bukan oleh REST API aplikasi.

### `GET /api/sessions/:id/events` (SSE)

```
event: status
data: {"harness":{"running":true,"ready":true,…},"logs":["…"]}
```

Dikirim tiap perubahan + keep-alive `: keep-alive` tiap 1.5 detik.

### `GET /api/harness/status`

`{ "harness": { "running", "starting", "ready", "projectId", "port", "hasToken",
"uptimeMs", "idleMinutes" }, "logs": [ … ] }`

### `POST /api/harness/stop`

`{ "ok": true }`

---

## GUI harness (reverse proxy)

| Path | Keterangan |
| --- | --- |
| `GET /app/*` | Proxy ke `127.0.0.1:$HARNESS_PORT`, token disuntikkan pada document pertama |
| `WS /app/*` | Upgrade di-handle (cadangan bila harness memakai WebSocket) |

Saat engine mati: `503` `{ "error": { "code": "harness_offline" } }`.

---

## GitHub (opsional)

| Method | Path | Respons |
| --- | --- | --- |
| GET | `/api/github/status` | `{ "configured": true\|false }` |
| GET | `/api/github/auth` | redirect ke GitHub OAuth (`repo read:user`) |
| GET | `/api/github/callback` | tukar code → cookie `dhw-gh-token` (8 jam) → redirect `/dashboard?github=connected` |
| GET | `/api/github/connection` | `{ "connected": true\|false }` |
| DELETE | `/api/github/connection` | `{ "ok": true }` |

Belum tersedia: import isi repo (pengganti sementara: upload zip).
