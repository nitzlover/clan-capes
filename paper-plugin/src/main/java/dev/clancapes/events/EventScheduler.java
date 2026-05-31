package dev.clancapes.events;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.api.dto.ClanDto;
import dev.clancapes.api.dto.EventConfigDto;
import org.bukkit.Bukkit;
import org.bukkit.World;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.logging.Logger;

/**
 * Cron-like scheduler for the PvP events.
 *
 * <p>Walks the {@link
 * dev.clancapes.repo.EventConfigRepository} every {@link
 * #CHECK_INTERVAL_TICKS} ticks (every 30 s by default). For each
 * enabled event type whose last firing was longer ago than
 * {@code intervalMinutes}, checks the online-clans threshold and —
 * when met — kicks off the variant's runtime.
 *
 * <p>Online threshold lifted from events.txt: at least
 * {@code minClansOnline} distinct clans, each with at least
 * {@code minPlayersPerClanOnline} members online. Both knobs live
 * in {@code config.payload} so an operator can relax them on a
 * small-population server.
 *
 * <p>Operator overrides via config.yml {@code test:} block let a
 * dry-run skip the cooldown / threshold checks, and the
 * {@code /clancape event start|stop|status|reset} commands drive
 * the scheduler directly (see ClanCapeCommand).
 */
public final class EventScheduler {

    private static final long CHECK_INTERVAL_TICKS = 20L * 30L; // 30 s

    private final ClanCapesPlugin plugin;
    private final Logger log;
    /** Per-type wall-clock timestamp (ms) of the last attempted firing. */
    private final Map<String, Long> lastFired = new HashMap<>();
    private BukkitTask task;
    /** The single in-flight event, if any. One event runs at a time. */
    private RunningEvent activeEvent;

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
        // 1.0.9: cancel any in-flight event so a /clancape reload (which
        // bounces the scheduler) can't leave an orphan AirdropEvent /
        // KingOfHillEvent ticking with its barrier renderer, scoreboard,
        // and PvP listener still wired up.
        if (activeEvent != null && !activeEvent.isFinished()) {
            try { activeEvent.cancel(); } catch (Throwable ignored) {}
        }
        activeEvent = null;
    }

    private boolean testEnabled() {
        return plugin.getConfig().getBoolean("test.enabled", false);
    }

    private boolean debug() {
        return plugin.getConfig().getBoolean("logging.debug", false);
    }

    private void tick() {
        // Reap a finished event before considering new firings — one
        // event at a time keeps the zone / scoreboard unambiguous.
        if (activeEvent != null && activeEvent.isFinished()) {
            if (debug()) log.info("[event-scheduler] reaping finished " + activeEvent.type());
            activeEvent = null;
        }
        if (activeEvent != null) {
            if (debug()) log.info("[event-scheduler] tick — active " + activeEvent.type()
                    + " @ " + activeEvent.stageLabel() + "; skipping new firings");
            return;
        }

        var repo = plugin.getEventConfigRepository();
        if (repo == null) {
            if (debug()) log.info("[event-scheduler] tick — repo null; idle");
            return;
        }
        long now = System.currentTimeMillis();
        boolean bypassCooldown = testEnabled()
                && plugin.getConfig().getBoolean("test.bypass-cooldown", false);
        boolean bypassThreshold = testEnabled()
                && plugin.getConfig().getBoolean("test.bypass-online-threshold", false);

        List<EventConfigDto> all = repo.all();
        if (debug()) log.info("[event-scheduler] tick — " + all.size() + " config(s); "
                + "bypassCooldown=" + bypassCooldown + " bypassThreshold=" + bypassThreshold);

        for (EventConfigDto cfg : all) {
            if (cfg == null || !cfg.enabled) {
                if (debug()) log.info("[event-scheduler]   skip "
                        + (cfg == null ? "null" : cfg.type) + " — disabled");
                continue;
            }
            long elapsedMs = now - lastFired.getOrDefault(cfg.type, 0L);
            // Clamp negatives so a misconfigured intervalMinutes = -1
            // (negative interval flips the comparison and would fire
            // every tick) is treated as "no cooldown".
            long intervalMs = (long) Math.max(0, cfg.intervalMinutes) * 60_000L;
            if (!bypassCooldown && elapsedMs < intervalMs) {
                if (debug()) log.info("[event-scheduler]   skip " + cfg.type
                        + " — cooldown " + ((intervalMs - elapsedMs) / 1000) + "s left");
                continue;
            }
            if (!bypassThreshold && !onlineThresholdMet(cfg)) {
                if (debug()) log.info("[event-scheduler]   skip " + cfg.type
                        + " — online threshold not met");
                continue;
            }
            // Only consume the cooldown if the launch actually succeeded
            // — otherwise a transient launch failure (no overworld,
            //   unimplemented type) burns the whole interval before the
            //   operator can retry.
            if (launch(cfg)) {
                lastFired.put(cfg.type, now);
                return; // one launch per tick
            }
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
        if (debug()) log.info("[event-scheduler]   threshold(" + cfg.type + ") need clans>="
                + minClans + " w/players>=" + minPerClan
                + "; got qualifying=" + qualifying + " of " + onlinePerClan.size() + " clans online");
        return qualifying >= minClans;
    }

    /**
     * Dispatch to the variant runtime. Returns true if an event was
     * actually launched (so the caller stops scanning this tick).
     */
    private boolean launch(EventConfigDto cfg) {
        World world = pickEventWorld();
        if (world == null) {
            log.warning("[event-scheduler] no overworld found; skipping " + cfg.type);
            return false;
        }
        if ("airdrop".equalsIgnoreCase(cfg.type)) {
            log.info("[event-scheduler] launching airdrop (radius="
                    + cfg.radiusBlocks + ")");
            AirdropEvent ev = new AirdropEvent(plugin, world, cfg);
            ev.start();
            activeEvent = ev;
            return true;
        }
        if ("koth".equalsIgnoreCase(cfg.type)) {
            log.info("[event-scheduler] launching koth (radius="
                    + cfg.radiusBlocks + ")");
            KingOfHillEvent ev = new KingOfHillEvent(plugin, world, cfg);
            ev.start();
            activeEvent = ev;
            return true;
        }
        log.info("[event-scheduler] type " + cfg.type + " not yet implemented");
        return false;
    }

    /** First NORMAL-environment world (the overworld). */
    private World pickEventWorld() {
        for (World w : Bukkit.getWorlds()) {
            if (w.getEnvironment() == World.Environment.NORMAL) return w;
        }
        return Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0);
    }

    // ─────────── operator-driven API (used by /clancape event …) ───────────

    /** Active event or null. */
    public synchronized RunningEvent getActive() {
        return activeEvent;
    }

    /**
     * Force-launch an event ignoring cooldown + threshold guards.
     * If an event is already running, returns null and logs a warning —
     * the operator must {@link #stopActive()} first.
     *
     * @param type "airdrop", "koth", or "random" (random picks an enabled type)
     * @return human-readable status message
     */
    public synchronized String forceStart(String type) {
        if (activeEvent != null && !activeEvent.isFinished()) {
            return "an event is already running (" + activeEvent.type()
                    + " @ " + activeEvent.stageLabel() + "); /clancape event stop first";
        }
        var repo = plugin.getEventConfigRepository();
        if (repo == null) return "event-config repo not ready";
        List<EventConfigDto> configs = repo.all();
        if (configs.isEmpty()) return "no event configs loaded from panel; /clancape reload";

        EventConfigDto cfg = null;
        if ("random".equalsIgnoreCase(type)) {
            List<EventConfigDto> enabled = new ArrayList<>();
            for (EventConfigDto c : configs) if (c != null && c.enabled) enabled.add(c);
            if (enabled.isEmpty()) return "no enabled event configs";
            cfg = enabled.get(ThreadLocalRandom.current().nextInt(enabled.size()));
        } else {
            for (EventConfigDto c : configs) {
                if (c != null && type.equalsIgnoreCase(c.type)) { cfg = c; break; }
            }
            if (cfg == null) return "unknown event type '" + type
                    + "'; known: " + configs.stream().map(c -> c.type).toList();
        }
        log.info("[event-scheduler] FORCE-START " + cfg.type + " (operator)");
        boolean ok = launch(cfg);
        if (ok) {
            lastFired.put(cfg.type, System.currentTimeMillis());
            return "started " + cfg.type;
        }
        return "launch failed for " + cfg.type + " (see server log)";
    }

    /** Operator-initiated abort of the active event. No-op if none. */
    public synchronized String stopActive() {
        if (activeEvent == null || activeEvent.isFinished()) {
            return "no active event";
        }
        String label = activeEvent.type() + " @ " + activeEvent.stageLabel();
        activeEvent.cancel();
        activeEvent = null;
        log.info("[event-scheduler] STOPPED " + label + " (operator)");
        return "stopped " + label;
    }

    /** Clear the per-type cooldown map so the next regular tick can fire. */
    public synchronized String clearCooldowns() {
        int n = lastFired.size();
        lastFired.clear();
        log.info("[event-scheduler] cooldowns cleared (" + n + " entries)");
        return "cleared " + n + " cooldown entr" + (n == 1 ? "y" : "ies");
    }

    /** Snapshot for /clancape event status. */
    public synchronized String describeStatus() {
        StringBuilder sb = new StringBuilder();
        if (activeEvent == null || activeEvent.isFinished()) {
            sb.append("active: none\n");
        } else {
            sb.append("active: ").append(activeEvent.type())
                    .append(" @ ").append(activeEvent.stageLabel()).append("\n");
        }
        long now = System.currentTimeMillis();
        var repo = plugin.getEventConfigRepository();
        if (repo == null) { sb.append("repo: unavailable"); return sb.toString(); }
        for (EventConfigDto cfg : repo.all()) {
            if (cfg == null) continue;
            long elapsed = now - lastFired.getOrDefault(cfg.type, 0L);
            long intervalMs = (long) cfg.intervalMinutes * 60_000L;
            long remainSec = Math.max(0, (intervalMs - elapsed) / 1000);
            sb.append(cfg.type)
                    .append(": enabled=").append(cfg.enabled)
                    .append(", interval=").append(cfg.intervalMinutes).append("m")
                    .append(", cooldown=").append(remainSec).append("s")
                    .append(", radius=").append(cfg.radiusBlocks).append("\n");
        }
        sb.append("test.enabled=").append(testEnabled())
                .append(", bypassCooldown=").append(plugin.getConfig()
                        .getBoolean("test.bypass-cooldown", false))
                .append(", bypassThreshold=").append(plugin.getConfig()
                        .getBoolean("test.bypass-online-threshold", false))
                .append(", fastMode=").append(plugin.getConfig()
                        .getBoolean("test.fast-mode", false));
        return sb.toString();
    }
}
