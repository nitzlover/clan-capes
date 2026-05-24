/**
 * DB-backed banner CRUD. One row per clan; clearing a banner is a
 * straight DELETE so the FK cascade keeps things tidy on disband.
 */

import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/server/db';

export type BannerPattern = { color: number; pattern: string };

export type BannerRecord = {
  clanId: number;
  baseColor: number;
  patterns: BannerPattern[];
  updatedAt: string;
  updatedBy: string;
};

export async function getBannerByClanId(clanId: number): Promise<BannerRecord | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.clanBanners)
    .where(eq(schema.clanBanners.clanId, clanId))
    .limit(1);
  if (!row) return null;
  return {
    clanId: row.clanId,
    baseColor: row.baseColor,
    patterns: row.patterns as BannerPattern[],
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

/**
 * Upsert — replace the entire banner spec for `clanId`. Idempotent;
 * re-saving an unchanged spec just bumps `updated_at`.
 */
export async function upsertBanner(
  clanId: number,
  baseColor: number,
  patterns: BannerPattern[],
  updatedBy: string,
): Promise<BannerRecord> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(schema.clanBanners)
    .values({ clanId, baseColor, patterns, updatedAt: now, updatedBy })
    .onConflictDoUpdate({
      target: schema.clanBanners.clanId,
      set: { baseColor, patterns, updatedAt: now, updatedBy },
    });
  return {
    clanId,
    baseColor,
    patterns,
    updatedAt: now.toISOString(),
    updatedBy,
  };
}

export async function deleteBanner(clanId: number): Promise<void> {
  const db = getDb();
  await db.delete(schema.clanBanners).where(eq(schema.clanBanners.clanId, clanId));
}
