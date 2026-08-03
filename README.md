# Webklip

Lightweight self-contained online clipboard with a REST API, real-time sync, HTMX UI, and PWA support.

## Quick start

```bash
# With Docker
docker compose up -d --build

# Local (requires Bun)
bun install
bun run dev
```

Open http://localhost:3000

## Phase 3 features

- **Accounts** — register/login at `/register`, `/login`, dashboard at `/account`; optional Google/GitHub OAuth
- **Account security** — login lockout after repeated failures, sessions that expire after 30 days and can be revoked ("sign out everywhere"), self-service account deletion, plus email confirmation and password reset when `RESEND_API_KEY` is set
- **Account settings** — edit the display name, change the password in-app, and move the account to a new email address (confirmed from the new address) at `/account/settings`

### Email confirmation

With a mailer configured, a new email/password sign-up cannot sign in until the address is confirmed. The link is single-use and expires in 24 hours; accounts left unconfirmed for 7 days are deleted, so a squatted address frees itself up. Google/GitHub accounts arrive pre-confirmed because the provider only returns verified addresses, and completing a password reset also confirms the address. Without `RESEND_API_KEY` and `MAIL_FROM` the whole flow is skipped and sign-ups are usable immediately.
- **API keys** — create via account UI or `POST /api/v1/auth/api-keys` (Bearer session)
- **Teams** — create workspace, invite members by email, vanity URLs `/{team}/{clip-name}`
- **E2E encryption** — AES-256-GCM client-side; passphrase wraps the key (never sent to the server)
- **Version history** — auto-saved every 5s while editing; restore from sidebar

### Vanity URLs

1. Register and create a team at `/account`
2. Open `/teams/{team-slug}` and create a clip
3. Share `https://webklip.com/{team}/{clip-name}`

### Team members

Owners and admins invite by email from `/teams/{team-slug}`. The invite link is bound to that address, works once, and expires in 7 days; it is emailed when a mailer is configured and always shown in the UI so it can be shared by hand. Roles are **admin** (manage members), **member** (read and write clips), and **viewer** (read only) — ownership stays with the creator and cannot be granted through an invite.

Team pages and member lists are visible to members only; everyone else gets a 404. Admins can revoke pending invites, change a member's role, and remove members; members can leave. The owner can additionally rename the team, transfer it to another member (becoming an admin in the process), or delete it outright, which also removes every clip under `/{team}/`.

A team's slug is fixed once created, because it forms the first half of every team clip URL.

### Passphrase E2E encryption

1. In clip settings → Protect, choose **Passphrase**
2. Keep the auto-generated memorable phrase, or set your own (short secrets require acknowledging offline-crack risk)
3. Share the **clean clip URL** and the passphrase **separately** — recipients unlock in the browser; Webklip never receives the passphrase

Public Klipwall clips cannot use passphrase E2E. File uploads are disabled while a clip is encrypted.

Legacy server PIN clips (pre-passphrase) still unlock via the PIN form / `X-Clip-Pin`. New protection from the UI is always true E2E.

## Phase 2 features

- **View limits** — 1, 3, 10 reads or unlimited (API reads only)
- **Webhooks** — `POST` JSON to your URL on `read`, `burned`, `expired` events
- **File/image upload** — drop, browse, or paste a screenshot (Ctrl+V / Cmd+V); preview images, PDFs, text, and media in a modal (not available on E2E-encrypted clips)

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
| `CONTACT_EMAIL` | `contact@logimaxx.ro` | Legal/security contact and destination for the `/contact` form |
| `SITE_URL` | `https://webklip.com` | Public site URL (no trailing slash) — writes `sitemap.xml` at build time; OAuth redirect base |
| `ENABLE_AUTH_API` | `false` | Enable `POST /api/v1/auth/register` and API key API |
| `RESEND_API_KEY` / `MAIL_FROM` | — | Resend API key and sender address — both required for password reset and the contact form |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Enable “Continue with Google” (redirect: `{SITE_URL}/auth/google/callback`) — see [docs/OAUTH.md](docs/OAUTH.md) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | Enable “Continue with GitHub” (redirect: `{SITE_URL}/auth/github/callback`) — see [docs/OAUTH.md](docs/OAUTH.md) |
| `UMAMI_WEBSITE_ID` | — | Umami website ID — enables analytics when set |
| `UMAMI_SCRIPT_URL` | — | Full URL to `script.js` (or set `UMAMI_URL` instead) |
| `CORS_ORIGIN` | — | Allow cross-origin API access from this origin |
| `MAX_FILE_SIZE_MB` | `10` | Max size per uploaded file |
| `MAX_TOTAL_FILES_MB` | `50` | Max total size of all attachments on a clip |
| `RATE_LIMIT_CLIPS_PER_HOUR` | `30` | Clip creation limit per IP |
| `RATE_LIMIT_API_PER_HOUR` | `200` | API limit per IP |

## Production security

See [SECURITY.md](SECURITY.md) for the full deployment checklist, threat model, and responsible disclosure process.

To move an existing Docker deployment (volumes + `.env`) to another host, see [docs/MIGRATION.md](docs/MIGRATION.md).

Marketing pages live under [`website/`](website/); see [docs/WEBSITE_SPLIT.md](docs/WEBSITE_SPLIT.md) for the app/website layout and planned edge split.

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
