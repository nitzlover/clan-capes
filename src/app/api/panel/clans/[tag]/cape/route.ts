/**
 * Upload + delete cape PNGs for a clan.
 *
 * Gate: clan must exist (active row in `clans`) on the resolved
 * server. The legacy PowerClans-list gate was removed once that
 * plugin was taken out of the in-game stack — DB is now the only
 * source of truth for "is this a real clan tag".
 *
 * Steps on POST:
 *   1. JWT auth
 *   2. Multipart body parse
 *   3. Size pre-check via Web File.size (refuse before buffering MB-scale uploads into memory)
 *   4. Tag must match the panel's clan roster (DB)
 *   5. Validate + re-encode PNG (64x32 / 128x64, MAX_UPLOAD_KB cap)
 *   6. Write to UPLOAD_DIR/<TAG>.png
 *   7. Forward to plugin so the Fabric mod sees the new URL
 *   8. Audit row (DB-backed)
 */

import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { validateAndNormalizePng } from '@/lib/server/capeValidate';
import { getClanByTag } from '@/lib/server/clan-repo';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import { CDN_PUBLIC_URL, MAX_UPLOAD_KB } from '@/lib/server/env';
import { capeFilePath, ensureDirs } from '@/lib/server/storage';
import { getRequestId } from '@/lib/server/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TAG_RE = /^[A-Z0-9]{2,6}$/;

async function resolveServerId(): Promise<number | null> {
  if (!dbEnabled()) return null;
  const db = getDb();
  const [first] = await db
    .select({ id: schema.servers.id })
    .from(schema.servers)
    .orderBy(desc(schema.servers.createdAt))
    .limit(1);
  return first?.id ?? null;
}

export async function POST(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { tag: rawTag } = await ctx.params;
  const tag = rawTag.toUpperCase();
  if (!TAG_RE.test(tag)) {
    return NextResponse.json(
      { error: 'tag must be 2-6 uppercase alphanumeric characters' },
      { status: 400 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const entry = form.get('cape');
    if (entry instanceof File) file = entry;
  } catch {
    return NextResponse.json({ error: 'multipart body required' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'cape file required' }, { status: 400 });

  // Pre-buffer size guard — refuse anything over the cap before we
  // load the whole arrayBuffer into memory. Stops MB-scale uploads
  // from pinning a Railway dyno's RAM.
  const sizeCap = MAX_UPLOAD_KB * 1024;
  if (file.size > sizeCap) {
    return NextResponse.json(
      { error: `cape too large (${file.size} bytes > ${sizeCap} cap)` },
      { status: 413 },
    );
  }

  // Gate against the DB clan roster — replaces the legacy PowerClans
  // list lookup that no longer exists.
  const serverId = await resolveServerId();
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }
  const clan = await getClanByTag(serverId, tag);
  if (!clan) {
    return NextResponse.json(
      { error: `clan tag "${tag}" not found on this server — create it first` },
      { status: 404 },
    );
  }

  const rid = getRequestId(req);

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const normalized = await validateAndNormalizePng(buf, MAX_UPLOAD_KB);

    await ensureDirs();
    const outPath = capeFilePath(tag);
    await fs.writeFile(outPath, normalized);

    // Use the file's known mtime via `Date.now()` instead of an extra
    // `fs.stat` round-trip; the writeFile completed synchronously, so
    // Date.now() is within a few ms of the real mtime and not subject
    // to a concurrent-write race that two fs syscalls would have.
    const v = Date.now();
    const publicUrl = `${CDN_PUBLIC_URL}/${tag}.png?v=${v}`;
    const actor = user.sub;
    // The Fabric mod reads the cape straight off the CDN URL (mtime
    // cache-buster) and the plugin polls /api/plugin/clans — neither
    // needs a push from here, so there's no plugin round-trip on save.

    const db = getDb();
    await db.insert(schema.audit).values({
      serverId,
      actor: `admin:${actor}`,
      action: 'CAPE_UPLOAD',
      target: tag,
      payload: { capeUrl: publicUrl, bytes: normalized.length, _rid: rid },
    });

    console.log(`[upload] tag=${tag} actor=${actor} bytes=${normalized.length} url=${publicUrl}`);
    return NextResponse.json(
      { ok: true, tag, capeUrl: publicUrl, _rid: rid },
      { headers: { 'x-request-id': rid } },
    );
  } catch (e) {
    console.warn(`[upload] tag=${tag} FAILED: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'upload failed' },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { tag: rawTag } = await ctx.params;
  const tag = rawTag.toUpperCase();
  if (!TAG_RE.test(tag)) {
    return NextResponse.json({ error: 'invalid tag' }, { status: 400 });
  }
  const serverId = await resolveServerId();
  const rid = getRequestId(req);
  try {
    await fs.unlink(capeFilePath(tag)).catch(() => undefined);
    if (serverId) {
      const db = getDb();
      await db.insert(schema.audit).values({
        serverId,
        actor: `admin:${user.sub}`,
        action: 'CAPE_DELETE',
        target: tag,
        payload: { _rid: rid },
      });
    }
    console.log(`[delete] tag=${tag} actor=${user.sub}`);
    return NextResponse.json(
      { ok: true, tag, _rid: rid },
      { headers: { 'x-request-id': rid } },
    );
  } catch (e) {
    console.warn(`[delete] tag=${tag} FAILED: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'delete failed' },
      { status: 500 },
    );
  }
}
