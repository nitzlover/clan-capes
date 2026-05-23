import { NextResponse } from 'next/server';
import { signToken, verifyAdmin } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const { username, password } = body;
  if (!username || !password) {
    return NextResponse.json({ error: 'username and password required' }, { status: 400 });
  }
  const ok = await verifyAdmin(username, password);
  if (!ok) {
    console.warn(`[auth] login FAIL user=${username}`);
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }
  console.log(`[auth] login OK user=${username}`);
  return NextResponse.json({ token: signToken(username) });
}
