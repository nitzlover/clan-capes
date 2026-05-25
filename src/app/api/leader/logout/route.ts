/**
 * Clear the leader session cookie. No-op if no cookie was present —
 * we always respond 200 so the UI can just call this and redirect
 * without branching on whether the user was actually logged in.
 */

import { NextResponse } from 'next/server';
import { clearLeaderCookieHeader } from '@/lib/server/leader-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    { ok: true },
    { headers: { 'Set-Cookie': clearLeaderCookieHeader() } },
  );
}
