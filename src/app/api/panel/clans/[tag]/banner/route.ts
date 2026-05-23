import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth';
import * as mc from '@/lib/server/minecraft';
import { appendAudit } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LAYERS = 6;

/**
 * GET → returns the saved banner spec for this clan, or 404 if none.
 * POST → upsert { baseColor, patterns }; plugin re-applies onto online members.
 * DELETE → wipe the spec; held shields keep whatever they had until next swap.
 *
 * All three require the admin JWT. The actual storage and Bukkit-side
 * mutation live on the Paper plugin — this route is a thin proxy that
 * adds auth, validation, and audit logging.
 */

export async function GET(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { tag: rawTag } = await ctx.params;
  const tag = rawTag.toUpperCase();
  try {
    const dto = await mc.fetchClanBanner(tag);
    if (!dto) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(dto);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'plugin unreachable' },
      { status: 502 }
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { tag: rawTag } = await ctx.params;
  const tag = rawTag.toUpperCase();

  let body: { baseColor?: number; patterns?: mc.BannerPatternSpec[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'json body required' }, { status: 400 });
  }

  const baseColor = Number.isInteger(body.baseColor) ? Number(body.baseColor) : -1;
  if (baseColor < 0 || baseColor > 15) {
    return NextResponse.json({ error: 'baseColor must be 0..15' }, { status: 400 });
  }
  const patterns = Array.isArray(body.patterns) ? body.patterns : [];
  if (patterns.length > MAX_LAYERS) {
    return NextResponse.json(
      { error: `too many layers (max ${MAX_LAYERS})` },
      { status: 400 }
    );
  }
  for (const p of patterns) {
    if (
      !p ||
      typeof p.pattern !== 'string' ||
      !p.pattern.length ||
      !Number.isInteger(p.color) ||
      p.color < 0 ||
      p.color > 15
    ) {
      return NextResponse.json({ error: 'invalid pattern entry' }, { status: 400 });
    }
  }

  try {
    const dto = await mc.setClanBanner(tag, baseColor, patterns, user.sub);
    await appendAudit(`${user.sub}\tBANNER_SET\t${tag}\tbase=${baseColor} layers=${patterns.length}`);
    return NextResponse.json(dto);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'banner save failed' },
      { status: 502 }
    );
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { tag: rawTag } = await ctx.params;
  const tag = rawTag.toUpperCase();
  try {
    await mc.deleteClanBanner(tag);
    await appendAudit(`${user.sub}\tBANNER_DELETE\t${tag}`);
    return NextResponse.json({ ok: true, tag });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'banner delete failed' },
      { status: 502 }
    );
  }
}
