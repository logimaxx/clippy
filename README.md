# Webklip

Lightweight self-contained web clipboard with real-time sync, HTMX UI, and PWA support.

## Quick start

```bash
# With Docker
docker compose up -d --build

# Local (requires Bun)
bun install
bun run dev
```

Open http://localhost:3000

## CLI

```bash
bun run cli -- -l myclip -m "hello world"
bun run cli -- -l myclip -g
bun run cli -- -l myclip -g -u https://webklip.com
```

## Phase 3 features

- **Accounts** — register/login at `/register`, `/login`, dashboard at `/account`
- **API keys** — create via account UI or `POST /api/v1/auth/api-keys` (Bearer session)
- **Teams** — create workspace, vanity URLs `/{team}/{clip-name}`
- **E2E encryption** — AES-256-GCM client-side; key in URL `#key=`; server stores ciphertext only
- **Version history** — auto-saved every 5s while editing; restore from sidebar

### Vanity URLs

1. Register and create a team at `/account`
2. Open `/teams/{team-slug}` and create a clip
3. Share `https://webklip.com/{team}/{clip-name}`

### E2E encryption

1. Enable "End-to-end encryption" in clip settings
2. Click "Generate & copy secure link" — adds `#key=...` to URL
3. Share the **full URL including the hash** — recipients can decrypt in browser

## Phase 2 features

- **PIN protection** — set in UI or API; unlock via web form or `X-Clip-Pin` header
- **View limits** — 1, 3, 10 reads or unlimited (API reads only)
- **Webhooks** — `POST` JSON to your URL on `read`, `burned`, `expired` events
- **File/image upload** — HTMX multipart, image preview inline
- **CLI** — extended flags: `-p`, `-w`, `-f`, `--max-views`, `--no-burn`

### Webhook payload

```json
{
  "event": "read",
  "slug": "myclip",
  "timestamp": "2026-07-07T12:00:00.000Z",
  "viewCount": 2,
  "burnOnRead": false,
  "maxViews": 3,
  "burned": false
}
```

### CLI examples

```bash
bun run cli -- -l secret -m "data" -p 1234 -w https://hooks.example.com/webklip
bun run cli -- -l secret -g -p 1234
bun run cli -- -l secret -f ./photo.png
```

## API

- `GET /api/health` — health check
- `GET /api/v1/clips/:slug` — read clip (burn-on-read if enabled)
- `POST /api/v1/clips/:slug` — create clip
- `PUT /api/v1/clips/:slug` — update clip
- `DELETE /api/v1/clips/:slug` — delete clip
- `GET /api/v1/files/:slug/:id` — download attached file

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `./data` | SQLite DB + file uploads |
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | — | Set to `production` in production |
| `SESSION_SECRET` | — | **Required in production.** HMAC signing for cookies |
| `SECURE_COOKIES` | `false` | Set `true` behind HTTPS reverse proxy |
| `CONTACT_EMAIL` | `contact@logimaxx.ro` | Legal/security contact on public pages |
| `SITE_URL` | `https://webklip.com` | Public site URL (no trailing slash) — writes `sitemap.xml` at build time |
| `ENABLE_AUTH_API` | `false` | Enable `POST /api/v1/auth/register` and API key API |
| `UMAMI_WEBSITE_ID` | — | Umami website ID — enables analytics when set |
| `UMAMI_SCRIPT_URL` | — | Full URL to `script.js` (or set `UMAMI_URL` instead) |
| `CORS_ORIGIN` | — | Allow cross-origin API access from this origin |
| `MAX_FILE_SIZE_MB` | `10` | Max upload size |
| `RATE_LIMIT_CLIPS_PER_HOUR` | `30` | Clip creation limit per IP |
| `RATE_LIMIT_API_PER_HOUR` | `200` | API limit per IP |

## Production security

See [SECURITY.md](SECURITY.md) for the full deployment checklist, threat model, and responsible disclosure process.

Quick checklist:

- Generate a strong `SESSION_SECRET` (`openssl rand -base64 32`)
- Set `NODE_ENV=production` and terminate TLS at a reverse proxy
- Set `SECURE_COOKIES=true` or forward `X-Forwarded-Proto: https`
- Use a persistent volume for `DATA_DIR`
- Set `CONTACT_EMAIL` for legal pages


## Scale profile (optional)

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d
```

## Build assets

```bash
bun run build:assets        # production: minify + random hash folder
bun run build:assets --dev  # dev: dist/assets/dev/
```
