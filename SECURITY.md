# Webklip Security

This document is for operators deploying Webklip in production and for security researchers reporting vulnerabilities.

## Threat model

Webklip is an **ephemeral web clipboard**. Access control for anonymous clips relies on the **link-as-secret** model: anyone who knows the URL can read and edit unless you add a PIN or client-side end-to-end encryption.

| Asset | Risk if compromised |
|-------|---------------------|
| Clip content & files | Exposure of pasted data |
| `SESSION_SECRET` | Forged unlock/session cookies |
| SQLite database | All stored clips, PIN hashes, user accounts |
| Webhook URLs | SSRF if misconfigured (mitigated server-side) |

Clips are **not encrypted at rest** by default. E2E encryption keeps plaintext only in the browser.

## Required environment variables

| Variable | Production requirement |
|----------|------------------------|
| `SESSION_SECRET` | **Required.** 32+ random bytes. Server refuses to start if weak/missing when `NODE_ENV=production`. |
| `NODE_ENV` | Set to `production` in production deployments. |
| `SECURE_COOKIES` | Set to `true` when TLS terminates at a reverse proxy, or ensure the proxy sends `X-Forwarded-Proto: https`. |
| `DATA_DIR` | Persistent volume for SQLite and uploads. |
| `CONTACT_EMAIL` | Shown on legal/security pages and for disclosure reports. |

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

- **PIN protection**: bcrypt hashes, 5-attempt lockout per IP/slug (15 min)
- **Unlock cookies**: HMAC-signed, httpOnly, SameSite=Lax, optional Secure flag
- **File downloads**: require PIN unlock cookie or `X-Clip-Pin` header when clip is PIN-protected
- **WebSocket**: upgrade rejected for PIN-protected clips without valid unlock cookie
- **Team clips**: restricted to team members when owned by a team

### Abuse prevention

- Per-IP rate limits on `/api/*` and clip creation
- Content size cap (1 MB) on API PUT and WebSocket updates
- File upload size limit (`MAX_FILE_SIZE_MB`)
- Webhook URLs validated against private/loopback addresses before `fetch`

### Data lifecycle

- Default TTL: 24 hours
- Background cleanup deletes expired clips and orphan files
- Burn-on-read and view limits apply to API reads

## Known limitations

- Rate limits and PIN attempt counters are **in-memory** (per process)
- WebSocket rooms are **single-instance** (no cross-node sync without additional infrastructure)
- SQLite data is **plaintext at rest**
- Deleted data may persist in SQLite WAL until vacuum
- In-memory clip cache may briefly retain content after DB deletion

## Responsible disclosure

Report security issues to the address configured in `CONTACT_EMAIL` (default: `contact@logimaxx.ro`). Please allow reasonable time to patch before public disclosure.

## User-facing documentation

End users should read:

- `/security` — how Webklip protects data
- `/privacy` — what we collect and retain
- `/terms` — acceptable use and liability
