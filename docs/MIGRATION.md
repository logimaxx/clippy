# Migrating Webklip to another server

This guide covers moving a Docker Compose deployment (SQLite + uploads, and optionally Redis) to a new host with minimal downtime.

## What to migrate

| Item | Why |
|------|-----|
| Named volume `webklip-data` | SQLite database and file uploads (`DATA_DIR=/data`) |
| `.env` | Secrets and runtime config — especially `SESSION_SECRET` |
| App source / image | Rebuild or pull on the new host |
| Named volume `redis-data` | Only if you use `docker-compose.scale.yml` |

Compose may prefix volume names with the project directory, e.g. `clippy_webklip-data`. Always confirm with:

```bash
docker volume ls | grep -E 'webklip|redis'
```

Use the **exact** volume name from that list in the commands below.

## 1. Export on the old server

Stop the stack so SQLite is not mid-write:

```bash
cd /path/to/clippy
docker compose down
```

If you run the scale profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml down
```

Archive the data volume (replace `webklip-data` if your name differs):

```bash
docker run --rm \
  -v webklip-data:/data:ro \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/webklip-data.tar.gz -C /data .
```

Optional Redis volume:

```bash
docker run --rm \
  -v redis-data:/data:ro \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/redis-data.tar.gz -C /data .
```

You should now have `webklip-data.tar.gz` (and optionally `redis-data.tar.gz`) next to the project.

## 2. Transfer to the new server

Copy the archive(s), `.env`, and the repository (or deploy artifacts) to the new host:

```bash
# Example
scp webklip-data.tar.gz .env user@new-server:/path/to/clippy/
# Also sync or clone the app repo on the new server
```

Prefer `rsync -avP` for large upload directories / archives.

## 3. Import on the new server

On the new host, from the project directory:

```bash
cd /path/to/clippy

# Ensure .env is in place (same SESSION_SECRET as before)
docker volume create webklip-data

docker run --rm \
  -v webklip-data:/data \
  -v "$(pwd)":/backup \
  alpine tar xzf /backup/webklip-data.tar.gz -C /data
```

Optional Redis:

```bash
docker volume create redis-data

docker run --rm \
  -v redis-data:/data \
  -v "$(pwd)":/backup \
  alpine tar xzf /backup/redis-data.tar.gz -C /data
```

Start the app:

```bash
docker compose up -d --build
```

Scale profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d --build
```

If Compose creates a different volume name than the one you restored into, either:

- Set `COMPOSE_PROJECT_NAME` so the prefix matches the old host, or
- Edit `docker-compose.yml` to use an external volume:

```yaml
volumes:
  webklip-data:
    external: true
    name: webklip-data   # or clippy_webklip-data
```

## 4. Verify

```bash
curl -sS "http://localhost:${PORT:-3000}/api/health"
```

Then check:

- An existing clip slug loads
- File attachments download
- Login / sessions still work (requires the same `SESSION_SECRET`)
- Reverse proxy, TLS, and `SITE_URL` point at the new host

See [SECURITY.md](../SECURITY.md) for the production checklist (cookies, `X-Forwarded-*`, etc.).

## 5. Cutover tips

1. **DNS / proxy** — Lower TTL beforehand; switch traffic only after health checks pass on the new host.
2. **Downtime window** — Keep the old stack stopped after export so nothing writes new data that is not in the archive.
3. **Rollback** — Leave the old host and its volume intact until the new deployment is confirmed.
4. **Secrets** — Do not regenerate `SESSION_SECRET` during migration unless you accept invalidating all sessions.
5. **Cleanup** — After success, remove archives that contain production data from both hosts (`rm webklip-data.tar.gz`).

## Offline backup (no migration)

Same export step works as a periodic backup. Restore by recreating the volume and extracting the archive as in step 3, then `docker compose up -d`.
