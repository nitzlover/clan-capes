/**
 * Shared scope-check for leader-panel routes.
 *
 * Every leader endpoint takes a tag path-param and is allowed only
 * when (a) the JWT carries that exact tag and (b) the live clan-repo
 * snapshot still has the player as a leader/deputy. Bundling both
 * checks here saves every route from repeating the same boilerplate
 * and ensures a kick/disband is reflected in the panel within the
 * next page load even if the JWT hasn't expired.
 *
 * Returns either the resolved clan + role on success, or a NextResponse
 * carrying the right error status so callers can do
 *
 *   const guard = await requireLeaderScope(req, tag);
 *   if (guard instanceof NextResponse) return guard;
 *   const { clan, session, role } = guard;
 */

import { NextResponse } from 'next/server';
import { getClanForPlayer, type ClanDto } from '@/lib/server/clan-repo';
import { normaliseTag } from '@/lib/server/clan-validators';
import { dbEnabled } from '@/lib/server/db';
import {
  requireLeaderAuth,
  type LeaderJwtPayload,
} from '@/lib/server/leader-auth';

export type LeaderScopeOk = {
  session: LeaderJwtPayload;
  clan: ClanDto;
  role: 'leader' | 'deputy';
};

export async function requireLeaderScope(
  req: Request,
  rawTag: string,
  opts?: { leaderOnly?: boolean },
): Promise<LeaderScopeOk | NextResponse> {
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  let tag: string;
  try {
    tag = normaliseTag(rawTag);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid tag' },
      { status: 400 },
    );
  }

  const session = requireLeaderAuth(req);
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (session.clan !== tag) {
    return NextResponse.json(
      { error: 'session clan does not match URL tag' },
      { status: 403 },
    );
  }

  const clan = await getClanForPlayer(session.serverId, session.sub);
  if (!clan || clan.tag !== tag) {
    return NextResponse.json(
      { error: 'no longer a member of this clan' },
      { status: 403 },
    );
  }
  const member = clan.members.find(
    (m) => m.playerUuid.toLowerCase() === session.sub.toLowerCase(),
  );
  if (!member) {
    return NextResponse.json(
      { error: 'membership row missing' },
      { status: 403 },
    );
  }
  if (member.role !== 'leader' && member.role !== 'deputy') {
    return NextResponse.json(
      { error: 'role no longer allows panel access' },
      { status: 403 },
    );
  }
  if (opts?.leaderOnly && member.role !== 'leader') {
    return NextResponse.json(
      { error: 'leader-only action' },
      { status: 403 },
    );
  }
  return { session, clan, role: member.role };
}
