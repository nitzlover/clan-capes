import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth';
import { CDN_PUBLIC_URL, UPLOAD_DIR } from '@/lib/server/env';
import * as mc from '@/lib/server/minecraft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let files: string[] = [];
  try {
    files = (await fs.readdir(UPLOAD_DIR)).filter((f) => f.toLowerCase().endsWith('.png'));
  } catch {
    files = [];
  }

  const cdn = CDN_PUBLIC_URL;
  const clans = await Promise.all(
    files.map(async (file) => {
      const tag = file.replace(/\.png$/i, '');
      const stat = await fs.stat(`${UPLOAD_DIR}/${file}`);
      let remote: { updatedAt?: number; updatedBy?: string } | null = null;
      try {
        remote = await mc.fetchClan(tag);
      } catch {
        /* ignore — local CDN still serves it */
      }
      return {
        tag,
        capeUrl: `${cdn}/${file}`,
        updatedAt: remote?.updatedAt ?? stat.mtimeMs,
        updatedBy: remote?.updatedBy ?? 'panel',
      };
    })
  );
  return NextResponse.json({ clans });
}
