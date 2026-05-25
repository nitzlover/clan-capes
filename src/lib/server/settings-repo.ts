/**
 * Per-server operator settings — palette, cooldowns, banner caps.
 *
 * Stored as a single jsonb blob on `servers.settings`. Reads always go
 * through {@link getServerSettings}, which mergeWithDefaults-fills any
 * missing key so the rest of the codebase never has to handle
 * `undefined` for a setting that just hasn't been written yet.
 *
 * Validation happens at write time — {@link updateServerSettings}
 * rejects anything that doesn't shape-match. We deliberately avoid
 * Zod / json-schema deps here because the surface is small and the
 * panel form already constrains values client-side.
 */

import { desc, eq } from 'drizzle-orm';
import { DEFAULT_PALETTE } from './clan-validators';
import { getDb, schema } from './db';

export type ServerSettings = {
  /** Curated hex palette used by allocateUnusedColor. Lowercased `#RRGGBB`. */
  palette: string[];
  /** Per-player /clan create cooldown in milliseconds. */
  createCooldownMs: number;
  /** Maximum number of banner pattern layers (1..12). */
  bannerMaxLayers: number;
};

export const DEFAULT_SETTINGS: ServerSettings = {
  palette: DEFAULT_PALETTE.map((h) => h.toUpperCase()),
  createCooldownMs: 60 * 60 * 1000, // 1h
  bannerMaxLayers: 6,
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Merge an arbitrary stored blob with the defaults — unknown keys
 * pass through unchanged (so a future "betaFeature" key set by an
 * older panel version survives a downgrade), missing keys come back
 * with their default values, and known keys with the wrong shape
 * are quietly replaced with defaults rather than crashing readers.
 */
export function mergeWithDefaults(raw: unknown): ServerSettings {
  const out: ServerSettings = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.palette)) {
      const filtered = r.palette
        .filter((h): h is string => typeof h === 'string' && HEX_RE.test(h))
        .map((h) => h.toUpperCase());
      if (filtered.length > 0) out.palette = filtered;
    }
    if (
      typeof r.createCooldownMs === 'number' &&
      Number.isFinite(r.createCooldownMs) &&
      r.createCooldownMs >= 0
    ) {
      out.createCooldownMs = Math.floor(r.createCooldownMs);
    }
    if (
      typeof r.bannerMaxLayers === 'number' &&
      Number.isInteger(r.bannerMaxLayers) &&
      r.bannerMaxLayers >= 1 &&
      r.bannerMaxLayers <= 12
    ) {
      out.bannerMaxLayers = r.bannerMaxLayers;
    }
  }
  return out;
}

export async function getServerSettings(serverId: number): Promise<ServerSettings> {
  const db = getDb();
  const [row] = await db
    .select({ settings: schema.servers.settings })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  if (!row) return { ...DEFAULT_SETTINGS };
  return mergeWithDefaults(row.settings);
}

/**
 * Default-fill the most-recently-registered server's settings when
 * the caller doesn't have a serverId handy. Used by the plugin-side
 * `/api/plugin/settings` endpoint.
 */
export async function getDefaultServerSettings(): Promise<{
  serverId: number | null;
  settings: ServerSettings;
}> {
  const db = getDb();
  const [first] = await db
    .select({ id: schema.servers.id, settings: schema.servers.settings })
    .from(schema.servers)
    .orderBy(desc(schema.servers.createdAt))
    .limit(1);
  if (!first) {
    return { serverId: null, settings: { ...DEFAULT_SETTINGS } };
  }
  return { serverId: first.id, settings: mergeWithDefaults(first.settings) };
}

export type SettingsPatch = Partial<ServerSettings>;

/**
 * Validate + persist a partial settings update. Returns the new
 * merged-with-defaults snapshot for the route handler to echo back
 * to the client.
 */
export async function updateServerSettings(
  serverId: number,
  patch: SettingsPatch,
): Promise<ServerSettings> {
  const current = await getServerSettings(serverId);
  const next: ServerSettings = { ...current };

  if (patch.palette !== undefined) {
    if (!Array.isArray(patch.palette)) {
      throw new Error('palette must be an array of #RRGGBB strings');
    }
    const cleaned = patch.palette
      .filter((h): h is string => typeof h === 'string' && HEX_RE.test(h))
      .map((h) => h.toUpperCase());
    // Dedup while preserving order — operator-set palette must keep
    // a deterministic shuffle target for the allocator.
    const dedup = Array.from(new Set(cleaned));
    if (dedup.length < 1) {
      throw new Error('palette must contain at least one #RRGGBB entry');
    }
    if (dedup.length > 256) {
      throw new Error('palette too large (max 256 entries)');
    }
    next.palette = dedup;
  }
  if (patch.createCooldownMs !== undefined) {
    if (
      typeof patch.createCooldownMs !== 'number' ||
      !Number.isFinite(patch.createCooldownMs) ||
      patch.createCooldownMs < 0 ||
      patch.createCooldownMs > 7 * 24 * 60 * 60 * 1000
    ) {
      throw new Error('createCooldownMs must be a positive number ≤ 7 days');
    }
    next.createCooldownMs = Math.floor(patch.createCooldownMs);
  }
  if (patch.bannerMaxLayers !== undefined) {
    if (
      !Number.isInteger(patch.bannerMaxLayers) ||
      patch.bannerMaxLayers < 1 ||
      patch.bannerMaxLayers > 12
    ) {
      throw new Error('bannerMaxLayers must be an integer 1..12');
    }
    next.bannerMaxLayers = patch.bannerMaxLayers;
  }

  const db = getDb();
  await db
    .update(schema.servers)
    .set({ settings: next })
    .where(eq(schema.servers.id, serverId));
  return next;
}
