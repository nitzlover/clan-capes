package dev.clancapes.clan;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.panel.PanelClient;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Level;

/**
 * Per-player stats cache backing the {@code %clancapes_kills%},
 * {@code %clancapes_deaths%}, and {@code %clancapes_kd%} placeholders.
 *
 * Reads are synchronous + non-blocking — they return whatever's in
 * the local map (defaulting to zero) and kick off an async refresh
 * on cache miss. The first miss therefore renders as 0 / 0 / 0.00
 * and the next render (a few hundred ms later in a placeholder
 * heartbeat) picks up the real number.
 *
 * TTL is short (~30 s) because the kill listener proactively
 * invalidates rows for participants in fresh kills, so the TTL only
 * matters for catching changes the listener didn't make (panel
 * admin edit, season reset bump).
 */
public final class StatsCache {
    /** TTL after which a cache entry is refetched on next read. */
    private static final long TTL_MS = 30_000L;

    private final ClanCapesPlugin plugin;

    /** UUID → cached entry. Wrapped in {@link Entry} so we can stash an "is fetching" guard. */
    private final ConcurrentHashMap<UUID, Entry> entries = new ConcurrentHashMap<>();

    /**
     * Per-UUID atomic gate. The first reader that finds a stale or
     * missing entry flips its flag to true and owns the refresh; every
     * other concurrent reader sees the flag set and skips scheduling.
     * Previous design used a comment-only no-op which left the cache
     * vulnerable to a thundering-herd: 100 placeholder renders on the
     * same tick fired 100 concurrent panel fetches.
     */
    private final ConcurrentHashMap<UUID, AtomicBoolean> refreshing = new ConcurrentHashMap<>();

    public StatsCache(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    /** Non-blocking read. Returns the cached row, schedules a refetch when stale. */
    public Entry get(UUID uuid) {
        Entry cur = entries.get(uuid);
        long now = System.currentTimeMillis();
        if (cur == null || now - cur.fetchedAt > TTL_MS) {
            scheduleRefresh(uuid);
        }
        return cur != null ? cur : Entry.EMPTY;
    }

    /** Force an entry refetch — called by PvpKillListener after a kill. */
    public void invalidate(UUID uuid) {
        scheduleRefresh(uuid);
    }

    private void scheduleRefresh(UUID uuid) {
        // Atomically claim ownership of the refresh. If another reader
        // already CAS'd the flag from false→true, bail — they own the
        // in-flight fetch and we'd just duplicate it.
        AtomicBoolean gate = refreshing.computeIfAbsent(uuid, k -> new AtomicBoolean(false));
        if (!gate.compareAndSet(false, true)) {
            return;
        }
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                String panelUrl = plugin.getPluginConfig().getPanelUrl();
                String apiKey = plugin.getPluginConfig().getPanelApiKey();
                if (panelUrl == null || panelUrl.isBlank() || apiKey == null || apiKey.isBlank()) {
                    return;
                }
                try {
                    Map<String, Object> raw = plugin.getPanelClient()
                            .fetchPlayerStats(panelUrl, apiKey, uuid);
                    Map<?, ?> season = (Map<?, ?>) raw.get("season");
                    Map<?, ?> lifetime = (Map<?, ?>) raw.get("lifetime");
                    int sk = season == null ? 0 : numberAsInt(season.get("kills"));
                    int sd = season == null ? 0 : numberAsInt(season.get("deaths"));
                    int lk = lifetime == null ? 0 : numberAsInt(lifetime.get("kills"));
                    int ld = lifetime == null ? 0 : numberAsInt(lifetime.get("deaths"));
                    entries.put(uuid,
                            new Entry(sk, sd, lk, ld, false, System.currentTimeMillis()));
                } catch (PanelClient.PanelException e) {
                    plugin.getLogger().log(Level.FINE,
                            "panel stats fetch failed for " + uuid + ": " + e.getMessage());
                }
            } finally {
                // Release the gate even if fetch failed so the next
                // reader can retry. Without the finally, a panel outage
                // would lock the UUID out of refreshes for the rest of
                // the JVM lifetime.
                gate.set(false);
            }
        });
    }

    private static int numberAsInt(Object o) {
        if (o instanceof Number n) return n.intValue();
        if (o instanceof String s) {
            try { return Integer.parseInt(s); }
            catch (NumberFormatException ignored) { return 0; }
        }
        return 0;
    }

    /**
     * Cached row. {@code refreshing} flags an in-flight fetch so a
     * second concurrent read doesn't spam the panel. Public Optional
     * accessors hide that internal field from placeholder code.
     */
    public static final class Entry {
        public static final Entry EMPTY = new Entry(0, 0, 0, 0, false, 0L);

        public final int seasonKills;
        public final int seasonDeaths;
        public final int lifetimeKills;
        public final int lifetimeDeaths;
        final boolean refreshing;
        final long fetchedAt;

        Entry(int sk, int sd, int lk, int ld, boolean refreshing, long fetchedAt) {
            this.seasonKills = sk;
            this.seasonDeaths = sd;
            this.lifetimeKills = lk;
            this.lifetimeDeaths = ld;
            this.refreshing = refreshing;
            this.fetchedAt = fetchedAt;
        }

        public double seasonKd() {
            return seasonDeaths > 0
                    ? (double) seasonKills / seasonDeaths
                    : seasonKills;
        }

        public double lifetimeKd() {
            return lifetimeDeaths > 0
                    ? (double) lifetimeKills / lifetimeDeaths
                    : lifetimeKills;
        }

        public Optional<Entry> asOptional() {
            return this == EMPTY ? Optional.empty() : Optional.of(this);
        }
    }
}
