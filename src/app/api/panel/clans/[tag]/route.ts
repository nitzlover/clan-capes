import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth';
import * as mc from '@/lib/server/minecraft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ tag: string }> }) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { tag } = await ctx.params;
  const data = await mc.fetchClan(tag.toUpperCase());
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(data);
}
