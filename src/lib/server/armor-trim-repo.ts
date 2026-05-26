/**
 * Per-clan armour trim CRUD.
 *
 * One row per (clan_id, slot). The composite PK lets us upsert via
 * ON CONFLICT without an explicit select-then-insert round-trip.
 *
 * Materials + patterns are stored as the vanilla registry-key short
 * form ("iron", "sentry") without the {@code minecraft:} namespace
 * prefix — the plugin re-prefixes when calling
 * {@code Registry.TRIM_MATERIAL.get(NamespacedKey.minecraft("iron"))}.
 * Keeping the short form lets us validate against a small allowlist
 * without parsing namespaces.
 */

import { and, eq } from 'drizzle-orm';
import { getDb, schema } from './db';

export type ArmorSlot = 'head' | 'chest' | 'legs' | 'feet';

export const ARMOR_SLOTS: ArmorSlot[] = ['head', 'chest', 'legs', 'feet'];

/**
 * Vanilla TrimMaterial registry keys shipped in 1.20+. List is checked
 * server-side on write so an operator can't sneak an arbitrary string
 * into the DB and crash the plugin's Registry.get call at apply time.
 */
export const TRIM_MATERIALS = [
  'iron',
  'copper',
  'gold',
  'lapis',
  'emerald',
  'diamond',
  'netherite',
  'redstone',
  'amethyst',
  'quartz',
  'resin',
] as const;
export type TrimMaterial = (typeof TRIM_MATERIALS)[number];

/**
 * Vanilla TrimPattern registry keys shipped in 1.20+. Patterns added
 * in subsequent updates ("bolt" 1.21, "flow" 1.21) are included;
 * the plugin's lookup gracefully falls back to "sentry" if the
 * server's version doesn't ship a given pattern.
 */
export const TRIM_PATTERNS = [
  'sentry',
  'dune',
  'coast',
  'wild',
  'ward',
  'eye',
  'vex',
  'tide',
  'snout',
  'rib',
  'spire',
  'wayfinder',
  'shaper',
  'silence',
  'raiser',
  'host',
  'flow',
  'bolt',
] as const;
export type TrimPattern = (typeof TRIM_PATTERNS)[number];

export type ArmorTrimRecord = {
  clanId: number;
  slot: ArmorSlot;
  material: TrimMaterial;
  pattern: TrimPattern;
  updatedAt: string;
  updatedBy: string;
};

const MATERIAL_SET = new Set<string>(TRIM_MATERIALS);
const PATTERN_SET = new Set<string>(TRIM_PATTERNS);
const SLOT_SET = new Set<string>(ARMOR_SLOTS);

export function isArmorSlot(s: string): s is ArmorSlot {
  return SLOT_SET.has(s);
}
export function isTrimMaterial(s: string): s is TrimMaterial {
  return MATERIAL_SET.has(s);
}
export function isTrimPattern(s: string): s is TrimPattern {
  return PATTERN_SET.has(s);
}

export async function getArmorTrimsForClan(clanId: number): Promise<ArmorTrimRecord[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.clanArmorTrims)
    .where(eq(schema.clanArmorTrims.clanId, clanId));
  return rows.map((r) => ({
    clanId: r.clanId,
    slot: r.slot as ArmorSlot,
    material: r.material as TrimMaterial,
    pattern: r.pattern as TrimPattern,
    updatedAt: r.updatedAt.toISOString(),
    updatedBy: r.updatedBy,
  }));
}

export async function upsertArmorTrim(input: {
  clanId: number;
  slot: ArmorSlot;
  material: TrimMaterial;
  pattern: TrimPattern;
  updatedBy: string;
}): Promise<ArmorTrimRecord> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(schema.clanArmorTrims)
    .values({
      clanId: input.clanId,
      slot: input.slot,
      material: input.material,
      pattern: input.pattern,
      updatedAt: now,
      updatedBy: input.updatedBy,
    })
    .onConflictDoUpdate({
      target: [schema.clanArmorTrims.clanId, schema.clanArmorTrims.slot],
      set: {
        material: input.material,
        pattern: input.pattern,
        updatedAt: now,
        updatedBy: input.updatedBy,
      },
    });
  return {
    clanId: input.clanId,
    slot: input.slot,
    material: input.material,
    pattern: input.pattern,
    updatedAt: now.toISOString(),
    updatedBy: input.updatedBy,
  };
}

export async function deleteArmorTrim(clanId: number, slot: ArmorSlot): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.clanArmorTrims)
    .where(
      and(
        eq(schema.clanArmorTrims.clanId, clanId),
        eq(schema.clanArmorTrims.slot, slot),
      ),
    );
}
