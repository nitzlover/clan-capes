/**
 * Bearer-API-key auth for plugin → panel requests.
 *
 * Every endpoint that the Paper plugin hits — heartbeat, kill events,
 * clan CRUD sync — calls {@link requirePluginAuth} first. The function
 * pulls the `Authorization: Bearer ck_live_<…>` header off the request,
 * scans every registered server row, bcrypt-compares the plaintext key
 * against each stored hash, and on a hit refreshes the row's
 * `last_seen_at` so the admin UI can show a live-status indicator
 * without polling each plugin separately.
 *
 * Linear scan over `servers` is fine for the foreseeable future — even
 * an active panel hosting a hundred game servers fits in a single
 * round trip and ~100 bcrypt compares (~30 ms total). When this stops
 * being cheap, the right answer is to store a fast prefix index of the
 * api-key's first 12 chars on the row and narrow the scan to that
 * prefix.
 */

import { eq } from 'drizzle-orm';
import { getDb, dbEnabled, schema } from '@/lib/server/db';
import { isApiKey, verifySecret } from '@/lib/server/api-key';

export type ServerContext = {
  id: number;
  name: string;
};

/**
 * Verify the Bearer key in `req` against every server's stored hash.
 * Returns the matched ServerContext on success, null otherwise. Refreshes
 * `servers.last_seen_at` as a side effect when a match is found.
 *
 * Callers do `const ctx = await requirePluginAuth(req); if (!ctx) return 401`.
 */
export async function requirePluginAuth(req: Request): Promise<ServerContext | null> {
  if (!dbEnabled()) return null;

  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const key = header.slice(7).trim();
  if (!isApiKey(key)) return null;

  const db = getDb();
  const rows = await db
    .select({
      id: schema.servers.id,
      name: schema.servers.name,
      apiKeyHash: schema.servers.apiKeyHash,
    })
    .from(schema.servers);

  for (const row of rows) {
    if (await verifySecret(key, row.apiKeyHash)) {
      // Fire-and-forget lastSeenAt refresh. Failures here are non-fatal
      // (the caller has the actual auth answer they need); we don't
      // want a transient DB blip to 401 the plugin.
      db.update(schema.servers)
        .set({ lastSeenAt: new Date() })
        .where(eq(schema.servers.id, row.id))
        .catch(() => {});
      return { id: row.id, name: row.name };
    }
  }
  return null;
}
