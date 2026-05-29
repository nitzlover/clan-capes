/**
 * Admin GET — returns every (slot, material, pattern) row currently
 * registered for a given clan. The dashboard prefills the 4 slot
 * dropdowns from this so an admin sees what the plugin will stamp on
 * equip without having to dig through the DB.
 */

import { NextResponse } from 'next/server';

import { requireAuth } from '@/lib/server/auth';
import { getArmorTrimsForClan } from '@/lib/server/armor-trim-repo';
import { getClanByTag } from '@/lib/server/clan-repo';
import { normaliseTag } from '@/lib/server/clan-validators';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { resolveServerId } from '@/lib/server/resolve-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) return NextResponse.json({ error: 'db disabled' }, { status: 503 });

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
  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }
  const clan = await getClanByTag(serverId, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }
  const trims = await getArmorTrimsForClan(clan.id);
  return NextResponse.json({ trims });
}
