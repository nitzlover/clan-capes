/**
 * Plugin-facing banner read.
 *
 * Bearer-auth'd lookup of the banner spec for a single clan. Plugin
 * uses this to populate its in-memory BannerRepository cache so the
 * ShieldBannerListener can apply the right pattern when a clan
 * member equips a shield.
 *
 * Returns 404 (with `{ error: 'no banner' }`) when the clan exists
 * but has no banner spec — the plugin treats that as "wear a plain
 * shield" rather than throwing. 404 on the clan itself surfaces with
 * `{ error: 'clan not found' }` so the plugin can log-warn.
 */

import { NextResponse } from 'next/server';
import { getClanByTag } from '@/lib/server/clan-repo';
import { getBannerByClanId } from '@/lib/server/banner-repo';
import { dbEnabled } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';
import { normaliseTag } from '@/lib/server/clan-validators';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const auth = await requirePluginAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: 'invalid or missing plugin API key' },
      { status: 401 },
    );
  }

  const { tag: rawTag } = await ctx.params;
  let tag: string;
  try {
    tag = normaliseTag(rawTag);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid tag' },
      { status: 400 },
    );
  }

  const clan = await getClanByTag(auth.id, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }
  const banner = await getBannerByClanId(clan.id);
  if (!banner) {
    return NextResponse.json({ error: 'no banner' }, { status: 404 });
  }

  return NextResponse.json({
    clan: tag,
    baseColor: banner.baseColor,
    patterns: banner.patterns,
    updatedAt: banner.updatedAt,
    updatedBy: banner.updatedBy,
  });
}
