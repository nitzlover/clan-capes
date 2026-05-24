/**
 * Plugin-facing: single clan lookup by tag.
 *
 * Tag is case-insensitive — the helper normalises to upper case
 * before querying so `/clan info king` and `/clan info KING` resolve
 * to the same row.
 *
 * Returns 404 for missing or disbanded clans so the plugin can
 * branch on response status without parsing the body.
 */

import { NextResponse } from 'next/server';
import { getClanByTag } from '@/lib/server/clan-repo';
import { dbEnabled } from '@/lib/server/db';
import { requirePluginAuth } from '@/lib/server/plugin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ tag: string }> },
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

  const { tag } = await ctx.params;
  if (!/^[A-Za-z0-9]{1,16}$/.test(tag)) {
    return NextResponse.json({ error: 'invalid tag' }, { status: 400 });
  }

  const clan = await getClanByTag(auth.id, tag);
  if (!clan) {
    return NextResponse.json({ error: 'clan not found' }, { status: 404 });
  }
  return NextResponse.json({ clan });
}
