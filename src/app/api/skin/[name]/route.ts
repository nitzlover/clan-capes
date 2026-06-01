/**
 * Skin lookup proxy for /studio's player-name chooser.
 *
 * mcrender does this with an authed RSC server action; we do the same job
 * with a same-origin Node route so the browser never hits a third-party
 * host directly (CSP `connect-src 'self'` + canvas-taint headaches).
 *
 * name → Mojang UUID → profile textures → skin PNG, returned as a base64
 * `data:` URI in JSON so the client can load it through skinview-utils with
 * zero CORS friction. `model` ('classic' | 'slim') lets the viewer pick the
 * right rig. Falls back to minotar.net if Mojang is unavailable.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NAME_RE = /^[A-Za-z0-9_]{1,16}$/;

type SkinResult = { ok: true; model: 'classic' | 'slim'; dataUrl: string } | { ok: false; error: string };

async function fromMojang(name: string): Promise<SkinResult> {
  const prof = await fetch(`https://api.mojang.com/users/profiles/minecraft/${name}`, { cache: 'no-store' });
  if (!prof.ok) throw new Error('no profile');
  const { id } = (await prof.json()) as { id?: string };
  if (!id) throw new Error('no uuid');

  const sess = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`, { cache: 'no-store' });
  if (!sess.ok) throw new Error('no session');
  const sj = (await sess.json()) as { properties?: { value: string }[] };
  const value = sj.properties?.[0]?.value;
  if (!value) throw new Error('no textures');

  const tex = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as {
    textures?: { SKIN?: { url?: string; metadata?: { model?: string } } };
  };
  const url = tex.textures?.SKIN?.url;
  if (!url) throw new Error('no skin url');
  const model = tex.textures?.SKIN?.metadata?.model === 'slim' ? 'slim' : 'classic';

  const png = await fetch(url, { cache: 'no-store' });
  if (!png.ok) throw new Error('skin fetch failed');
  const buf = Buffer.from(await png.arrayBuffer());
  return { ok: true, model, dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
}

async function fromMinotar(name: string): Promise<SkinResult> {
  const r = await fetch(`https://minotar.net/skin/${name}.png`, { cache: 'no-store' });
  if (!r.ok) throw new Error('minotar failed');
  const buf = Buffer.from(await r.arrayBuffer());
  return { ok: true, model: 'classic', dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
}

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const clean = (name || '').trim();
  if (!NAME_RE.test(clean)) {
    return NextResponse.json({ ok: false, error: 'invalid name' }, { status: 400 });
  }
  try {
    const res = await fromMojang(clean);
    return NextResponse.json(res, { headers: { 'cache-control': 'public, max-age=300' } });
  } catch {
    try {
      const res = await fromMinotar(clean);
      return NextResponse.json(res, { headers: { 'cache-control': 'public, max-age=120' } });
    } catch {
      return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
    }
  }
}
