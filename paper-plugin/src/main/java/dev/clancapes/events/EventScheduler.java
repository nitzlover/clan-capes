package dev.clancapes.events;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.api.dto.ClanDto;
import dev.clancapes.api.dto.EventConfigDto;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitTask;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Logger;

/**
 * Cron-like scheduler for the PvP events.
 *
 * <p>Walks the {@link
 * dev.clancapes.repo.EventConfigRepository} every {@link
 * #CHECK_INTERVAL_TICKS} ticks (every 30 s by default). For each
 * enabled event type whose last firing was longer ago than
 * {@code intervalMinutes}, checks the online-clans threshold and —
 * when met — kicks off the variant's runtime. Phase 5.2 ships only
 * the decision plumbing (event start is logged but not yet
 * scheduled); phase 5.3 plugs in AirdropEvent + KingOfHillEvent.
 *
 * <p>Online threshold lifted from events.txt: at least
 * {@code minClansOnline} distinct clans, each with at least
 * {@code minPlayersPerClanOnline} members online. Both knobs live
 * in {@code config.payload} so an operator can relax them on a
 * small-population server.
 */
public final class EventScheduler {

    private static final long CHECK_INTERVAL_TICKS = 20L * 30L; // 30 s

    private final ClanCapesPlugin plugin;
    private final Logger log;
    /** Per-type wall-clock timestamp (ms) of the last attempted firing. */
    private final Map<String, Long> lastFired = new HashMap<>();
    private BukkitTask task;

    public EventScheduler(ClanCapesPlugin plugin) {
        this.plugin = plugin;
        this.log = plugin.getLogger();
    }

    public synchronized void start() {
        if (task != null) return;
        task = Bukkit.getScheduler().runTaskTimer(plugin, this::tick,
                CHECK_INTERVAL_TICKS, CHECK_INTERVAL_TICKS);
    }

    public synchronized void stop() {
        if (task != null) {
            task.cancel();
            task = null;
        }
    }

    private void tick() {
        var repo = plugin.getEventConfigRepository();
        if (repo == null) return;
        long now = System.currentTimeMillis();
        for (EventConfigDto cfg : repo.all()) {
            if (cfg == null || !cfg.enabled) continue;
            long elapsedMs = now - lastFired.getOrDefault(cfg.type, 0L);
            long intervalMs = (long) cfg.intervalMinutes * 60_000L;
            if (elapsedMs < intervalMs) continue;
            if (!onlineThresholdMet(cfg)) continue;
            lastFired.put(cfg.type, now);
            tryFire(cfg);
        }
    }

    private boolean onlineThresholdMet(EventConfigDto cfg) {
        int minClans = 2;
        int minPerClan = 2;
        if (cfg.payload != null) {
            if (cfg.payload.has("minClansOnline")) {
                minClans = cfg.payload.get("minClansOnline").getAsInt();
            }
            if (cfg.payload.has("minPlayersPerClanOnline")) {
                minPerClan = cfg.payload.get("minPlayersPerClanOnline").getAsInt();
            }
        }
        // Per-clan online count from the live Bukkit roster joined
        // against the clan repo snapshot.
        Map<Integer, Integer> onlinePerClan = new HashMap<>();
        Set<UUID> seen = new HashSet<>();
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!seen.add(p.getUniqueId())) continue;
            ClanDto clan = plugin.getClanRepository().getByPlayer(p.getUniqueId()).orElse(null);
            if (clan == null) continue;
            onlinePerClan.merge(clan.id, 1, Integer::sum);
        }
        int qualifying = 0;
        for (int count : onlinePerClan.values()) {
            if (count >= minPerClan) qualifying++;
        }
        return qualifying >= minClans;
    }

    /**
     * Phase 5.2: logs the decision. Phase 5.3 will dispatch to the
     * variant-specific runtime (AirdropEvent / KingOfHillEvent).
     */
    private void tryFire(EventConfigDto cfg) {
        log.info("[event-scheduler] would fire type=" + cfg.type
                + " (interval=" + cfg.intervalMinutes + "m"
                + " duration=" + cfg.durationMinutes + "m"
                + " radius=" + cfg.radiusBlocks + ")");
        // TODO phase 5.3 — instantiate the variant Event and start it.
    }
}
