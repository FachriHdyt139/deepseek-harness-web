PRD — DEEPSEEK HARNESS WEB AI

Versi 1.0

---

1. INFORMASI PROYEK

Nama proyek: DeepSeek Harness Web AI

Tujuan utama:

Membangun sebuah aplikasi web AI berbasis "@deepseek-ai/dsh" (DeepSeek Harness) yang dapat digunakan melalui browser, dengan deployment utama pada Render Free Web Service.

Aplikasi harus menyediakan antarmuka web yang nyaman digunakan dari HP maupun desktop dan memungkinkan pengguna berinteraksi dengan AI coding agent melalui DeepSeek Harness.

Target utama adalah penggunaan pribadi / single-user atau penggunaan ringan.

---

2. TUJUAN

Aplikasi harus memungkinkan pengguna:

1. Membuka AI melalui browser.
2. Mengirim prompt ke AI.
3. Mendapatkan respons AI secara realtime.
4. Menggunakan kemampuan coding agent dari DeepSeek Harness.
5. Membuat dan mengedit file proyek.
6. Melihat perubahan file.
7. Menjalankan command tertentu di workspace jika didukung Harness.
8. Melanjutkan session percakapan.
9. Mengelola beberapa project/workspace.
10. Menyimpan data penting secara persistent menggunakan storage eksternal.
11. Menghubungkan project dengan GitHub.
12. Menggunakan API key AI melalui environment variable atau konfigurasi aman.
13. Mengakses aplikasi melalui HP maupun desktop.

---

3. TARGET USER

Target utama:

- Pengguna pribadi.
- Developer pemula.
- Pengguna HP Android.
- Pengguna yang ingin menggunakan AI coding agent melalui browser.
- Pengguna dengan resource server terbatas.

Aplikasi TIDAK ditargetkan sebagai platform SaaS besar pada versi pertama.

Prioritas:

stabilitas > keamanan > penggunaan RAM rendah > fitur > tampilan kompleks.

---

4. BATASAN SERVER

Deployment utama:

Render Free Web Service

Spesifikasi yang harus diasumsikan:

- RAM sekitar 512 MB.
- CPU terbatas.
- Filesystem bersifat ephemeral.
- Service dapat mengalami spin-down setelah tidak menerima traffic selama periode tertentu.
- Service dapat restart kapan saja.
- Tidak menggunakan Persistent Disk Render Free.
- Jangan mengandalkan filesystem lokal Render sebagai penyimpanan permanen.

Referensi Render Free:

"Render Free Web Services documentation" (https://reference-url-citation.invalid/0)

---

5. KONSEP ARSITEKTUR

Gunakan arsitektur berikut:

                         INTERNET
                            │
                            ▼
                    ┌────────────────┐
                    │    Browser     │
                    │ Android/Desktop│
                    └───────┬────────┘
                            │ HTTPS
                            ▼
                 ┌─────────────────────┐
                 │ Render Web Service  │
                 │                     │
                 │ Node.js Server      │
                 │        │            │
                 │        ▼            │
                 │ DeepSeek Harness    │
                 │        │            │
                 └────────┼────────────┘
                          │
             ┌────────────┼─────────────┐
             ▼            ▼             ▼
        AI Provider     Supabase       GitHub
        API            Storage         API

Render bertugas sebagai application/agent server.

AI model tetap menggunakan API cloud.

Jangan menjalankan local LLM pada Render Free.

---

6. TEKNOLOGI WAJIB

Gunakan:

Backend

- Node.js
- JavaScript atau TypeScript

Preferensi:

TypeScript

Tetapi jangan membuat konfigurasi TypeScript terlalu kompleks.

AI Agent

Gunakan:

@deepseek-ai/dsh

Gunakan versi yang kompatibel dengan repository DeepSeek-Harness-Portable.

Repository referensi:

https://github.com/techjarves/Deepseek-Harness-Portable

Jika versi package berubah, gunakan versi yang stabil dan dokumentasikan versinya di "package.json".

Frontend

Gunakan:

- React
- Vite

Jangan menggunakan framework frontend yang berat jika tidak diperlukan.

Styling

Gunakan:

- CSS biasa atau Tailwind CSS.

Prioritaskan bundle kecil.

Database / persistent storage

Gunakan:

Supabase

Supabase digunakan untuk:

- user data
- project metadata
- session metadata
- settings
- file metadata
- persistent project information

Jangan menggunakan filesystem Render untuk penyimpanan permanen.

---

7. STORAGE

7.1 Masalah

Render Free menggunakan filesystem ephemeral.

Artinya file yang dibuat di container dapat hilang ketika:

- service restart
- redeploy
- instance diganti
- service mengalami lifecycle restart

Karena itu aplikasi tidak boleh menganggap:

./data
./projects
./sessions

sebagai penyimpanan permanen.

---

8. SUPABASE

Gunakan Supabase sebagai persistent backend.

Struktur konseptual:

Supabase
├── Database
│   ├── users
│   ├── projects
│   ├── sessions
│   ├── files
│   └── settings
│
└── Storage
    ├── projects
    ├── uploads
    └── artifacts

Jangan menyimpan API key AI dalam tabel database sebagai plaintext.

---

9. PROJECT WORKSPACE

Setiap project mempunyai workspace sementara di Render.

Contoh:

/tmp/deepseek-harness/
    project-uuid/
        src/
        package.json
        README.md

Workspace lokal hanya digunakan selama session aktif.

Data penting harus disinkronkan ke Supabase atau GitHub.

---

10. PROJECT LIFECYCLE

Ketika user membuka project:

Supabase
    ↓
Download project files
    ↓
Create temporary workspace
    ↓
Start Harness session
    ↓
User bekerja
    ↓
Changes detected
    ↓
Save/sync changes

Ketika session selesai:

Workspace
    ↓
Save required files
    ↓
Upload to persistent storage
    ↓
Cleanup temporary workspace

---

11. GITHUB

Aplikasi harus dirancang agar project dapat terhubung dengan GitHub.

Fitur:

- Connect GitHub.
- Import repository.
- Clone repository ke workspace.
- Commit changes.
- Push changes.
- Pull changes.
- View git status.

Jangan meminta password GitHub.

Gunakan OAuth / GitHub App / Personal Access Token sesuai implementasi yang aman.

Token tidak boleh ditampilkan di frontend.

---

12. AUTHENTICATION

Versi pertama harus memiliki authentication.

Gunakan:

Supabase Auth

Metode minimal:

- Email/password

Opsional:

- Google OAuth

User harus login sebelum mengakses workspace.

Route:

/login
/dashboard
/project/:id
/settings

Unauthenticated user yang mencoba mengakses protected route harus diarahkan ke:

/login

---

13. UI

Desain harus:

- modern
- minimal
- responsive
- mobile-first
- ringan
- nyaman di Android
- nyaman di desktop

Jangan membuat UI terlalu kompleks.

---

14. LAYOUT DESKTOP

Gunakan struktur:

┌──────────────────────────────────────────────────────────┐
│ Logo        Project Name        Status       User        │
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│ Explorer   │             AI CHAT                         │
│            │                                             │
│ Files      │                                             │
│            │                                             │
│ src/       │                                             │
│ app.py     │                                             │
│ index.js   │                                             │
│            │                                             │
├────────────┴─────────────────────────────────────────────┤
│ Terminal / Logs                                          │
├──────────────────────────────────────────────────────────┤
│ Prompt input                              [Send]          │
└──────────────────────────────────────────────────────────┘

---

15. LAYOUT MOBILE

Pada HP:

┌───────────────────────┐
│ ☰  Project       ●    │
├───────────────────────┤
│                       │
│       AI CHAT         │
│                       │
│                       │
│                       │
├───────────────────────┤
│ Terminal / Files      │
├───────────────────────┤
│ Write message...  ➤   │
└───────────────────────┘

File explorer dapat dibuka menggunakan drawer.

---

16. AI CHAT

Chat harus mendukung:

- user message
- assistant message
- tool execution
- command execution
- file modifications
- errors
- status
- streaming response

Contoh:

You:
Buatkan halaman login modern.

AI:
Saya akan membuat halaman login.

Tool:
Creating src/Login.jsx

Tool:
Creating src/Login.css

AI:
Halaman login telah dibuat.

---

17. REALTIME STREAMING

Respons AI harus ditampilkan secara realtime apabila DeepSeek Harness API/session memungkinkan.

Jangan menunggu seluruh response selesai jika streaming dapat digunakan.

Gunakan salah satu:

- WebSocket
- Server-Sent Events

Pilih implementasi yang paling ringan dan kompatibel dengan Harness.

Prioritas:

SSE terlebih dahulu, kecuali Harness membutuhkan WebSocket.

---

18. DEEPSEEK HARNESS

Integrasikan:

@deepseek-ai/dsh

Jangan menulis ulang fungsi inti Harness.

Harness harus tetap menjadi AI agent engine.

Aplikasi hanya menyediakan:

Web UI
   ↓
Application Server
   ↓
Harness

---

19. PORT HANDLING

Render menyediakan environment variable:

PORT

Server WAJIB listen pada:

0.0.0.0

Contoh konsep:

server.listen(process.env.PORT || 3000, "0.0.0.0");

Jangan hanya listen pada:

localhost
127.0.0.1

karena Render tidak dapat mengakses service dengan benar jika hanya bind ke loopback.

---

20. HARNESS WEB SERVER

Jika "dsh web" menyediakan server internal:

DeepSeek Harness
        ↓
localhost:HARNESS_PORT
        ↓
Node.js reverse proxy
        ↓
0.0.0.0:$PORT
        ↓
Internet

Jika Harness dapat dikonfigurasi langsung menggunakan:

0.0.0.0:$PORT

gunakan konfigurasi tersebut.

Jangan membuat dua public server yang berebut port Render.

---

21. REVERSE PROXY

Jika diperlukan, backend harus menjalankan:

Public server
    ↓
Reverse proxy
    ↓
Harness Web Server

Proxy harus mendukung:

- GET
- POST
- PUT
- DELETE
- streaming
- SSE
- WebSocket jika diperlukan
- headers
- cookies
- authorization

Jangan buffer response streaming.

---

22. MEMORY OPTIMIZATION

RAM hanya sekitar 512 MB.

Karena itu:

WAJIB

- Hindari dependency tidak diperlukan.
- Jangan menjalankan banyak worker.
- Jangan menjalankan local model.
- Jangan menyimpan file besar di RAM.
- Gunakan streaming.
- Batasi concurrency.
- Bersihkan temporary files.
- Batasi jumlah session aktif.

Target

Aplikasi harus dirancang untuk:

1 active user

terlebih dahulu.

---

23. CONCURRENCY

Default:

MAX_ACTIVE_SESSIONS=1

Jika memory memungkinkan dapat dinaikkan melalui environment variable.

Contoh:

MAX_ACTIVE_SESSIONS=2

Jangan default ke banyak concurrent agents.

Jika limit tercapai:

Server busy.

Please wait for the current AI session to finish.

---

24. PROCESS MANAGEMENT

Jangan membuat proses zombie.

Setiap child process harus:

- memiliki timeout
- memiliki cleanup
- menangani SIGTERM
- menangani SIGINT
- menangani error
- dibersihkan ketika session selesai

Saat Render menghentikan service:

SIGTERM
   ↓
stop new tasks
   ↓
finish/abort active task
   ↓
cleanup temporary files
   ↓
exit

---

25. COMMAND EXECUTION

AI coding agent dapat menjalankan command jika fitur tersebut memang didukung Harness.

Namun command harus dijalankan dalam workspace project.

Contoh:

npm install
npm run build
python app.py
git status

Jangan memberikan shell host secara bebas kepada browser.

User hanya dapat mengakses command melalui agent/session yang sudah diautentikasi.

---

26. SECURITY COMMAND EXECUTION

Jangan membuat endpoint seperti:

POST /exec
{
  "command": "..."
}

yang dapat dieksekusi anonymous user.

Semua command execution harus melewati:

Authentication
        ↓
Authorization
        ↓
Project ownership
        ↓
Workspace validation
        ↓
Command execution

---

27. PATH SECURITY

Semua file path harus divalidasi.

Dilarang:

../../etc/passwd

atau:

../../../

Gunakan path normalization.

File harus tetap berada di dalam workspace project.

---

28. FILE UPLOAD

User dapat upload project:

.zip

atau file project yang didukung.

Flow:

Upload
 ↓
Validate size
 ↓
Validate extension
 ↓
Extract safely
 ↓
Prevent path traversal
 ↓
Create workspace
 ↓
Register project

Batasi ukuran upload melalui environment variable.

Contoh:

MAX_UPLOAD_MB=50

Jangan default terlalu besar karena RAM/storage Render terbatas.

---

29. ZIP SECURITY

Jangan langsung extract ZIP.

Periksa setiap entry.

Tolak:

../../file

absolute path:

/etc/passwd

dan symlink berbahaya.

---

30. PROJECT FILE EXPLORER

Explorer harus mendukung:

- folder
- file
- create file
- create folder
- rename
- delete
- download
- upload
- open file

File editor dapat menggunakan:

Monaco Editor

Tetapi pastikan bundle tidak terlalu berat untuk mobile.

Jika Monaco terlalu berat, gunakan editor yang lebih ringan.

---

31. EDITOR

Minimal support:

JavaScript
TypeScript
Python
HTML
CSS
JSON
Markdown
Shell

Fitur:

- syntax highlighting
- search
- save
- unsaved indicator
- line number

---

32. SESSION

Setiap AI conversation harus mempunyai:

session_id
project_id
user_id
created_at
updated_at
title
status

Session dapat dilanjutkan.

---

33. CHAT HISTORY

Chat history harus persistent.

Simpan metadata dan pesan penting di Supabase.

Jangan menyimpan seluruh history hanya di RAM.

---

34. DATABASE STRUCTURE

Buat tabel minimal:

users

Supabase Auth menangani user authentication.

---

projects

id
user_id
name
description
repository_url
storage_path
created_at
updated_at

---

sessions

id
project_id
user_id
title
status
created_at
updated_at

---

messages

id
session_id
role
content
metadata
created_at

Role:

user
assistant
system
tool

---

files

id
project_id
path
storage_path
size
hash
created_at
updated_at

---

35. SUPABASE STORAGE

Gunakan bucket:

projects

Jika membutuhkan artifact:

artifacts

Pastikan access policy membatasi user hanya dapat mengakses file miliknya.

---

36. ENVIRONMENT VARIABLES

Jangan hardcode secret.

Gunakan:

NODE_ENV=production

PORT=<Render otomatis>

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

AI_API_KEY=

MAX_UPLOAD_MB=50
MAX_ACTIVE_SESSIONS=1
SESSION_TIMEOUT_MINUTES=30

Nama variable dapat disesuaikan dengan kebutuhan library.

---

37. API KEY AI

Jangan commit API key.

Dilarang:

const API_KEY = "sk-xxxxxxxx";

Gunakan:

process.env.AI_API_KEY

atau mekanisme secret yang disediakan Harness.

---

38. MULTI-PROVIDER AI

Versi pertama tidak perlu membuat sistem provider yang terlalu kompleks.

Tetapi arsitektur harus memungkinkan provider diganti.

Contoh:

AI_PROVIDER=deepseek

Kemudian konfigurasi:

AI_API_KEY=
AI_BASE_URL=
AI_MODEL=

Jika DeepSeek Harness sendiri menentukan konfigurasi provider, ikuti konfigurasi resmi package tersebut.

Jangan membuat adapter provider palsu.

---

39. LOCAL MODEL

Local model:

TIDAK WAJIB.

Jangan download model LLM ke Render.

Repository portable sendiri menjelaskan bahwa DeepSeek Harness secara default menggunakan cloud API dan local model merupakan pilihan konfigurasi Harness. "DeepSeek-Harness-Portable repository" (https://reference-url-citation.invalid/1)

Render Free tidak boleh digunakan untuk menjalankan LLM besar secara lokal.

---

40. UPTIMEROBOT

Aplikasi boleh digunakan bersama UptimeRobot untuk mengurangi kemungkinan idle spin-down.

Konfigurasi monitoring:

GET /

atau endpoint ringan:

GET /health

Endpoint:

/health

harus:

- tidak membutuhkan login
- tidak menjalankan AI
- tidak mengakses database berat
- memberikan response cepat

Contoh:

{
  "status": "ok"
}

UptimeRobot Free menyediakan monitoring dengan interval 5 menit dan hingga 50 monitor pada paket Free. "UptimeRobot Free Monitoring" (https://reference-url-citation.invalid/2)

Namun aplikasi tidak boleh menganggap UptimeRobot sebagai mekanisme uptime permanen. Render tetap dapat melakukan restart, service lifecycle, atau pembatasan lainnya. Render juga menyatakan Free Web Services dapat spin down setelah 15 menit tanpa inbound traffic.

---

41. RENDER HEALTH CHECK

Gunakan:

/health

sebagai health endpoint.

Response:

HTTP 200

jika server hidup.

Jangan menjalankan:

dsh

atau AI request dari health endpoint.

---

42. STARTUP

Startup harus ringan.

Urutan:

Node starts
 ↓
Load environment
 ↓
Validate required environment
 ↓
Initialize Supabase client
 ↓
Initialize application
 ↓
Start Harness when needed
 ↓
Listen on Render PORT

Jangan menjalankan proses berat yang tidak diperlukan saat boot.

---

43. LAZY START

Jika memungkinkan, DeepSeek Harness session dibuat hanya ketika user benar-benar memulai session.

Jangan membuat banyak Harness process ketika server baru boot.

Tujuannya:

LOW RAM
LOW CPU
FAST STARTUP

---

44. AUTO CLEANUP

Workspace lama harus dibersihkan.

Contoh:

SESSION_TIMEOUT_MINUTES=30

Setelah timeout:

stop agent
cleanup workspace
release memory
save required state

---

45. ERROR HANDLING

Semua error harus mempunyai pesan yang mudah dipahami.

Contoh:

AI API key belum dikonfigurasi.

Session gagal dimulai.
Silakan coba lagi.

Server sedang kehabisan resource.
Silakan tunggu beberapa saat.

Jangan menampilkan stack trace kepada user production.

Stack trace hanya masuk server logs.

---

46. LOGGING

Gunakan structured logging sederhana.

Contoh:

[INFO] Server started
[INFO] User authenticated
[INFO] Project loaded
[INFO] Harness session started
[INFO] Tool execution started
[ERROR] Harness process exited

Jangan log:

- API key
- password
- access token
- cookies
- secret

---

47. RATE LIMIT

Karena Render Free memiliki resource terbatas, gunakan rate limiting.

Minimal:

chat requests
upload requests
GitHub operations

Contoh:

MAX_CHAT_REQUESTS_PER_MINUTE=10

Nilai dapat disesuaikan setelah testing.

---

48. REQUEST SIZE

Batasi:

JSON body
file upload
prompt size

Jangan menerima request unlimited.

---

49. FRONTEND SECURITY

Jangan menyimpan:

SUPABASE_SERVICE_ROLE_KEY
AI_API_KEY
GITHUB_CLIENT_SECRET

di frontend.

Frontend hanya boleh menerima credential yang memang aman untuk public client.

---

50. SUPABASE SECURITY

Gunakan Row Level Security.

User A tidak boleh membaca:

projects milik User B

User A juga tidak boleh mengakses:

sessions User B
messages User B
files User B

---

51. PROJECT OWNERSHIP

Setiap request project harus diverifikasi:

authenticated user
        ↓
project ID
        ↓
project.user_id == authenticated user

Jika tidak cocok:

403 Forbidden

---

52. GITHUB SECURITY

OAuth callback harus divalidasi.

Jangan menerima arbitrary callback URL.

Gunakan state parameter untuk mencegah CSRF.

Token GitHub harus:

- encrypted jika disimpan
- atau gunakan mekanisme token storage yang aman
- tidak pernah dikirim ke frontend sebagai plaintext jika tidak diperlukan

---

53. DASHBOARD

Dashboard menampilkan:

Projects
Recent Sessions
Create Project
Import GitHub
Settings
Logout

Contoh:

+ New Project

My Projects

┌──────────────────────┐
│ Android App          │
│ Updated 2 min ago    │
│ GitHub connected     │
└──────────────────────┘

┌──────────────────────┐
│ Website               │
│ Updated yesterday     │
└──────────────────────┘

---

54. CREATE PROJECT

User dapat membuat:

Blank Project

atau:

Import ZIP

atau:

Import GitHub Repository

---

55. AI PROJECT INITIALIZATION

User dapat mengatakan:

Buatkan aplikasi Android sederhana...

AI kemudian bekerja pada workspace.

Agent harus menampilkan aktivitasnya.

---

56. TOOL ACTIVITY

UI harus memperlihatkan aktivitas agent.

Contoh:

● Thinking

✓ Read package.json
✓ Created src/App.jsx
✓ Modified src/App.css
▶ Running npm install
▶ Running npm run build

Jangan menampilkan informasi internal model yang tidak disediakan Harness.

---

57. TERMINAL PANEL

Terminal/log panel hanya menampilkan output command yang dijalankan agent.

Contoh:

$ npm install

added 125 packages

$ npm run build

Build completed successfully.

---

58. APK BUILDING

Penting

Render Free bukan build server Android utama.

Jangan memasukkan:

Android SDK besar
Gradle cache besar
Android NDK
Java toolchains besar

ke image Render jika dapat dihindari.

Untuk versi pertama:

AI Web App
     ↓
Generate Android project
     ↓
GitHub

APK build dilakukan di environment terpisah.

---

59. ARSITEKTUR BUILD APK FUTURE

Versi berikutnya:

Web AI
   ↓
GitHub
   ↓
External Build Server
   ↓
Gradle
   ↓
APK
   ↓
Supabase Storage
   ↓
Download APK

Build server dapat berupa:

- GitHub Actions
- dedicated builder
- cloud build environment

Render Free hanya menangani application layer.

---

60. GITHUB ACTIONS APK

Jika menggunakan GitHub Actions:

AI modifies project
        ↓
Commit
        ↓
Push GitHub
        ↓
GitHub Actions
        ↓
Gradle build
        ↓
APK artifact

Jangan menjalankan build Android berat pada Render Free secara default.

---

61. DOWNLOAD ARTIFACT

APK / ZIP hasil build harus disimpan pada:

Supabase Storage

atau GitHub Release jika sesuai.

Jangan menyimpan artifact permanen di:

/tmp

atau filesystem Render.

---

62. PWA

Web application sebaiknya dapat dibuat sebagai PWA.

Fitur:

- install ke home screen
- icon
- splash screen
- responsive layout
- offline shell

Namun AI backend tetap membutuhkan internet.

Jangan mengklaim aplikasi AI dapat berjalan offline jika backend berada di Render.

---

63. MOBILE OPTIMIZATION

Target:

- Android Chrome
- Firefox Android
- modern desktop browsers

Hindari:

- UI terlalu besar
- animasi berat
- background video
- dependency besar tanpa kebutuhan
- polling berlebihan

---

64. DARK MODE

Default:

Dark Mode

Berikan toggle:

Dark
Light
System

---

65. UI STYLE

Style:

Modern
Minimal
Developer-focused
Dark
Clean
Responsive

Jangan membuat tampilan seperti dashboard enterprise yang terlalu kompleks.

---

66. COLOR

Gunakan satu accent color utama.

Hindari terlalu banyak gradient dan animasi.

Status:

green = success
yellow = warning
red = error
gray = inactive

---

67. LOADING STATE

Semua operasi berat harus memiliki loading state.

Contoh:

Starting AI...
Loading project...
Saving...
Uploading...
Building...

---

68. OFFLINE / CONNECTION ERROR

Jika koneksi terputus:

Connection lost.

Reconnecting...

Jika reconnect berhasil:

Connected.

---

69. SESSION RECONNECT

Jika browser refresh:

user login
 ↓
project restored
 ↓
session state loaded

Jika agent process sudah mati:

Session unavailable.
Start a new agent session.

Jangan berpura-pura session masih aktif jika process sudah mati.

---

70. API ROUTES

Minimal backend API:

GET    /health

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
DELETE /api/projects/:id

GET    /api/projects/:id/files
POST   /api/projects/:id/files
PUT    /api/projects/:id/files
DELETE /api/projects/:id/files

GET    /api/sessions
POST   /api/sessions
GET    /api/sessions/:id

GET    /api/sessions/:id/messages
POST   /api/sessions/:id/message

POST   /api/projects/:id/upload

GET    /api/github/status
GET    /api/github/auth
GET    /api/github/callback

Sesuaikan endpoint jika integrasi Harness membutuhkan struktur berbeda.

---

71. SSE

Jika menggunakan SSE:

POST /api/sessions/:id/message

atau endpoint streaming khusus.

Response:

event: message
data: ...

event: tool
data: ...

event: status
data: ...

event: done
data: ...

Frontend harus membaca event secara incremental.

---

72. DATABASE MIGRATION

Database schema harus disediakan dalam:

supabase/migrations/

Contoh:

001_initial.sql
002_rls.sql

OpenCode harus menyediakan SQL lengkap.

User cukup copy SQL tersebut ke Supabase atau gunakan migration tooling.

---

73. CONFIGURATION

Buat:

.env.example

Contoh:

NODE_ENV=development

PORT=3000

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

AI_API_KEY=
AI_BASE_URL=
AI_MODEL=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

MAX_UPLOAD_MB=50
MAX_ACTIVE_SESSIONS=1
SESSION_TIMEOUT_MINUTES=30

Jangan memasukkan secret nyata.

---

74. RENDER CONFIGURATION

Buat:

render.yaml

Contoh konsep:

services:
  - type: web
    name: deepseek-harness-web
    runtime: node
    plan: free

    buildCommand: npm ci && npm run build

    startCommand: npm start

    healthCheckPath: /health

    envVars:
      - key: NODE_ENV
        value: production

      - key: SUPABASE_URL
        sync: false

      - key: SUPABASE_ANON_KEY
        sync: false

      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false

      - key: AI_API_KEY
        sync: false

Jangan hardcode secret.

Render akan menyediakan "PORT".

---

75. PACKAGE.JSON

Package harus memiliki script minimal:

{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start": "node server.js"
  }
}

Jika backend membutuhkan TypeScript, gunakan build step yang sesuai.

---

76. MONOREPO

Gunakan struktur sederhana:

deepseek-harness-web/
│
├── client/
│   ├── src/
│   ├── package.json
│   └── ...
│
├── server/
│   ├── ...
│
├── supabase/
│   └── migrations/
│
├── public/
│
├── .env.example
├── .gitignore
├── package.json
├── render.yaml
├── README.md
└── PRD.md

Namun jika struktur monorepo membuat deployment terlalu kompleks, gunakan single Node project dengan:

src/
client/
server/

Prioritaskan kesederhanaan deployment.

---

77. GITIGNORE

WAJIB memasukkan:

node_modules/
.env
.env.*
!.env.example
dist/
build/
.tmp/
temp/
.cache/
logs/
*.log

Jangan memasukkan:

API keys
tokens
passwords
Supabase secrets
GitHub secrets

---

78. README

README harus menjelaskan dari NOL:

1. Apa aplikasi ini.
2. Requirement.
3. Install Node.
4. Clone repository.
5. Install dependency.
6. Setup ".env".
7. Setup Supabase.
8. Setup GitHub OAuth.
9. Run development server.
10. Build production.
11. Deploy Render.
12. Setup UptimeRobot.
13. Troubleshooting.
14. Limitasi Render Free.

README harus ditulis untuk beginner.

---

79. INSTALLATION LOCAL

Target:

npm install
npm run dev

Frontend/backend harus dapat dijalankan secara lokal.

---

80. PRODUCTION TEST

Sebelum deployment, test:

npm ci
npm run build
npm start

Kemudian:

GET /health

harus menghasilkan:

{
  "status": "ok"
}

---

81. TESTING

Minimal test:

Authentication

- login
- logout
- unauthorized access

Projects

- create
- read
- delete
- ownership

Files

- create
- read
- update
- delete
- path traversal protection

AI

- create session
- send prompt
- streaming
- error handling

Storage

- upload
- download
- persistence

GitHub

- OAuth
- import
- repository access

---

82. HEALTH TEST

Test:

GET /health

Target:

HTTP 200

Response cepat.

Tidak boleh bergantung pada AI provider.

---

83. MEMORY TEST

Aplikasi harus diuji pada kondisi memory terbatas.

Simulasikan:

512 MB

Periksa:

Node memory
Harness memory
Browser connection
temporary files
child processes

Jangan mengklaim aplikasi aman dari OOM sebelum dilakukan testing.

---

84. MEMORY LIMIT

Jika diperlukan, gunakan:

NODE_OPTIONS=--max-old-space-size=384

Namun jangan langsung memasangnya jika menyebabkan Harness gagal.

Agent harus:

1. mengukur penggunaan memory
2. menguji
3. baru menentukan limit yang aman

Jangan menggunakan memory limit sebagai solusi untuk memory leak.

---

85. GRACEFUL SHUTDOWN

Implementasikan:

SIGTERM
SIGINT

Saat shutdown:

stop accepting new sessions
 ↓
terminate child processes
 ↓
save state
 ↓
cleanup temp
 ↓
close connections
 ↓
exit

---

86. RENDER SPIN-DOWN

Aplikasi harus mampu menghadapi:

cold start

Jika service sleep:

Browser
 ↓
Render
 ↓
startup
 ↓
application ready

Frontend harus menampilkan:

Starting server...

jika request membutuhkan waktu lebih lama.

Jangan menganggap server selalu hidup.

---

87. UPTIMEROBOT ENDPOINT

Gunakan:

https://DOMAIN/health

bukan:

https://DOMAIN/api/chat

UptimeRobot hanya perlu melakukan request ringan.

---

88. IMPORTANT RENDER LIMITATION

Jangan mengimplementasikan desain yang membutuhkan:

permanent local files
permanent local database
permanent background worker
always-running process
large local model
heavy Android build environment

pada Render Free.

---

89. ARCHITECTURE PRINCIPLE

Gunakan prinsip:

Render = compute/application
Supabase = persistent data/storage
GitHub = source control
AI Provider = model inference
Harness = AI agent engine
External Builder = heavy builds

Jangan mencampurkan semua fungsi pada satu server Render Free.

---

90. FAILURE RECOVERY

Jika Render restart:

Server restart
 ↓
User opens application
 ↓
Login/session restored from Supabase
 ↓
Project restored
 ↓
Temporary workspace recreated

Jangan kehilangan project yang sudah disimpan.

---

91. PROJECT SYNC

Perubahan file dapat disimpan:

workspace
 ↓
Supabase Storage

dan/atau:

workspace
 ↓
GitHub commit

User harus dapat memilih kapan melakukan commit GitHub.

---

92. AUTOSAVE

Implementasikan autosave dengan debounce.

Contoh:

User berhenti mengetik
 ↓
wait 1–2 seconds
 ↓
save

Jangan membuat request database untuk setiap keystroke.

---

93. CHAT AUTOSAVE

Pesan user dan assistant harus disimpan setelah event penting.

Contoh:

user sends message
 ↓
save user message
 ↓
agent executes
 ↓
stream response
 ↓
save final assistant response

Tool events dapat disimpan sebagai metadata jika diperlukan.

---

94. API ERROR STATES

Tangani:

401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
413 Payload Too Large
429 Too Many Requests
500 Internal Server Error
502 AI Provider Error
503 Service Unavailable

Frontend harus memberikan pesan yang mudah dimengerti.

---

95. AI PROVIDER ERROR

Jika AI API gagal:

AI provider tidak tersedia.

Periksa API key atau coba lagi nanti.

Jangan crash seluruh server.

---

96. SESSION ERROR

Jika Harness process crash:

AI session stopped unexpectedly.

Start a new session.

Server tetap hidup.

---

97. SECURITY HEADERS

Gunakan security headers yang sesuai.

Minimal pertimbangkan:

Content-Security-Policy
X-Content-Type-Options
Referrer-Policy
X-Frame-Options

Jangan membuat CSP yang menyebabkan frontend tidak bekerja.

---

98. CORS

Jika frontend dan backend berasal dari domain yang sama:

tidak perlu membuka CORS secara luas.

Jangan gunakan:

Access-Control-Allow-Origin: *

untuk endpoint authenticated jika tidak diperlukan.

---

99. CSRF

Jika menggunakan cookie-based authentication, gunakan perlindungan CSRF yang sesuai.

Jika menggunakan Supabase browser authentication, ikuti pola keamanan resmi Supabase.

---

100. SECRETS

Semua secret hanya boleh berada pada:

.env

lokal

atau:

Render Environment Variables

atau:

Supabase secrets

Jangan di GitHub repository.

---

101. LOG REDACTION

Sebelum logging request:

hapus/redact:

authorization
cookie
api_key
token
secret
password

---

102. PERFORMANCE

Prioritas:

Fast first load
Low RAM
Low CPU
Low network
Streaming
Minimal dependencies

---

103. FRONTEND BUNDLE

Jangan memasukkan library besar tanpa alasan.

Jika library tidak digunakan:

remove it

---

104. DATABASE PERFORMANCE

Gunakan index pada:

projects.user_id
sessions.project_id
sessions.user_id
messages.session_id
files.project_id

---

105. PAGINATION

Chat history dan project list harus mendukung pagination jika data bertambah.

Jangan mengambil seluruh database dalam satu request.

---

106. FILE SIZE

Default:

MAX_UPLOAD_MB=50

Dapat dikonfigurasi.

Jangan menaikkan menjadi ratusan MB pada Render Free tanpa alasan.

---

107. ARTIFACT SIZE

APK/ZIP besar harus disimpan pada external storage.

Jangan menjadikan Render filesystem sebagai artifact repository.

---

108. USER SETTINGS

Settings minimal:

AI model
Theme
GitHub connection
Session timeout

API key sebaiknya dikonfigurasi melalui secure server-side environment variable pada deployment pribadi.

Jika nanti mendukung API key per-user, desain harus menggunakan encrypted secret storage.

---

109. ADMIN

Versi pertama:

tidak membutuhkan admin panel.

Karena target adalah penggunaan pribadi.

---

110. MULTI-TENANT

Database tetap harus menggunakan "user_id", tetapi jangan mengoptimalkan untuk ribuan pengguna.

Target:

1–5 active users

untuk testing.

---

111. OBSERVABILITY

Tambahkan informasi:

server uptime
active sessions
memory usage

Hanya untuk admin/debug internal.

Jangan expose detail server sensitif kepada public.

---

112. DEBUG MODE

Gunakan:

NODE_ENV=development

untuk development.

Production:

NODE_ENV=production

Stack trace tidak boleh ditampilkan ke user production.

---

113. DEVELOPMENT MODE

Local development:

npm run dev

Production:

npm run build
npm start

---

114. DEPLOYMENT FLOW

Urutan:

OpenCode
   ↓
Build project
   ↓
Run tests
   ↓
npm run build
   ↓
Git commit
   ↓
GitHub
   ↓
Render
   ↓
Deploy
   ↓
Health check

---

115. RENDER DEPLOYMENT

Render configuration:

Environment:
Node

Build:
npm ci && npm run build

Start:
npm start

Health Check:
/health

---

116. ENVIRONMENT VARIABLES RENDER

User harus mengisi:

SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AI_API_KEY

dan variable GitHub jika fitur GitHub diaktifkan.

---

117. UPTIMEROBOT SETUP

Setelah deployment:

1. Copy Render URL.
2. Buka UptimeRobot.
3. Create Monitor.
4. Monitor Type: HTTP(s).
5. URL: https://DOMAIN/health
6. Interval: 5 minutes.
7. Save.

Tujuannya menjaga traffic ringan dan mendeteksi downtime.

Jangan membuat endpoint health melakukan pekerjaan berat.

---

118. CUSTOM DOMAIN

Aplikasi harus mendukung custom domain Render.

Contoh:

https://ai.example.com

Tidak boleh ada konfigurasi frontend yang mengunci domain Render tertentu.

Gunakan:

window.location.origin

atau environment configuration.

---

119. NO HARD-CODED DOMAIN

Dilarang:

const API_URL = "https://deepseek-harness.onrender.com";

Gunakan relative API:

/api/...

jika frontend dan backend berada pada domain yang sama.

---

120. NO HARD-CODED PORT

Dilarang:

PORT=3000

sebagai satu-satunya port production.

Gunakan:

process.env.PORT || 3000

---

121. NO LOCAL LLM

Jangan:

download model
run Ollama
run llama.cpp
run vLLM

pada Render Free.

---

122. NO DOCKER REQUIREMENT

Versi pertama sebaiknya tidak membutuhkan Docker.

Deployment Render harus menggunakan Node runtime biasa.

Jika Docker benar-benar diperlukan oleh Harness, dokumentasikan alasan dan dampaknya terlebih dahulu.

---

123. NO UNNECESSARY DOWNLOAD

Jangan menggunakan portable installer yang mendownload Node runtime tambahan jika Render sudah menyediakan Node.

Gunakan Node runtime Render.

---

124. HARNESS VERSION

Pin dependency.

Contoh:

"@deepseek-ai/dsh": "0.1.7-rc.2"

Jika versi tersebut ternyata tidak kompatibel dengan deployment, agent harus:

1. memeriksa package resmi
2. memilih versi kompatibel
3. menjelaskan perubahan
4. memperbarui lockfile

Jangan menggunakan:

*
latest

untuk dependency kritis.

---

125. NODE VERSION

Gunakan Node version yang kompatibel dengan DeepSeek Harness.

Jika repository portable menentukan Node:

24.21.0

gunakan versi tersebut atau versi Node 24.x yang kompatibel.

Tambahkan:

engines

ke "package.json".

---

126. DEPENDENCY LOCK

Commit:

package-lock.json

atau lockfile package manager yang digunakan.

Render harus menggunakan deterministic installation.

---

127. INSTALL

Prefer:

npm ci

daripada:

npm install

pada production build.

---

128. SOURCE CODE QUALITY

Kode harus:

- modular
- readable
- documented
- typed jika TypeScript
- tidak duplikatif
- mudah diperbaiki OpenCode

Jangan membuat satu file berisi seluruh aplikasi.

---

129. RECOMMENDED STRUCTURE

Gunakan:

src/
├── server/
│   ├── app.js
│   ├── config.js
│   ├── routes/
│   ├── middleware/
│   ├── services/
│   │   ├── harness/
│   │   ├── supabase/
│   │   ├── github/
│   │   └── storage/
│   └── utils/
│
└── client/
    ├── components/
    ├── pages/
    ├── hooks/
    ├── services/
    └── styles/

Jika menggunakan TypeScript:

.ts
.tsx

---

130. HARNESS SERVICE

Buat abstraction:

HarnessService

Tugas:

startSession()
sendMessage()
streamResponse()
stopSession()
getStatus()
cleanup()

Jangan menyebarkan pemanggilan Harness ke seluruh codebase.

---

131. STORAGE SERVICE

Buat:

StorageService

Tugas:

uploadFile()
downloadFile()
deleteFile()
listFiles()

---

132. PROJECT SERVICE

Buat:

ProjectService

Tugas:

createProject()
getProject()
deleteProject()
restoreWorkspace()
syncWorkspace()

---

133. GITHUB SERVICE

Buat:

GitHubService

Tugas:

connect()
getRepositories()
cloneRepository()
commit()
push()
pull()

---

134. AUTH SERVICE

Gunakan Supabase Auth.

Backend harus memvalidasi authenticated user sebelum operasi protected.

---

135. ERROR CLASS

Gunakan error types yang jelas:

AuthenticationError
AuthorizationError
ValidationError
StorageError
HarnessError
GitHubError
RateLimitError

---

136. AUDIT LOG

Versi pertama tidak wajib membuat audit log kompleks.

Namun event penting dapat dicatat:

login
project_created
session_started
session_stopped
github_connected

Jangan menyimpan secret.

---

137. DATA RETENTION

Karena storage gratis terbatas:

Jangan menyimpan file temporary selamanya.

Temporary workspace:

cleanup after session

Chat history:

persistent.

Project:

persistent.

Build artifacts:

persistent external storage.

---

138. QUOTA HANDLING

Jika Supabase/storage hampir penuh:

Tampilkan:

Storage limit reached.
Please delete unused projects/files.

Jangan crash server.

---

139. API TIMEOUT

Semua external request harus mempunyai timeout.

Contoh:

Supabase
GitHub
AI provider
Storage

Jangan membiarkan request menggantung selamanya.

---

140. RETRY

Retry hanya untuk error yang aman di-retry.

Contoh:

network timeout
temporary 5xx

Jangan retry tanpa batas.

Gunakan:

max retries = 2–3

---

141. AI STREAM DISCONNECT

Jika browser disconnect:

agent process
       ↓
continue or stop

Default untuk Render Free:

stop session jika tidak ada client dan task tidak diperlukan, untuk menghemat resource.

---

142. BROWSER REFRESH

Refresh tidak boleh membuat:

duplicate agent

Gunakan session ID.

---

143. DUPLICATE REQUEST

Gunakan idempotency jika diperlukan untuk operasi:

commit
upload
project creation

---

144. PROMPT LIMIT

Batasi panjang prompt.

Contoh awal:

MAX_PROMPT_CHARS=20000

Nilai dapat disesuaikan.

---

145. TOOL OUTPUT LIMIT

Jangan mengirim output terminal raksasa ke browser.

Gunakan truncation:

MAX_TOOL_OUTPUT_CHARS

Contoh:

20000

---

146. LOG LIMIT

Batasi log memory.

Jangan menyimpan seluruh terminal output dalam RAM.

Streaming output ke client dan simpan hanya informasi yang diperlukan.

---

147. FILE TREE LIMIT

Jika project mempunyai ribuan file:

Jangan load seluruh file tree sekaligus.

Gunakan lazy loading.

---

148. LARGE FILES

Editor tidak boleh membuka file raksasa tanpa warning.

Contoh:

This file is too large to edit in browser.

---

149. BINARY FILES

Jangan mencoba menampilkan binary file sebagai text.

Contoh:

PNG
JPEG
APK
ZIP
PDF

Gunakan download/preview yang sesuai.

---

150. IMAGE PREVIEW

Image file dapat ditampilkan dengan preview jika ukurannya aman.

---

151. DELETE CONFIRMATION

Project/file delete harus meminta confirmation.

Contoh:

Delete "my-project"?

[Cancel] [Delete]

---

152. GITHUB IMPORT

Saat import:

GitHub repo
 ↓
validate access
 ↓
clone
 ↓
create project
 ↓
save metadata

Jika gagal:

Repository could not be imported.

---

153. GIT COMMAND SECURITY

Git command harus dijalankan hanya pada workspace.

---

154. PUBLIC PROJECT

Versi pertama:

Semua project private.

Jangan membuat public sharing default.

---

155. SHARING

Versi pertama tidak membutuhkan public sharing.

Fitur ini dapat ditambahkan kemudian.

---

156. API DOCUMENTATION

Tambahkan:

docs/API.md

Berisi:

- endpoint
- request
- response
- authentication
- error codes

---

157. ARCHITECTURE DOCUMENTATION

Tambahkan:

docs/ARCHITECTURE.md

Jelaskan:

Browser
 ↓
Server
 ↓
Harness
 ↓
AI
 ↓
Supabase/GitHub

---

158. TROUBLESHOOTING

README wajib memiliki:

Harness gagal start

Periksa:

Node version
package version
environment variables
logs

Supabase gagal

Periksa:

SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RLS

Render 502

Periksa:

PORT
0.0.0.0
startCommand
startup logs

Memory OOM

Kurangi:

concurrency
file size
session count
tool output

---

159. ACCEPTANCE CRITERIA

Project dianggap selesai jika:

A. Build

npm ci

berhasil.

npm run build

berhasil.

---

B. Server

npm start

berhasil.

Server listen pada:

0.0.0.0:$PORT

---

C. Health

GET /health

menghasilkan:

HTTP 200

---

D. Authentication

User dapat:

register/login/logout

---

E. Project

User dapat:

create
open
delete

project.

---

F. AI

User dapat:

create session
send prompt
receive response

---

G. Streaming

Jika didukung oleh Harness:

response tampil realtime

---

H. File

User dapat:

create
read
edit
save
delete

file.

---

I. Persistence

Setelah Render restart:

project metadata
chat history
persistent files

tetap tersedia dari external storage.

---

J. Security

User tidak dapat:

mengakses project user lain

dan tidak dapat melakukan arbitrary host command melalui endpoint publik.

---

160. ACCEPTANCE TEST RENDER

Setelah deploy:

Test 1

Buka:

/

Expected:

Web UI muncul.

Test 2

Buka:

/health

Expected:

HTTP 200

Test 3

Login.

Expected:

Dashboard muncul.

Test 4

Create project.

Expected:

Project muncul.

Test 5

Start AI session.

Expected:

Harness berhasil dimulai.

Test 6

Kirim:

Buat file hello.txt dengan isi Hello World.

Expected:

hello.txt dibuat.

Test 7

Refresh browser.

Expected:

project/session metadata tetap tersedia.

Test 8

Restart Render.

Expected:

server kembali hidup
project persistent tetap tersedia

---

161. RESOURCE TEST

Test minimal:

1 user
1 project
1 active AI session

Monitor:

RAM
CPU
startup time
response time

Jika RAM mendekati limit:

reduce concurrency
cleanup processes
reduce output buffering

---

162. DO NOT OVERENGINEER

OpenCode dilarang menambahkan tanpa kebutuhan:

- Kubernetes
- Redis
- Kafka
- microservices
- Docker orchestration
- message queue
- Elasticsearch
- local LLM
- complex event bus

Target adalah:

SIMPLE
STABLE
LOW MEMORY
EASY TO DEPLOY

---

163. DEVELOPMENT PRIORITY

Urutan implementasi wajib:

Phase 1

Node server
Render PORT
Health endpoint
Frontend

Phase 2

Supabase Auth

Phase 3

Project management

Phase 4

DeepSeek Harness integration

Phase 5

AI streaming

Phase 6

File explorer/editor

Phase 7

Supabase Storage

Phase 8

GitHub

Phase 9

Security hardening

Phase 10

Render deployment

---

164. MVP

MVP WAJIB hanya berisi:

Login
Dashboard
Project
AI Chat
DeepSeek Harness
Streaming
File Explorer
Basic Editor
Supabase persistence
Render deployment

Jangan menunda MVP karena fitur tambahan.

---

165. FITUR POST-MVP

Fitur berikut boleh dibuat setelah MVP stabil:

GitHub advanced integration
APK build automation
PWA
AI provider manager
project templates
terminal UI
collaboration
public sharing
usage analytics
admin panel

---

166. PRIORITAS FITUR

P0 — WAJIB

Render compatibility
DeepSeek Harness
AI chat
Authentication
Supabase
Project workspace
File operations
Security

P1 — PENTING

Streaming
GitHub
Session history
Mobile UI
PWA

P2 — NANTI

APK build
multi-provider UI
collaboration
public sharing
advanced analytics

---

167. OPEN CODE INSTRUCTION

OpenCode harus membaca seluruh PRD ini sebelum melakukan perubahan kode.

Jangan langsung membuat fitur tambahan.

Jika menemukan requirement yang ambigu:

1. pilih solusi paling sederhana
2. tetap kompatibel dengan Render Free
3. prioritaskan RAM rendah
4. dokumentasikan keputusan
5. jangan mengubah arsitektur utama tanpa alasan

---

168. IMPORTANT IMPLEMENTATION RULE

OpenCode tidak boleh menganggap dependency/tool sudah terinstall.

Sebelum menggunakan tool:

node
npm
git

periksa environment.

Namun untuk Render production, gunakan runtime yang disediakan Render.

---

169. NO ASSUMPTION

Jangan mengasumsikan:

API key tersedia
Supabase sudah dibuat
GitHub OAuth sudah dibuat
database sudah dibuat
Node version tertentu tersedia

README harus menjelaskan setup dari awal.

---

170. EXTERNAL SERVICE CONFIGURATION

Semua external service harus dijelaskan dengan jelas.

Supabase

Digunakan untuk:

Auth
Database
Storage

GitHub

Digunakan untuk:

Source control
Repository import
Commit
Push

AI Provider

Digunakan untuk:

LLM inference

Render

Digunakan untuk:

Web server
AI agent runtime

UptimeRobot

Digunakan untuk:

Monitoring
light health requests

---

171. DO NOT CONFUSE STORAGE ROLES

Jangan membuat OpenCode menggunakan:

Render filesystem

sebagai database.

Gunakan:

Supabase Database

untuk structured data.

Gunakan:

Supabase Storage

untuk file/artifact.

Gunakan:

GitHub

untuk source code/version control.

---

172. DO NOT CONFUSE AI ROLES

DeepSeek Harness
=
Agent/orchestration layer

Sedangkan:

AI Provider
=
Model/API inference

Jangan menganggap Harness berarti local LLM.

---

173. DO NOT CONFUSE RENDER ROLE

Render Free:

Application server

bukan:

permanent storage

bukan:

Android build server

bukan:

local LLM server

---

174. PERFORMANCE EXPECTATION

Jangan menulis dalam dokumentasi:

24/7 guaranteed
unlimited
zero downtime
unlimited users
unlimited AI sessions

karena deployment menggunakan Render Free.

Gunakan bahasa:

personal use
light workload
resource constrained
best effort

---

175. FINAL QUALITY GATE

Sebelum menyatakan project selesai, OpenCode harus melakukan:

[ ] npm ci
[ ] npm run build
[ ] npm start
[ ] /health test
[ ] authentication test
[ ] project test
[ ] file test
[ ] AI session test
[ ] streaming test
[ ] Supabase persistence test
[ ] security test
[ ] path traversal test
[ ] upload limit test
[ ] graceful shutdown test
[ ] Render deployment test

---

176. FINAL DELIVERABLE

OpenCode harus menghasilkan:

deepseek-harness-web/
│
├── src/
├── public/
├── supabase/
│   └── migrations/
├── docs/
│   ├── API.md
│   └── ARCHITECTURE.md
│
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── render.yaml
├── README.md
└── PRD.md

---

177. FINAL INSTRUCTION UNTUK OPENCODE

Jalankan proyek secara bertahap.

Jangan hanya menghasilkan source code tanpa testing.

Setiap phase harus:

IMPLEMENT
↓
RUN
↓
TEST
↓
FIX
↓
VERIFY

Jika ada error:

IDENTIFY ROOT CAUSE
↓
FIX ROOT CAUSE
↓
RUN TEST AGAIN

Jangan menutupi error dengan workaround sementara.

Jangan menghapus fitur penting hanya karena terjadi error.

Jika sebuah fitur DeepSeek Harness ternyata tidak dapat diekspos melalui web secara langsung, buat adapter/proxy yang kompatibel daripada mengganti Harness dengan AI framework lain.

Jangan mengganti:

DeepSeek Harness

dengan:

LangChain
OpenAI Agents
Ollama
atau framework agent lain

kecuali user secara eksplisit meminta perubahan.

---

178. DEFINITION OF DONE

Project dinyatakan DONE hanya jika:

✓ Bisa dijalankan lokal
✓ Bisa build
✓ Bisa start production
✓ Bisa listen pada Render PORT
✓ /health bekerja
✓ Login bekerja
✓ Supabase bekerja
✓ Project bekerja
✓ File workspace bekerja
✓ DeepSeek Harness bekerja
✓ AI response bekerja
✓ Streaming bekerja jika didukung
✓ Data persistent
✓ Tidak menyimpan secret di GitHub
✓ Basic security selesai
✓ Render Free deployment berhasil
✓ README lengkap
✓ Tidak membutuhkan local LLM
✓ Tidak membutuhkan Render Persistent Disk
✓ Tidak membutuhkan Docker
✓ Tidak membutuhkan service tambahan yang tidak diperlukan

---

179. CATATAN TERAKHIR

Target versi pertama bukan membuat platform AI sebesar produk komersial.

Target versi pertama adalah membuat:

DeepSeek Harness
        +
Web UI
        +
Supabase
        +
Render Free

yang benar-benar dapat digunakan.

Setelah MVP stabil, baru tambahkan:

GitHub
        ↓
APK Builder
        ↓
APK Download

Jangan membebani Render Free dengan pekerjaan berat yang sebenarnya dapat dilakukan oleh service lain.

END OF PRD