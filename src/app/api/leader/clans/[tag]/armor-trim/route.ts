/**
 * Leader GET — same shape as the admin collection endpoint but gated
 * through requireLeaderScope, so a leader / deputy only ever sees
 * their own clan's slot rows.
 */

import { NextResponse } from 'next/server';
import { getArmorTrimsForClan } from '@/lib/server/armor-trim-repo';
import { requireLeaderScope } from '@/lib/server/leader-scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
) {
  const { tag } = await ctx.params;
  const scope = await requireLeaderScope(req, tag);
  if (scope instanceof NextResponse) return scope;
  const trims = await getArmorTrimsForClan(scope.clan.id);
  return NextResponse.json({ trims });
}
