/**
 * Admin Paper-plugin jar management.
 *
 *   GET  → current latest.json (version / filename / size / uploadedAt) or null
 *   POST → multipart { jar, version } → store jar on the Volume + record it
 *          as the new latest. Admin JWT required.
 *
 * The uploaded jar is what /api/plugin/download serves and what
 * /api/plugin/version advertises to the Paper plugin's auto-updater.
 * Mirrors /api/panel/mod exactly, but writes Crestoria-<version>.jar so
 * the plugin's `plugins/update/Crestoria-<latest>.jar` hot-swap target
 * matches what it downloads.
 */

import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth';
import { MAX_MOD_UPLOAD_KB } from '@/lib/server/env';
import {
  ensurePluginDir,
  pluginJarPath,
  readPluginLatest,
  writePluginLatest,
} from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// semver-ish: 1.2.1, 1.2.0, optional -rc1 / .build tags
const VERSION_RE = /^\d+\.\d+\.\d+([-.][A-Za-z0-9]+)*$/;

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ latest: await readPluginLatest() });
}

export async function POST(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let file: File | null = null;
  let version = '';
  try {
    const form = await req.formData();
    const entry = form.get('jar');
    if (entry instanceof File) file = entry;
    version = String(form.get('version') ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'multipart body required' }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: 'jar file required' }, { status: 400 });
  if (!VERSION_RE.test(version)) {
    return NextResponse.json(
      { error: 'version must be semver, e.g. 1.2.1' },
      { status: 400 },
    );
  }
  if (!file.name.toLowerCase().endsWith('.jar')) {
    return NextResponse.json({ error: 'file must be a .jar' }, { status: 400 });
  }
  const cap = MAX_MOD_UPLOAD_KB * 1024;
  if (file.size > cap) {
    return NextResponse.json(
      { error: `jar too large (${file.size} bytes > ${cap} cap)` },
      { status: 413 },
    );
  }

  const filename = `Crestoria-${version}.jar`;
  const buf = Buffer.from(await file.arrayBuffer());
  await ensurePluginDir();
  await fs.writeFile(pluginJarPath(filename), buf);
  const meta = {
    version,
    filename,
    size: buf.length,
    uploadedAt: new Date().toISOString(),
  };
  await writePluginLatest(meta);

  return NextResponse.json({ ok: true, ...meta });
}
