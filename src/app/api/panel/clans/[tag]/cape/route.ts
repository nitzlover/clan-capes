import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth';
import { validateAndNormalizePng } from '@/lib/server/capeValidate';
import { CDN_PUBLIC_URL, MAX_UPLOAD_KB } from '@/lib/server/env';
import * as mc from '@/lib/server/minecraft';
import { appendAudit, capeFilePath, ensureDirs } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Upload a cape PNG for a clan. Steps:
 *   1) JWT auth check
 *   2) Pull PowerClans list — refuse uploads for unknown clan tags
 *   3) Validate + re-encode PNG (64x32 / 128x64, max KB cap)
 *   4) Write to UPLOAD_DIR/<TAG>.png
 *   5) Tell the Paper plugin to remember the URL (so Fabric mod can fetch it)
 *   6) Append audit log line
 */
export async function POST(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { tag: rawTag } = await ctx.params;
  const tag = rawTag.toUpperCase();

  let file: File | null = null;
  try {
    const form = await req.formData();
    const entry = form.get('cape');
    if (entry instanceof File) file = entry;
  } catch {
    return NextResponse.json({ error: 'multipart body required' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'cape file required' }, { status: 400 });

  try {
    let powerClans: Awaited<ReturnType<typeof mc.fetchPowerClans>> | null = null;
    try {
      powerClans = await mc.fetchPowerClans();
    } catch (e) {
      return NextResponse.json(
        {
          error:
            'PowerClans list unavailable from Paper API — refusing upload. ' +
            (e instanceof Error ? e.message : ''),
        },
        { status: 502 }
      );
    }
    const known = powerClans.some((c) => c.tag.toUpperCase() === tag);
    if (!known) {
      return NextResponse.json(
        { error: `Clan tag "${tag}" is not in PowerClans. Choose a clan from the list.` },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const normalized = await validateAndNormalizePng(buf, MAX_UPLOAD_KB);

    await ensureDirs();
    const outPath = capeFilePath(tag);
    await fs.writeFile(outPath, normalized);

    const publicUrl = `${CDN_PUBLIC_URL}/${tag}.png`;
    const actor = user.sub;
    await mc.setClanCape(tag, publicUrl, actor);
    await appendAudit(`${actor}\tUPLOAD\t${tag}\t${publicUrl}`);

    console.log(`[upload] tag=${tag} actor=${actor} bytes=${normalized.length} url=${publicUrl}`);
    return NextResponse.json({ ok: true, tag, capeUrl: publicUrl });
  } catch (e) {
    console.warn(`[upload] tag=${tag} FAILED: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'upload failed' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { tag: rawTag } = await ctx.params;
  const tag = rawTag.toUpperCase();
  try {
    await mc.deleteClanCape(tag);
    await fs.unlink(capeFilePath(tag)).catch(() => undefined);
    await appendAudit(`${user.sub}\tDELETE\t${tag}`);
    console.log(`[delete] tag=${tag} actor=${user.sub}`);
    return NextResponse.json({ ok: true, tag });
  } catch (e) {
    console.warn(`[delete] tag=${tag} FAILED: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'delete failed' },
      { status: 500 }
    );
  }
}
