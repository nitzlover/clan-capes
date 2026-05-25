/**
 * Leader session probe.
 *
 * Returns the current leader JWT's claims plus a fresh re-check of
 * the live clan membership — defence-in-depth so a kicked / demoted
 * player can't keep using a still-valid cookie. On miss returns 401
 * and the UI bounces back to the token paste form.
 */

import { NextResponse } from 'next/server';
import { getClanForPlayer } from '@/lib/server/clan-repo';
import { dbEnabled } from '@/lib/server/db';
import { requireLeaderAuth } from '@/lib/server/leader-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const session = requireLeaderAuth(req);
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const clan = await getClanForPlayer(session.serverId, session.sub);
  if (!clan || clan.tag !== session.clan) {
    return NextResponse.json(
      { error: 'no longer a member of the claimed clan' },
      { status: 403 },
    );
  }
  const member = clan.members.find(
    (m) => m.playerUuid.toLowerCase() === session.sub.toLowerCase(),
  );
  if (!member || (member.role !== 'leader' && member.role !== 'deputy')) {
    return NextResponse.json(
      { error: 'role no longer allows panel access' },
      { status: 403 },
    );
  }

  return NextResponse.json({
    playerUuid: session.sub,
    playerName: member.playerName,
    serverId: session.serverId,
    clan: clan.tag,
    role: member.role,
  });
}
