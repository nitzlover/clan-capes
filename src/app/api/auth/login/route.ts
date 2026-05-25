import { NextResponse } from 'next/server';
import { signToken, verifyAdmin } from '@/lib/server/auth';
import { limit } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // 5 attempts per IP per minute — slows credential stuffing without
  // locking out the operator during a fat-finger sequence.
  if (!limit(req, 'auth:login', 5, 60_000)) {
    return NextResponse.json(
      { error: 'too many attempts; try again in a minute' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

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
    // Truncate the username so the log can't be used to enumerate
    // valid admin candidates from a shared log sink.
    const safe = username.slice(0, 3) + '…';
    console.warn(`[auth] login FAIL user=${safe}`);
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }
  console.log(`[auth] login OK user=${username}`);
  return NextResponse.json({ token: signToken(username) });
}
