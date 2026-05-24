/**
 * Plugin-facing: which clan does this player belong to right now?
 *
 * Used on the hot path: PlayerJoinEvent + every chat/TAB refresh
 * needs to paint the player's clan prefix. The plugin caches the
 * answer locally for the player's session and only re-fetches when
 * the panel signals an update (Phase 2.5).
 *
 * Returns 404 when the player is unclanned so the plugin can branch
 * on response status; an empty 200 would force JSON-body parsing for
 * every miss.
 */

import { NextResponse } from 'next/server';
import { getClanForPlayer } from '@/lib/server/clan-repo';
import { dbEnabled } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ uuid: string }> },
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

  const { uuid } = await ctx.params;
  if (!UUID_RE.test(uuid)) {
    return NextResponse.json({ error: 'invalid uuid' }, { status: 400 });
  }

  const clan = await getClanForPlayer(auth.id, uuid);
  if (!clan) {
    return NextResponse.json({ error: 'player has no clan' }, { status: 404 });
  }
  return NextResponse.json({ clan });
}
