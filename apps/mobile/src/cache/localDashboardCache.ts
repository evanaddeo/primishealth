/**
 * localDashboardCache — SQLite-backed precomputed dashboard snapshot cache.
 *
 * Stores the latest resolved dashboard snapshot keyed by a date string (YYYY-MM-DD)
 * or similar stable cache key. This enables ARCH-MOBILE-001: Home renders from
 * a local cached snapshot before any backend call completes.
 *
 * Schema: `dashboard_cache (id TEXT PRIMARY KEY, data TEXT, cached_at INTEGER)`
 *
 * Data sensitivity: the cache stores precomputed backend summaries (S2-range).
 * Real health metric values are NOT stored directly here — only the resolved
 * snapshot from the backend. SQLite encryption (sqlcipher) is deferred to Phase J
 * hardening when Phase G confirms the data profile.
 *
 * @see TAD §18.4 — Mobile cache strategy (dashboard snapshots → SQLite)
 * @see TAD ARCH-MOBILE-001 — Home must render from local cache if available
 * @see Phase C plan — CU-021 out-of-scope: SQLite encryption (Phase J)
 */

import * as SQLite from 'expo-sqlite';

// ── Constants ──────────────────────────────────────────────────────────────────

const DB_NAME = 'primis_cache.db';

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS dashboard_cache (
    id        TEXT    PRIMARY KEY,
    data      TEXT    NOT NULL,
    cached_at INTEGER NOT NULL
  );
`.trim();

// ── Singleton DB handle ────────────────────────────────────────────────────────
// expo-sqlite v14+ (Expo SDK 50+) uses openDatabaseAsync. The database is opened
// once and reused across all cache operations (singleton open pattern).

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db === null) {
    _db = await SQLite.openDatabaseAsync(DB_NAME);
    await _db.execAsync(INIT_SQL);
  }
  return _db;
}

// ── Public API ─────────────────────────────────────────────────────────────────

interface CacheRow {
  id: string;
  data: string;
  cached_at: number;
}

/**
 * Persist a dashboard snapshot to the local SQLite cache.
 *
 * @param key      - Stable cache key, e.g. `'dashboard:2026-01-15'`.
 * @param snapshot - Arbitrary serialisable snapshot value (will be JSON-encoded).
 */
export async function saveDashboardSnapshot(key: string, snapshot: unknown): Promise<void> {
  const db = await getDb();
  const data = JSON.stringify(snapshot);
  const cachedAt = Date.now();
  await db.runAsync(
    `INSERT OR REPLACE INTO dashboard_cache (id, data, cached_at) VALUES (?, ?, ?);`,
    key,
    data,
    cachedAt
  );
}

/**
 * Retrieve a dashboard snapshot from the local SQLite cache.
 *
 * @param key - The cache key used when saving the snapshot.
 * @returns   The parsed snapshot value, or `null` if no entry exists for that key.
 */
export async function getDashboardSnapshot(key: string): Promise<unknown | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CacheRow>(
    `SELECT id, data, cached_at FROM dashboard_cache WHERE id = ?;`,
    key
  );
  if (row === null) return null;
  return JSON.parse(row.data) as unknown;
}

/**
 * Remove all rows from the dashboard cache.
 * Called on sign-out and during the user deletion flow (data model §5.5).
 */
export async function clearDashboardCache(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM dashboard_cache;');
}
