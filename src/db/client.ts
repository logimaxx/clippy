import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const dataDir = process.env.DATA_DIR ?? "./data";
mkdirSync(dataDir, { recursive: true });

const dbPath = `${dataDir}/webklip.db`;
const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA synchronous = NORMAL;");

export const db = drizzle(sqlite, { schema });

export function runMigrations() {
  try {
    migrate(db, { migrationsFolder: "./drizzle" });
  } catch {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS clips (
        slug TEXT PRIMARY KEY,
        content TEXT NOT NULL DEFAULT '',
        content_type TEXT NOT NULL DEFAULT 'text',
        file_path TEXT,
        metadata TEXT,
        expires_at INTEGER,
        burn_on_read INTEGER NOT NULL DEFAULT 1,
        view_count INTEGER NOT NULL DEFAULT 0,
        max_views INTEGER,
        pin_hash TEXT,
        webhook_url TEXT,
        language TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_clips_expires ON clips(expires_at);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        key_hash TEXT NOT NULL,
        name TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);
  }
}

export { dbPath, dirname };
