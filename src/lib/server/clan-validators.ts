/**
 * Validators + color allocator for the clan system.
 *
 * Single source of truth so plugin write paths and panel admin UI
 * stay in lock-step on tag rules, color uniqueness, and palette
 * choice. Tag rules: 2-6 uppercase alphanumeric characters, no
 * spaces, no specials. Colors: 32-slot curated palette with
 * collision-free random allocation per server.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '@/lib/server/db';

/** Tag regex: 2-6 uppercase alphanumeric. Plugin upper-cases on input. */
export const TAG_RE = /^[A-Z0-9]{2,6}$/;

/** Hex color regex: `#` + 6 hex digits. */
export const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * 32-slot curated palette — picked so each entry maps onto a vanilla
 * Minecraft chat colour (ChatColor.values()) AND stays readable on
 * both dark and light TAB backgrounds. Random allocator picks the
 * first unused entry per server, so collisions are impossible by
 * construction (Phase 1 design decision).
 */
export const DEFAULT_PALETTE: ReadonlyArray<string> = [
  '#FF5555', // red
  '#55FF55', // lime
  '#5555FF', // blue
  '#FFFF55', // yellow
  '#FF55FF', // magenta
  '#55FFFF', // cyan
  '#FFAA00', // gold
  '#AA00AA', // purple
  '#00AAAA', // teal
  '#FFAAAA', // pink
  '#AAFFAA', // mint
  '#AAAAFF', // periwinkle
  '#FFFFAA', // pale yellow
  '#FFAAFF', // light magenta
  '#AAFFFF', // ice
  '#FF0066', // rose
  '#66FF00', // chartreuse
  '#0066FF', // azure
  '#FF6600', // orange
  '#6600FF', // violet
  '#00FF66', // spring
  '#FF6666', // coral
  '#66FF66', // mint-darker
  '#6666FF', // cornflower
  '#FFB6C1', // light-pink
  '#98FB98', // pale-green
  '#87CEEB', // sky-blue
  '#DDA0DD', // plum
  '#F0E68C', // khaki
  '#FFD700', // gold-bright
  '#DC143C', // crimson
  '#00CED1', // dark-turquoise
] as const;

/** Cheap shape check — does not consult the DB. */
export function isValidTag(tag: string): boolean {
  return TAG_RE.test(tag);
}

/** Cheap shape check for hex colors. */
export function isValidColor(hex: string): boolean {
  return COLOR_RE.test(hex);
}

/**
 * Normalise tag (upper-case + trim) before storage / comparison.
 * Throws if the result fails {@link TAG_RE}.
 */
export function normaliseTag(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (!TAG_RE.test(t)) {
    throw new Error('tag must be 2-6 uppercase alphanumeric characters');
  }
  return t;
}

/**
 * Pick the first palette entry that isn't currently in use by an
 * active clan on this server. Returns null only when every slot is
 * taken — at which point the operator should rotate disbanded clans
 * or extend the palette through /dashboard/settings.
 *
 * `palette` defaults to {@link DEFAULT_PALETTE} but accepts an
 * operator-set list so /dashboard/settings can override the colour
 * set without touching this helper. A Fisher–Yates shuffle on a local
 * copy keeps two simultaneous creates on a fresh server from racing
 * for slot 0.
 */
export async function allocateUnusedColor(
  serverId: number,
  palette: ReadonlyArray<string> = DEFAULT_PALETTE,
): Promise<string | null> {
  const db = getDb();
  const taken = await db
    .select({ colorHex: schema.clans.colorHex })
    .from(schema.clans)
    .where(
      and(eq(schema.clans.serverId, serverId), isNull(schema.clans.disbandedAt)),
    );
  const takenSet = new Set(taken.map((r) => r.colorHex.toUpperCase()));

  const candidates = [...palette];
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  for (const c of candidates) {
    if (!takenSet.has(c.toUpperCase())) return c;
  }
  return null;
}

/**
 * Check whether a hex color is already in use on this server. Used
 * for the leader-set color path, where the operator picks a specific
 * shade and we need to warn / reject if it would collide.
 */
export async function isColorTaken(
  serverId: number,
  hex: string,
  exceptClanId?: number,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.clans.id })
    .from(schema.clans)
    .where(
      and(
        eq(schema.clans.serverId, serverId),
        eq(schema.clans.colorHex, hex),
        isNull(schema.clans.disbandedAt),
      ),
    );
  return rows.some((r) => r.id !== exceptClanId);
}
