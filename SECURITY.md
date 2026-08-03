# Webklip Security

This document is for operators deploying Webklip in production and for security researchers reporting vulnerabilities.

## Threat model

Webklip is an **ephemeral online clipboard**. Access control for anonymous clips relies on the **link-as-secret** model: anyone who knows the URL can read and edit unless you add **passphrase end-to-end encryption**. Public Klipwall clips cannot use E2E or burn-after-read.

| Asset | Risk if compromised |
|-------|---------------------|
| Clip content & files | Exposure of pasted data |
| `SESSION_SECRET` | Forged unlock/session cookies |
| SQLite database | All stored clips (ciphertext for E2E clips), legacy PIN hashes, user accounts |
| Webhook URLs | SSRF if misconfigured (mitigated server-side) |

Clips are **not encrypted at rest** by default. Passphrase E2E keeps plaintext only in the browser; the server stores ciphertext, public salt, and a wrapped content key — never the passphrase.

## Required environment variables

| Variable | Production requirement |
|----------|------------------------|
| `SESSION_SECRET` | **Required.** 32+ random bytes. Server refuses to start if weak/missing when `NODE_ENV=production`. |
| `NODE_ENV` | Set to `production` in production deployments. |
| `SECURE_COOKIES` | Set to `true` when TLS terminates at a reverse proxy, or ensure the proxy sends `X-Forwarded-Proto: https`. |
| `DATA_DIR` | Persistent volume for SQLite and uploads. |
| `CONTACT_EMAIL` | Shown on legal/security pages, disclosure reports, and as the `/contact` form destination. |

## Production deployment checklist

- [ ] Generate a strong `SESSION_SECRET` (e.g. `openssl rand -base64 32`)
- [ ] Set `NODE_ENV=production`
- [ ] Terminate TLS at a reverse proxy (Caddy, nginx, Traefik)
- [ ] Set `SECURE_COOKIES=true` or ensure `X-Forwarded-Proto: https` from the proxy
- [ ] Configure the proxy to set `X-Forwarded-For` — do not trust client-supplied forwarding headers from the public internet
- [ ] Mount a persistent volume for `DATA_DIR`
- [ ] Set `CONTACT_EMAIL` for legal and security contact
- [ ] Review `RATE_LIMIT_CLIPS_PER_HOUR` and `RATE_LIMIT_API_PER_HOUR` for expected traffic
- [ ] Keep `ENABLE_AUTH_API=false` unless you need programmatic registration/API-key creation
- [ ] If using OAuth, set `GOOGLE_*` / `GITHUB_*` client credentials and register redirect URIs under `{SITE_URL}/auth/{provider}/callback`
- [ ] Set `CORS_ORIGIN` only if a specific external origin must call the API

## Reverse proxy example (nginx)

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## Security controls

### HTTP headers

All responses include:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (camera, microphone, geolocation disabled)

When `UMAMI_WEBSITE_ID` is set, CSP also allows the Umami script origin for `script-src` and `connect-src`.

### Access control

- **Passphrase E2E**: client-side AES-256-GCM; DEK wrapped with PBKDF2-derived key from the passphrase; passphrase never POSTed to the server
- **Short passphrases**: allowed with an explicit UI warning — stolen ciphertext + a weak PIN is offline-brute-forceable
- **Legacy PIN**: older clips may still use bcrypt PIN + unlock cookie / `X-Clip-Pin` (plaintext at rest)
- **File downloads**: require legacy PIN unlock when applicable; new uploads are blocked on E2E-encrypted clips
- **WebSocket**: upgrade rejected for legacy PIN-locked clips without a valid unlock cookie; E2E clips sync ciphertext only
- **Team clips**: restricted to team members when owned by a team
- **Burn / max views**: page load still counts when ciphertext is served; failing the passphrase gate does not undo a burn

### Abuse prevention

- Per-IP rate limits on `/api/*` and clip creation
- Content size cap (1,000,000 characters) on API PUT and WebSocket updates, including multi-tab workspace JSON
- File upload size limits (`MAX_FILE_SIZE_MB` per file, `MAX_TOTAL_FILES_MB` per clip)
- Webhook URLs validated against private/loopback addresses before `fetch`

### Data lifecycle

- Default TTL: 15 minutes (configurable up to 1 year)
- Background cleanup deletes expired clips, version history, and orphan files
- Burn-on-read deletes on the first real web visit or API read; unread burn clips still expire after 7 days
- View limits apply to web and API reads when configured

## Known limitations

- Rate limits and legacy PIN attempt counters are **in-memory** (per process)
- WebSocket rooms are **single-instance** (no cross-node sync without additional infrastructure)
- SQLite data is **plaintext at rest** unless the clip uses passphrase E2E (ciphertext only)
- Short E2E passphrases can be cracked **offline** from stolen ciphertext despite PBKDF2
- Deleted data may persist in SQLite WAL until vacuum
- In-memory clip cache may briefly retain content after DB deletion

## Responsible disclosure

Report security issues to the address configured in `CONTACT_EMAIL` (default: `contact@logimaxx.ro`). Please allow reasonable time to patch before public disclosure.

## User-facing documentation

End users should read:

- `/security` — how Webklip protects data
- `/privacy` — what we collect and retain
- `/terms` — acceptable use and liability
