/**
 * Server-only env access. Centralised so each route handler doesn't have to
 * re-derive defaults. Throws clearly when a required secret is missing in
 * production rather than silently picking a dev default that ships to prod.
 */

export const PORT = Number(process.env.PORT ?? 3000);

export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin';
export const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ?? '';

export const MINECRAFT_API_URL = (process.env.MINECRAFT_API_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
export const MINECRAFT_API_TOKEN = process.env.MINECRAFT_API_TOKEN ?? '';

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './data/capes';
export const AUDIT_LOG = process.env.AUDIT_LOG ?? './data/audit.log';
export const MAX_UPLOAD_KB = Number(process.env.MAX_UPLOAD_KB) || 256;

/**
 * Public CDN URL used to construct cape URLs handed to the plugin. On Railway
 * this should be the panel's own public URL, e.g.:
 *   https://clancapes-XYZ.up.railway.app/api/static/capes
 * Because the panel and API now live on the same origin, the default points
 * to the local dev server.
 */
export const CDN_PUBLIC_URL = (process.env.CDN_PUBLIC_URL ?? 'http://localhost:3000/api/static/capes').replace(/\/$/, '');

/**
 * Postgres connection string. Railway injects `DATABASE_URL` automatically
 * when a Postgres service is attached to the deployment. Locally you can
 * point it at any reachable Postgres instance (Docker, native install,
 * etc.) via .env.local. Empty string disables DB-backed code paths so
 * the legacy file-based audit + cape directory keeps working during the
 * Phase 0 transition.
 */
export const DATABASE_URL = process.env.DATABASE_URL ?? '';

if (process.env.NODE_ENV === 'production') {
  if (JWT_SECRET === 'dev-secret-change-me') {
    console.warn('[env] JWT_SECRET is using a dev default in production');
  }
  if (ADMIN_PASSWORD === 'admin' && !ADMIN_PASSWORD_HASH) {
    console.warn('[env] ADMIN_PASSWORD is the default "admin" — set ADMIN_PASSWORD_HASH');
  }
  if (!DATABASE_URL) {
    console.warn(
      '[env] DATABASE_URL not set — DB-backed features disabled, ' +
        'panel runs in legacy file-only mode',
    );
  }
}
