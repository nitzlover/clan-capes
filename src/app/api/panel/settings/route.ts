/**
 * Admin settings endpoint.
 *
 *   GET ?serverId=N  → current merged-with-defaults settings
 *   PATCH {serverId?, patch}  → validate + save + return fresh snapshot
 *
 * Both require admin JWT. PATCH audits the change so /dashboard/audit
 * can answer "who bumped the cooldown to 4 hours" without joining the
 * settings blob's mtime.
 */

import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/server/auth';
import { dbEnabled, getDb, schema } from '@/lib/server/db';
import {
  getServerSettings,
  updateServerSettings,
  type SettingsPatch,
} from '@/lib/server/settings-repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveServerId(req: Request, fallbackBody: { serverId?: number } = {}): Promise<number | null> {
  const url = new URL(req.url);
  const raw = url.searchParams.get('serverId') ?? String(fallbackBody.serverId ?? '');
  if (raw) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0) return n;
  }
  const db = getDb();
  const [first] = await db
    .select({ id: schema.servers.id })
    .from(schema.servers)
    .orderBy(desc(schema.servers.createdAt))
    .limit(1);
  return first?.id ?? null;
}

export async function GET(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }
  const serverId = await resolveServerId(req);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }
  const settings = await getServerSettings(serverId);
  return NextResponse.json({ serverId, settings });
}

export async function PATCH(req: Request) {
  const user = requireAuth(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!dbEnabled()) {
    return NextResponse.json({ error: 'db disabled' }, { status: 503 });
  }

  let body: { serverId?: number; patch?: SettingsPatch };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const patch = body.patch ?? {};
  const serverId = await resolveServerId(req, body);
  if (!serverId) {
    return NextResponse.json({ error: 'no servers registered' }, { status: 409 });
  }

  let next;
  try {
    next = await updateServerSettings(serverId, patch);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'invalid settings patch' },
      { status: 400 },
    );
  }

  const db = getDb();
  await db.insert(schema.audit).values({
    serverId,
    actor: `admin:${user.sub}`,
    action: 'SETTINGS_UPDATE',
    target: null,
    payload: { keys: Object.keys(patch) },
  });

  return NextResponse.json({ ok: true, serverId, settings: next });
}
