/**
 * Per-server "who's online right now" cache.
 *
 * Heartbeats from the plugin land here with the list of currently
 * connected player UUIDs; dashboard reads pull the snapshot back
 * without round-tripping to the game server.
 *
 * Single-instance, in-memory by design — Railway runs the panel on a
 * single Node process so a module-local map is sufficient and saves
 * us a Redis round-trip on every dashboard refresh. If the panel
 * ever scales out across replicas this needs to move to Redis or a
 * Postgres LISTEN/NOTIFY channel.
 *
 * Snapshots expire after STALE_AFTER_MS so a crashed plugin doesn't
 * pin a stale roster forever — past that cutoff `getOnlineUuids`
 * returns `null` and the UI is expected to render an "unknown" state
 * (grey dot) rather than a confidently-wrong "online" badge.
 */

/** How long a snapshot stays trusted after the last heartbeat. */
const STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes — 2x the 5-min heartbeat cadence

type Snapshot = {
  uuids: Set<string>;
  updatedAt: number;
};

const snapshots = new Map<number, Snapshot>();

/** Replace the snapshot for a server (called from /api/plugin/heartbeat). */
export function setOnlineUuids(serverId: number, uuids: Iterable<string>) {
  const set = new Set<string>();
  for (const raw of uuids) {
    const norm = String(raw).toLowerCase();
    // Cheap UUID-with-dashes shape check — defensive against a
    // misbehaving plugin sending arbitrary strings into the cache.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(norm)) {
      set.add(norm);
    }
  }
  snapshots.set(serverId, { uuids: set, updatedAt: Date.now() });
}

/**
 * Returns the current online roster, or `null` if the snapshot is
 * stale / missing. The UI should treat null as "don't know" rather
 * than "nobody online".
 */
export function getOnlineUuids(serverId: number): {
  uuids: string[];
  updatedAt: number;
} | null {
  const snap = snapshots.get(serverId);
  if (!snap) return null;
  if (Date.now() - snap.updatedAt > STALE_AFTER_MS) return null;
  return { uuids: Array.from(snap.uuids), updatedAt: snap.updatedAt };
}

/** Used by tests / dev tooling to reset the cache between scenarios. */
export function clearOnlineCache() {
  snapshots.clear();
}
