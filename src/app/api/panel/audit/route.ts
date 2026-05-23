import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/auth';
import { readAudit } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const entries = await readAudit(200);
  return NextResponse.json({ entries });
}
