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

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? './data/capes';
export const AUDIT_LOG = process.env.AUDIT_LOG ?? './data/audit.log';
export const MAX_UPLOAD_KB = Number(process.env.MAX_UPLOAD_KB) || 256;

/**
 * Client-mod distribution. The Fabric mod jar is stored on the same
 * Railway Volume as cape PNGs (no separate CDN needed) and served by
 * /api/mod/download. `MOD_LATEST_VERSION` is only the fallback advertised
 * by /api/mod/version before any jar has been uploaded; once an operator
 * uploads one via /api/panel/mod the version comes from latest.json on
 * the Volume.
 */
export const MOD_DIR = process.env.MOD_DIR ?? './data/mod';
export const MOD_LATEST_VERSION = process.env.MOD_LATEST_VERSION ?? '1.0.4';
export const MAX_MOD_UPLOAD_KB = Number(process.env.MAX_MOD_UPLOAD_KB) || 8192;

/**
 * Public CDN URL used to construct cape URLs handed to the plugin. On Railway
 * this should be the panel's own public URL, e.g.:
 *   https://clancapes-XYZ.up.railway.app/api/static/capes
 * Because the panel and API now live on the same origin, the default points
 * to the local dev server.
 */
export const CDN_PUBLIC_URL = (process.env.CDN_PUBLIC_URL ?? 'http://localhost:3000/api/static/capes').replace(/\/$/, '');

/**
 * Public origin of the panel itself — used to build clickable URLs
 * the plugin sends to players (e.g. /clan panel hand-off link). Empty
 * string disables URL embedding and the client just shows the token
 * plaintext for the operator to paste manually.
 */
export const PANEL_PUBLIC_URL = (process.env.PANEL_PUBLIC_URL ?? '').replace(/\/$/, '');

/**
 * Postgres connection string. Railway injects `DATABASE_URL` automatically
 * when a Postgres service is attached to the deployment. Locally you can
 * point it at any reachable Postgres instance (Docker, native install,
 * etc.) via .env.local. Empty string disables DB-backed code paths so
 * the legacy file-based audit + cape directory keeps working during the
 * Phase 0 transition.
 */
export const DATABASE_URL = process.env.DATABASE_URL ?? '';

// In production we refuse to start with insecure defaults rather than
// log a warning — anyone reading the public repo would otherwise be
// able to forge admin + leader JWTs against a freshly deployed panel
// that hadn't set the secret yet. The build itself stays passing
// (these checks fire at runtime via the API routes that import this
// module), so static prerender during `next build` still works.
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
  if (JWT_SECRET === 'dev-secret-change-me') {
    throw new Error(
      '[env] FATAL: JWT_SECRET is using the dev default in production. ' +
        'Set JWT_SECRET to a 32+ character random string before deploying.',
    );
  }
  if (ADMIN_PASSWORD === 'admin' && !ADMIN_PASSWORD_HASH) {
    throw new Error(
      '[env] FATAL: ADMIN_PASSWORD is the default "admin" with no hash set. ' +
        'Set ADMIN_PASSWORD_HASH (bcrypt) before deploying — anyone with the ' +
        'public repo can log in otherwise.',
    );
  }
  if (!DATABASE_URL) {
    console.warn(
      '[env] DATABASE_URL not set — DB-backed features disabled, ' +
        'panel runs in legacy file-only mode',
    );
  }
}
