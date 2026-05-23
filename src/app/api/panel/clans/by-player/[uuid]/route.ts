import { NextResponse } from 'next/server';
import * as mc from '@/lib/server/minecraft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public endpoint (no JWT). Resolves a player's clan cape so the login page
 * can preview the cape on the 3D character while the user is still typing
 * their nickname. The Fabric mod uses /api/static/capes/<TAG>.png directly,
 * so this endpoint is purely a UX helper for the panel.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ uuid: string }> }) {
  const { uuid } = await ctx.params;
  if (!/^[0-9a-fA-F-]{32,36}$/.test(uuid)) {
    return NextResponse.json({ error: 'invalid uuid' }, { status: 400 });
  }
  try {
    const dto = await mc.fetchPlayerCape(uuid);
    if (!dto?.capeUrl) {
      return NextResponse.json({ error: 'no cape' }, { status: 404 });
    }
    return NextResponse.json({
      uuid,
      clanTag: dto.clanTag ?? null,
      capeUrl: dto.capeUrl,
      updatedAt: dto.updatedAt ?? 0,
      updatedBy: dto.updatedBy ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'plugin unreachable' },
      { status: 503 }
    );
  }
}
