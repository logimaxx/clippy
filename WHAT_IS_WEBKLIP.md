# What Webklip Does

Webklip is a temporary workspace for sharing text and files over a private link. It is an ephemeral web clipboard: you paste content (or attach files), share a URL, and every open device stays in sync until the clip expires and is deleted.

The public service runs at [webklip.com](https://webklip.com). The same software is self-contained and can be self-hosted.

---

## The problem it solves

Moving a snippet, URL, password, screenshot, or short document between devices usually means messaging yourself in WhatsApp, Slack, or email. Those tools keep permanent copies, require accounts, and bury files in conversation history.

Webklip does one job: **share for a moment, then disappear.** No account is required for the basic flow. The link is the key. Clips expire after 15 minutes by default, and expired content is deleted — abandoned clips are not kept “just in case.”

---

## How it works

1. Open any URL like `webklip.com/my-clip`, or create a clip from the homepage.
2. Paste text, write notes, or attach files (including screenshots via Ctrl+V / Cmd+V).
3. Share the link (or scan a QR code) on another device or with someone else.
4. Content syncs in real time across every open browser tab.
5. When the TTL ends — or after burn-after-read — the clip and its files are deleted.

Anonymous clips use a **link-as-secret** model: anyone who knows the URL can read and edit unless you add passphrase end-to-end encryption.

---

## Core product: clips

A **clip** is a short-lived shared page identified by a slug (for example `/my-clip`). Clips hold:

- **Text content** — plain text, code, or Markdown
- **Optional file attachments** — images, PDFs, and documents with in-browser preview (up to 10 files per clip)
- **Settings** — expiry, protect mode, language, visibility, webhooks, and more

### Real-time sync

Open the same clip on two or more devices and edits appear live over WebSockets. Presence shows how many devices are connected. Text and attachments stay in sync until the clip expires. This is the main alternative to “paste once and hope the other device still has the tab open.”

### Simple URLs

- Anonymous: `https://webklip.com/{slug}`
- Team vanity (with an account): `https://webklip.com/{team}/{clip-name}`

Slugs are short and shareable. Reserved paths (legal pages, docs, account, etc.) are blocked.

### Expiry and burn-after-read

| Mode | Behavior |
|------|----------|
| Timed TTL | Default **15 minutes**. Presets: 15 min, 1 hour, 24 hours, 7 days, 30 days, 90 days, 1 year. Custom datetime also supported. |
| Burn after read | Deletes after the first real web visit or API read. Link-preview crawlers do not consume the read. Unread burn clips still expire after **7 days** as a safety cap. |
| View limits | Optional cap of 1, 3, or 10 reads (API/web), then delete. |

Public (Klipwall) clips require a timed expiry and cannot use burn-after-read.

---

## Privacy and protection

Webklip is ephemeral by design. Protection is optional **passphrase end-to-end encryption**. Public Klipwall clips cannot use E2E or burn-after-read.

### Passphrase end-to-end encryption (E2E)

- Content is encrypted in the browser with **AES-256-GCM** before upload.
- A random content key (DEK) is wrapped with a key derived from your passphrase (PBKDF2).
- The server stores **ciphertext**, public salt, and the wrapped key — never the passphrase.
- Share a clean URL plus the passphrase separately. Recipients unlock in the browser only.
- Auto-generated memorable phrases are the default; shorter custom secrets are allowed with an explicit offline-crack warning.
- File uploads are disabled while a clip is E2E encrypted.

### Legacy PIN protection

Older clips may still use a server-side PIN gate (bcrypt hash, unlock cookie / `X-Clip-Pin`). That mode does **not** encrypt content at rest. New protection from the UI is always true E2E.

### Owner recovery

Optional owner password (or a logged-in account) can recover edit access if the owner cookie is lost — useful for public clips and long-lived team clips.

### What “private” means

- **Private** (default): not listed publicly; access is by knowing the URL (plus optional passphrase E2E).
- **Public**: listed on **Klipwall** (`/klipwall`) for discovery; must remain unprotected by design.

Clips are not encrypted at rest by default. Use passphrase E2E when you need zero-knowledge storage relative to the server.

---

## Editor and sharing UX

### Syntax highlighting and Markdown

The editor (CodeMirror) supports language modes including JavaScript, TypeScript, Python, Bash, JSON, HTML, CSS, SQL, and Markdown, plus plain text. Markdown can be previewed in the UI.

### File attachments

- Multipart upload from the clip UI — drop, browse, or paste images from the clipboard (Ctrl+V / Cmd+V)
- In-browser preview modal for images, PDFs, text, audio, and video (download still available)
- Individual download via the UI or `GET /api/v1/files/:slug/:id`
- Size limits configurable (`MAX_FILE_SIZE_MB` per file, `MAX_TOTAL_FILES_MB` per clip)
- Files are deleted with the clip on expiry or burn

### QR code

Generate a QR for the clip URL (`/:slug/qr` and Share menu) so a phone can open a clip started on a desktop without typing the link.

### Version history

While editing, versions are auto-saved about every 5 seconds. The settings sidebar lists history and can restore a previous version.

### Progressive Web App (PWA)

Manifest and service worker support for installable use and caching of static assets.

---

## Accounts, teams, and vanity URLs (optional)

Anonymous use is the default. Accounts unlock longer-lived workflows:

| Feature | Description |
|---------|-------------|
| Register / login | `/register`, `/login`, dashboard at `/account` |
| API keys | Create in the account UI or via the auth API (when enabled) |
| Teams | Create a workspace; team clips use vanity URLs `/{team}/{clip-name}` |
| Roles | Members can be owner, admin, member, or **viewer** (read-only) |

Team clips can be restricted to team members. This is for named, reusable clip spaces — not required for the everyday “send myself a link” flow.

---

## Developer surface: API, CLI, webhooks

Webklip is usable from scripts and automation without an account for anonymous clips.

### REST API (`/api/v1`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/v1/clips/:slug` | Read clip (counts as a read for burn/view limits) |
| `POST` | `/api/v1/clips/:slug` | Create clip |
| `PUT` | `/api/v1/clips/:slug` | Update content |
| `DELETE` | `/api/v1/clips/:slug` | Delete clip, files, and history |
| `GET` | `/api/v1/files/:slug/:id` | Download an attachment |

Create body can include content, TTL, burn-on-read, max views, PIN, webhook URL, visibility, and owner password. Content updates are capped (about 1 MB). Per-IP rate limits apply; responses expose `X-RateLimit-Remaining`.

Docs live at `/docs`, `/docs/api`, and `/docs/webhooks`.

### CLI

```bash
bun run cli -- -l my-clip -m "hello"
bun run cli -- -l my-clip -g
bun run cli -- -l my-clip -f ./note.txt
```

Supports PIN, webhook, max-views, and burn toggles against any Webklip base URL.

### Webhooks

On create/settings you can set a URL that receives JSON on:

- `read` — clip was read
- `burned` — burn-after-read consumed the clip
- `expired` — TTL cleanup deleted the clip

Webhook targets are validated to reduce SSRF risk (private/loopback addresses rejected).

---

## Klipwall (public explore)

**Klipwall** (`/klipwall`) lists clips that owners marked **public**. It is a browseable catalog of intentionally shared content — recipes, notes, demos — not a dump of private clips. Public clips cannot use E2E or burn-after-read; they always have a timed expiry.

---

## Who it is for

| Audience | Typical use |
|----------|-------------|
| **Everyone** | Move text or paste a screenshot between phone and desktop in seconds without a chat app |
| **Developers** | Snippets with syntax highlighting, live pair-edit, REST/CLI in pipelines |
| **IT & support** | One-time passwords or recovery codes with passphrase E2E and burn-after-read |
| **Teams** | Named vanity URLs and shared workspaces for recurring clip names |

It is **not** a permanent cloud drive, a full chat product, or a system-wide clipboard that captures every Ctrl+C. It is a temporary shared page you open when you need it.

---

## Trust model (summary)

- **No account required** for basic sharing
- **Short default lifetime** (15 minutes)
- **Automatic deletion** after expiry or burn
- **Optional passphrase E2E** for sensitive content
- **Link-as-secret** for unprotected clips — stated plainly
- **No ads**; site analytics (Umami) only when configured, and not for tracking clipboard content itself
- Operated by [LogiMaxx Systems](https://logimaxx.ro/) for the public instance

See [SECURITY.md](SECURITY.md) for the threat model, deployment checklist, and responsible disclosure. Legal pages: About, Privacy, Terms, Security, Contact.

---

## Technical shape (for operators)

Webklip is a single deployable service (Bun + Hono) with:

- SQLite persistence under `DATA_DIR` (clips, versions, users, teams, uploads)
- HTMX-driven UI plus client JS for sync, editor, and encryption
- WebSocket rooms for live sync (single-instance by default)
- Background cleanup of expired clips, versions, and orphan files
- Optional Docker Compose, including a scale profile

It is designed to be **self-contained**: one process (plus optional Redis/proxy in scaled setups), clear env vars, and a REST API that matches the web product.

---

## Related resources

| Resource | Purpose |
|----------|---------|
| [README.md](README.md) | Quick start, env vars, feature checklist |
| [SECURITY.md](SECURITY.md) | Threat model and production hardening |
| [homepage.md](homepage.md) | Marketing homepage structure and copy |
| `/docs` on a running instance | Live API and webhook documentation |
| Landing pages (`/online-clipboard`, `/live-sync`, …) | SEO guides for specific use cases |

---

## One-line definition

**Webklip is an ephemeral, real-time web clipboard: a temporary private (or optionally public) link for text and files that syncs across devices and deletes itself when you are done.**
