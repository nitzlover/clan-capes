/**
 * Postgres connection pool. Singleton across the Next.js process —
 * Drizzle holds onto the `pg.Pool` so the same connections are reused
 * across route handlers. The pool is lazy: nothing happens until the
 * first query, so importing this module is safe even when DATABASE_URL
 * isn't set (e.g. legacy file-mode deploys).
 *
 * Why a getter instead of a top-level const: at module-load time the
 * env hasn't been validated yet, and we'd rather throw a meaningful
 * "DATABASE_URL not set" the first time DB code is actually exercised
 * than die during Next.js's static-page collection pass.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DATABASE_URL } from '@/lib/server/env';
import * as schema from './schema';

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Lazy accessor. Throws if DATABASE_URL is empty so callers can't
 * accidentally hit a non-existent pool.
 */
export function getDb() {
  if (db) return db;
  if (!DATABASE_URL) {
    throw new Error(
      'DATABASE_URL not configured — DB-backed code path is not available in legacy file-only mode',
    );
  }
  pool = new Pool({
    connectionString: DATABASE_URL,
    // Railway's managed Postgres (and most platform-hosted Postgres
    // services) serves SSL with a self-signed certificate over its
    // proxy hostname. Verifying the chain fails out of the box, so
    // default to TLS-without-verification in production and let
    // operators opt back into strict verification by setting
    // DATABASE_SSL_REJECT_UNAUTHORIZED=true when they've installed
    // a proper CA bundle. Local dev keeps SSL off entirely.
    ssl:
      process.env.NODE_ENV === 'production'
        ? {
            rejectUnauthorized:
              process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true',
          }
        : false,
  });
  db = drizzle(pool, { schema });
  return db;
}

/** True when the DB layer is enabled in this deploy. */
export function dbEnabled(): boolean {
  return DATABASE_URL.length > 0;
}

export { schema };
