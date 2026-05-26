/**
 * Bearer-API-key auth for plugin → panel requests.
 *
 * Hot path: every heartbeat, kill, banner mirror, clan CRUD round-trip
 * is gated through {@link requirePluginAuth}. We need the lookup to
 * be O(1) — at 100+ registered servers a linear bcrypt scan was
 * burning a CPU core just answering routine plugin traffic.
 *
 * Strategy: the API key's first 16 chars ("ck_live_<8 url-safe>")
 * land in the indexed `servers.api_key_prefix` column on consume. On
 * request we extract the same prefix from the incoming Bearer header,
 * filter to the single row that matches, then bcrypt-verify against
 * that row's hash.
 *
 * Legacy fallback: rows registered before migration 0006 carry an
 * empty `api_key_prefix`. If the prefix index miss matches no rows
 * we fall back to the full linear scan so existing deploys keep
 * working until the operator rotates the key.
 */

import { eq, or } from 'drizzle-orm';
import { getDb, dbEnabled, schema } from '@/lib/server/db';
import { extractApiKeyPrefix, isApiKey, verifySecret } from '@/lib/server/api-key';

export type ServerContext = {
  id: number;
  name: string;
};

export async function requirePluginAuth(req: Request): Promise<ServerContext | null> {
  if (!dbEnabled()) return null;

  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const key = header.slice(7).trim();
  if (!isApiKey(key)) return null;

  const prefix = extractApiKeyPrefix(key);
  if (!prefix) return null;

  const db = getDb();

  // Indexed fast path: hit only the rows whose prefix matches the
  // incoming key, plus the legacy '' bucket where pre-0006 servers
  // sit until their next key rotation.
  const candidates = await db
    .select({
      id: schema.servers.id,
      name: schema.servers.name,
      apiKeyHash: schema.servers.apiKeyHash,
    })
    .from(schema.servers)
    .where(
      or(
        eq(schema.servers.apiKeyPrefix, prefix),
        eq(schema.servers.apiKeyPrefix, ''),
      ),
    );

  for (const row of candidates) {
    if (await verifySecret(key, row.apiKeyHash)) {
      // Fire-and-forget lastSeenAt refresh — auth answer is already
      // determined, a transient DB blip on the timestamp update
      // shouldn't 401 the plugin.
      db.update(schema.servers)
        .set({ lastSeenAt: new Date() })
        .where(eq(schema.servers.id, row.id))
        .catch(() => {});
      return { id: row.id, name: row.name };
    }
  }
  return null;
}
