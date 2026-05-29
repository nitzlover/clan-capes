package dev.clancapes.events;

import com.google.gson.JsonObject;
import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.api.dto.EventConfigDto;
import org.bukkit.Bukkit;
import org.bukkit.Color;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.HandlerList;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayList;
import java.util.List;

/**
 * King-of-the-Hill event runtime.
 *
 * <p>The classic mode from events.txt: a fixed zone near spawn, a
 * custom loot structure with a chest at the centre, last clan
 * standing inside the zone wins and collects.
 *
 * <pre>
 *   PREP    (prepMinutes)   announce the hill; players converge.
 *   ACTIVE  (durationMin)   PvP; enrolled by entering the zone; the
 *                           sole surviving clan wins. Boundary seals
 *                           so outsiders can't crash the contest.
 *   COLLECT (lootMinutes)   winner has the hill to loot the chest.
 *   ENDED                   cleanup.
 * </pre>
 *
 * <p>Shares every primitive with {@link AirdropEvent} (Zone,
 * BarrierRenderer, ParticipantTracker, EventScoreboard, EventChat,
 * EventBoundary, LootSpawner). The two events still carry their own
 * tick loops — when a third variant lands these should collapse into
 * an abstract GameEvent base, but two is below the extraction
 * threshold and AirdropEvent is already in production.
 */
public final class KingOfHillEvent implements Listener, RunningEvent {

    private enum Stage { PREP, ACTIVE, COLLECT, ENDED }

    private final ClanCapesPlugin plugin;
    private final World world;
    private final Zone zone;
    private final int prepSec;
    private final int activeSec;
    private final int collectSec;
    private final int reentryMs;

    private final ParticipantTracker tracker;
    private final EventScoreboard scoreboard;
    private BarrierRenderer barrier;

    private Stage stage = Stage.PREP;
    private long stageStartMs;
    private BukkitTask tickTask;
    private boolean finished;
    private Integer eventId;
    private String winnerTag;
    private final int hillX;
    private final int hillZ;

    public KingOfHillEvent(ClanCapesPlugin plugin, World world, EventConfigDto cfg) {
        this.plugin = plugin;
        this.world = world;
        this.tracker = new ParticipantTracker(plugin);
        this.scoreboard = new EventScoreboard();

        JsonObject p = cfg.payload;
        // Same fast-mode hook as AirdropEvent — when config.yml's
        // test block is on, swap the whole timing budget for the
        // test.*-seconds operator dry-run values.
        boolean testFast = plugin.getConfig().getBoolean("test.enabled", false)
                && plugin.getConfig().getBoolean("test.fast-mode", false);
        if (testFast) {
            this.prepSec = plugin.getConfig().getInt("test.prep-seconds", 15);
            this.collectSec = plugin.getConfig().getInt("test.collect-seconds", 15);
            this.activeSec = plugin.getConfig().getInt("test.active-seconds", 60);
        } else {
            this.prepSec = minutesToSec(p, "prepMinutes", 3);
            int collectMin = (p != null && p.has("lootCollectionMinutes"))
                    ? p.get("lootCollectionMinutes").getAsInt() : 3;
            this.collectSec = collectMin * 60;
            int activeMin = Math.max(1,
                    cfg.durationMinutes - minutesOf(p, "prepMinutes", 3) - collectMin);
            this.activeSec = activeMin * 60;
        }
        int reentrySec = (p != null && p.has("crashCommebackSeconds"))
                ? p.get("crashCommebackSeconds").getAsInt() : 30;
        this.reentryMs = reentrySec * 1000;

        // Hill sits at world spawn — the "fixed zone near spawn" from
        // events.txt — with the configured contest radius.
        // test.zone-radius-blocks > 0 overrides the contest radius
        // for tractable dry-runs.
        int contestRadius = cfg.radiusBlocks;
        if (plugin.getConfig().getBoolean("test.enabled", false)) {
            int radiusOverride = plugin.getConfig().getInt("test.zone-radius-blocks", 0);
            if (radiusOverride > 0) contestRadius = radiusOverride;
        }
        Location spawn = world.getSpawnLocation();
        this.hillX = spawn.getBlockX();
        this.hillZ = spawn.getBlockZ();
        this.zone = new Zone(world, hillX, hillZ, contestRadius);
    }

    private static int minutesOf(JsonObject p, String key, int def) {
        return (p != null && p.has(key)) ? p.get(key).getAsInt() : def;
    }

    private static int minutesToSec(JsonObject p, String key, int defMin) {
        return minutesOf(p, key, defMin) * 60;
    }

    @Override
    public boolean isFinished() {
        return finished;
    }

    public void start() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
        barrier = new BarrierRenderer(plugin, zone, Color.fromRGB(90, 200, 255));
        barrier.start();
        EventBoundary.open(zone);
        buildHill();
        enterStage(Stage.PREP);
        postStart();
        tickTask = Bukkit.getScheduler().runTaskTimer(plugin, this::tick, 20L, 20L);
    }

    /**
     * Place a simple marker structure at the hill centre: a short
     * beacon-glass pillar so the objective is visible from range, with
     * the loot chest seated on top. A full NBT structure template is a
     * later pass (events.txt "custom structure") — this keeps KotH
     * playable without shipping a datapack.
     */
    private void buildHill() {
        int surface = world.getHighestBlockYAt(hillX, hillZ);
        for (int dy = 1; dy <= 4; dy++) {
            world.getBlockAt(hillX, surface + dy, hillZ).setType(Material.GLOWSTONE);
        }
        // Loot chest one block above the pillar top.
        LootSpawner.spawn(world, hillX, hillZ);
    }

    private void enterStage(Stage s) {
        stage = s;
        stageStartMs = System.currentTimeMillis();
        switch (s) {
            case PREP -> EventChat.announceStage("KING OF THE HILL",
                    "Hill at spawn (" + hillX + ", " + hillZ + ") — "
                            + (prepSec / 60) + "m to converge");
            case ACTIVE -> {
                EventBoundary.seal(tracker.all().keySet());
                EventChat.announceStage("HILL CONTESTED", "Last clan standing wins!");
            }
            case COLLECT -> {
                EventBoundary.seal(tracker.all().keySet());
                EventChat.announceStage("HILL CLAIMED",
                        "[" + winnerTag + "] — " + (collectSec / 60) + "m to loot");
            }
            case ENDED -> { /* finish() handles teardown */ }
        }
    }

    private void tick() {
        if (finished) return;
        long now = System.currentTimeMillis();
        long elapsed = (now - stageStartMs) / 1000;

        switch (stage) {
            case PREP -> {
                // Enroll early arrivals so a clan that gathers during
                // prep is counted the instant the hill goes live.
                enrollAndTrack(now);
                if (elapsed >= prepSec) enterStage(Stage.ACTIVE);
            }
            case ACTIVE -> {
                enrollAndTrack(now);
                Integer winner = checkWinner();
                if (winner != null) {
                    declareWinner(winner);
                } else if (elapsed >= activeSec) {
                    // Timed out with multiple clans alive — award to the
                    // clan with the most members still in the zone, or
                    // cancel if there's a genuine tie / nobody left.
                    Integer lead = leadingClan();
                    if (lead != null) {
                        declareWinner(lead);
                    } else {
                        EventChat.announceCancelled("no clan held the hill");
                        finish();
                    }
                }
            }
            case COLLECT -> {
                if (elapsed >= collectSec) finish();
            }
            case ENDED -> { /* no-op */ }
        }

        renderScoreboard(elapsed);
    }

    private void enrollAndTrack(long now) {
        for (Player p : world.getPlayers()) {
            boolean inside = zone.contains(p.getLocation());
            if (inside) {
                tracker.enroll(p);
                tracker.markEnteredZone(p.getUniqueId());
            } else if (tracker.isParticipant(p.getUniqueId())) {
                tracker.markLeftZone(p.getUniqueId(), now);
            }
        }
        tracker.expireAbsent(now, reentryMs);
    }

    private Integer checkWinner() {
        if (tracker.participantCount() == 0) return null;
        var sample = tracker.soleSurvivingClanSample();
        if (sample == null) return null;
        long distinctClans = tracker.all().values().stream()
                .map(e -> e.clanId).distinct().count();
        if (distinctClans < 2) return null;
        return sample.clanId;
    }

    /** Clan with the most non-eliminated members (tiebreak on timeout). */
    private Integer leadingClan() {
        java.util.Map<Integer, Integer> alive = new java.util.HashMap<>();
        for (var e : tracker.all().values()) {
            if (!e.eliminated) alive.merge(e.clanId, 1, Integer::sum);
        }
        Integer best = null;
        int bestN = 0;
        boolean tie = false;
        for (var entry : alive.entrySet()) {
            if (entry.getValue() > bestN) {
                bestN = entry.getValue();
                best = entry.getKey();
                tie = false;
            } else if (entry.getValue() == bestN) {
                tie = true;
            }
        }
        return tie ? null : best;
    }

    private void declareWinner(int clanId) {
        var sample = tracker.all().values().stream()
                .filter(e -> e.clanId == clanId).findFirst().orElse(null);
        winnerTag = sample != null ? sample.clanTag : "?";
        EventChat.announceWinner(winnerTag);
        postEnd(clanId);
        enterStage(Stage.COLLECT);
    }

    private void renderScoreboard(long elapsed) {
        List<String> lines = new ArrayList<>();
        lines.add("§bKing of the Hill");
        lines.add("§7Stage: §f" + stageLabel());
        long remain = stageRemaining(elapsed);
        if (remain >= 0) lines.add("§7Time: §f" + (remain / 60) + "m " + (remain % 60) + "s");
        lines.add("");
        lines.add("§7On hill: §f" + tracker.participantCount());
        lines.add("§7Clans alive: §f" + tracker.aliveClanIds().size());
        if (winnerTag != null) {
            lines.add("");
            lines.add("§aWinner: §f" + winnerTag);
        }
        scoreboard.render(lines);
    }

    @Override
    public String stageLabel() {
        return switch (stage) {
            case PREP -> "Converge";
            case ACTIVE -> "Contest";
            case COLLECT -> "Loot";
            case ENDED -> "Ended";
        };
    }

    @Override
    public String type() { return "koth"; }

    @Override
    public void cancel() {
        if (finished) return;
        EventChat.announceCancelled("operator stopped the event");
        plugin.getLogger().info("[koth] cancelled by operator at stage " + stageLabel());
        finish();
    }

    private long stageRemaining(long elapsed) {
        return switch (stage) {
            case PREP -> Math.max(0, prepSec - elapsed);
            case ACTIVE -> Math.max(0, activeSec - elapsed);
            case COLLECT -> Math.max(0, collectSec - elapsed);
            default -> -1;
        };
    }

    @EventHandler
    public void onDeath(PlayerDeathEvent e) {
        if (stage != Stage.ACTIVE) return;
        Player victim = e.getEntity();
        if (!tracker.isParticipant(victim.getUniqueId())) return;
        var dead = tracker.recordDeath(victim.getUniqueId());
        Player killer = victim.getKiller();
        if (killer != null && tracker.isParticipant(killer.getUniqueId())) {
            tracker.recordKill(killer.getUniqueId());
            postKill(killer.getUniqueId().toString(), victim.getUniqueId().toString());
        }
        if (dead != null) {
            EventChat.broadcast("§c" + victim.getName() + " [" + dead.clanTag
                    + "] knocked off the hill.");
        }
    }

    private void finish() {
        if (finished) return;
        finished = true;
        stage = Stage.ENDED;
        if (tickTask != null) tickTask.cancel();
        if (barrier != null) barrier.stop();
        EventBoundary.clear();
        scoreboard.clear();
        HandlerList.unregisterAll(this);
    }

    // ──────────────────────── panel persistence ────────────────────────

    private void postStart() {
        if (!plugin.getPanelClient().isConfigured()) return;
        JsonObject body = new JsonObject();
        body.addProperty("type", "koth");
        body.addProperty("zoneCenterX", zone.centerX());
        body.addProperty("zoneCenterZ", zone.centerZ());
        body.addProperty("zoneRadius", zone.radius());
        plugin.getPanelClient().postEventStart(body)
                .thenAccept(json -> {
                    if (json != null && json.has("id")) eventId = json.get("id").getAsInt();
                })
                .exceptionally(ex -> {
                    plugin.getLogger().warning("[koth] start POST failed: " + ex.getMessage());
                    return null;
                });
    }

    private void postEnd(int winnerClanId) {
        if (!plugin.getPanelClient().isConfigured() || eventId == null) return;
        JsonObject body = new JsonObject();
        body.addProperty("eventId", eventId);
        body.addProperty("winnerClanId", winnerClanId);
        JsonObject parts = new JsonObject();
        for (var e : tracker.all().values()) {
            JsonObject pe = new JsonObject();
            pe.addProperty("clanId", e.clanId);
            pe.addProperty("kills", e.kills);
            pe.addProperty("deaths", e.deaths);
            pe.addProperty("eliminated", e.eliminated);
            parts.add(e.uuid.toString(), pe);
        }
        body.add("participants", parts);
        plugin.getPanelClient().postEventEnd(body)
                .exceptionally(ex -> {
                    plugin.getLogger().warning("[koth] end POST failed: " + ex.getMessage());
                    return null;
                });
    }

    private void postKill(String killerUuid, String victimUuid) {
        if (!plugin.getPanelClient().isConfigured() || eventId == null) return;
        JsonObject body = new JsonObject();
        body.addProperty("eventId", eventId);
        body.addProperty("killerUuid", killerUuid);
        body.addProperty("victimUuid", victimUuid);
        plugin.getPanelClient().postEventKill(body).exceptionally(ex -> null);
    }
}
