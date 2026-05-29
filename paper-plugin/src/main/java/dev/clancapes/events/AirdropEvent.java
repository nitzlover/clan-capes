package dev.clancapes.events;

import com.google.gson.JsonObject;
import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.api.dto.EventConfigDto;
import org.bukkit.Bukkit;
import org.bukkit.Color;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.HandlerList;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Airdrop event runtime — the three-stage state machine from
 * events.txt.
 *
 * <pre>
 *   PREP    (prepMinutes)    announce zone centre; players travel.
 *   LANDING (landingMinutes) drop the loot chest at a random point
 *                            inside the zone, PvP opens, players who
 *                            enter the zone are enrolled.
 *   FINALE                   reached when only one clan remains alive
 *                            OR the landing timer expires; the sole
 *                            surviving clan wins.
 *   COLLECT (lootMinutes)    winner has the zone to loot the chest.
 *   ENDED                    cleanup (scoreboard, barrier, listener).
 * </pre>
 *
 * <p>One instance per run; {@link EventScheduler} creates + starts it
 * and drops the reference when {@link #isFinished()} flips. Ticks on
 * the main thread every second. Registers itself as a Bukkit {@link
 * Listener} for the duration so it can score kills/deaths, then
 * unregisters on cleanup.
 *
 * <p>Persistence: POSTs event start + end to the panel
 * (fire-and-forget) so the dashboard history + clan stats pick the
 * run up. A panel that 404s (pre-5.6 deploy) just logs a warning;
 * the in-game event still runs to completion.
 */
public final class AirdropEvent implements Listener {

    private enum Stage { PREP, LANDING, FINALE, COLLECT, ENDED }

    private final ClanCapesPlugin plugin;
    private final World world;
    private final Zone zone;
    private final int prepSec;
    private final int landingSec;
    private final int collectSec;
    private final int reentryMs;

    private final ParticipantTracker tracker;
    private final EventScoreboard scoreboard;
    private BarrierRenderer barrier;

    private Stage stage = Stage.PREP;
    private long stageStartMs;
    private BukkitTask tickTask;
    private boolean finished;
    private Integer eventId;            // assigned by panel on start (nullable)
    private String winnerTag;
    private Location dropLocation;
    private int dropX;
    private int dropZ;

    public AirdropEvent(ClanCapesPlugin plugin, World world, EventConfigDto cfg) {
        this.plugin = plugin;
        this.world = world;
        this.tracker = new ParticipantTracker(plugin);
        this.scoreboard = new EventScoreboard();

        // Stage durations from payload, falling back to a 20/10/5 split
        // of the events.txt defaults when a knob is missing.
        JsonObject p = cfg.payload;
        this.prepSec = minutesToSec(p, "prepMinutes", 20);
        this.landingSec = minutesToSec(p, "landingMinutes", 10);
        this.collectSec = minutesToSec(p, "lootCollectionMinutes", 5);
        int reentrySec = (p != null && p.has("crashCommebackSeconds"))
                ? p.get("crashCommebackSeconds").getAsInt() : 30;
        this.reentryMs = reentrySec * 1000;

        // Pick the zone centre: random point within spawnRadius of
        // world spawn, then the contest circle of cfg.radiusBlocks.
        int spawnRadius = (p != null && p.has("spawnRadiusBlocks"))
                ? p.get("spawnRadiusBlocks").getAsInt() : 10_000;
        Location spawn = world.getSpawnLocation();
        var rng = ThreadLocalRandom.current();
        int cx = spawn.getBlockX() + rng.nextInt(-spawnRadius, spawnRadius + 1);
        int cz = spawn.getBlockZ() + rng.nextInt(-spawnRadius, spawnRadius + 1);
        this.zone = new Zone(world, cx, cz, cfg.radiusBlocks);

        // Drop point: random spot inside the contest circle.
        double ang = rng.nextDouble() * Math.PI * 2;
        double dist = Math.sqrt(rng.nextDouble()) * cfg.radiusBlocks;
        this.dropX = cx + (int) (Math.cos(ang) * dist);
        this.dropZ = cz + (int) (Math.sin(ang) * dist);
    }

    private static int minutesToSec(JsonObject p, String key, int defMin) {
        int min = (p != null && p.has(key)) ? p.get(key).getAsInt() : defMin;
        return min * 60;
    }

    public boolean isFinished() {
        return finished;
    }

    public void start() {
        Bukkit.getPluginManager().registerEvents(this, plugin);
        barrier = new BarrierRenderer(plugin, zone, Color.fromRGB(255, 170, 0));
        barrier.start();
        // Register the zone with the boundary enforcer (open — not
        // sealed until finale). The particle wall is visible the whole
        // time; the hard seal only kicks in for the decisive phase.
        EventBoundary.open(zone);
        enterStage(Stage.PREP);
        // POST start to panel (fire-and-forget). eventId comes back for
        // the matching end call; null on failure leaves end unscored.
        postStart();
        tickTask = Bukkit.getScheduler().runTaskTimer(plugin, this::tick, 20L, 20L);
    }

    private void enterStage(Stage s) {
        stage = s;
        stageStartMs = System.currentTimeMillis();
        switch (s) {
            case PREP -> EventChat.announceStage("AIRDROP INCOMING",
                    "Zone near " + zone.centerX() + ", " + zone.centerZ()
                            + " — prep " + (prepSec / 60) + "m");
            case LANDING -> {
                dropLocation = LootSpawner.spawn(world, dropX, dropZ);
                String coords = dropLocation != null
                        ? (dropLocation.getBlockX() + ", " + dropLocation.getBlockY()
                           + ", " + dropLocation.getBlockZ())
                        : (dropX + ", ~, " + dropZ);
                EventChat.announceStage("AIRDROP LANDED",
                        "Loot at " + coords + " — fight!");
            }
            case FINALE -> {
                // Seal the wall: no new entrants, no pearling in, no
                // block-bridging in. Current participants stay exempt.
                EventBoundary.seal(tracker.all().keySet());
                EventChat.announceStage("LAST CLAN STANDING", "Hold the zone!");
            }
            case COLLECT -> {
                // Keep it sealed through loot collection so outsiders
                // can't crash the winner's chest run.
                EventBoundary.seal(tracker.all().keySet());
                EventChat.announceStage("ZONE SECURED",
                        "[" + winnerTag + "] — " + (collectSec / 60) + "m to loot");
            }
            case ENDED -> { /* cleanup handled in finish() */ }
        }
    }

    private void tick() {
        if (finished) return;
        long now = System.currentTimeMillis();
        long elapsed = (now - stageStartMs) / 1000;

        switch (stage) {
            case PREP -> {
                if (elapsed >= prepSec) enterStage(Stage.LANDING);
            }
            case LANDING -> {
                enrollAndTrack(now);
                Integer winner = checkWinner();
                if (winner != null) {
                    declareWinner(winner);
                } else if (elapsed >= landingSec) {
                    // Timer expired with multiple clans alive → escalate
                    // to finale (sudden-death; same win check, no extra
                    // timer beyond collect).
                    enterStage(Stage.FINALE);
                }
            }
            case FINALE -> {
                enrollAndTrack(now);
                Integer winner = checkWinner();
                if (winner != null) {
                    declareWinner(winner);
                } else if (elapsed >= 600) {
                    // Hard cap: 10 min sudden-death with no resolution →
                    // cancel (no winner) so an event can't run forever.
                    EventChat.announceCancelled("no clan secured the zone");
                    finish();
                }
            }
            case COLLECT -> {
                if (elapsed >= collectSec) finish();
            }
            case ENDED -> { /* no-op */ }
        }

        renderScoreboard(elapsed);
    }

    /** Enroll players in-zone, track exits, expire absentees. */
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

    /**
     * @return winning clan id when exactly one clan remains alive AND
     *   at least two clans ever participated; null otherwise.
     */
    private Integer checkWinner() {
        if (tracker.participantCount() == 0) return null;
        var sample = tracker.soleSurvivingClanSample();
        if (sample == null) return null;
        // Guard against a single-clan "win" when only one clan ever
        // showed up — that's not a contest. Require ≥2 distinct clans
        // to have enrolled.
        long distinctClans = tracker.all().values().stream()
                .map(e -> e.clanId).distinct().count();
        if (distinctClans < 2) return null;
        return sample.clanId;
    }

    private void declareWinner(int clanId) {
        var sample = tracker.soleSurvivingClanSample();
        winnerTag = sample != null ? sample.clanTag : "?";
        EventChat.announceWinner(winnerTag);
        postEnd(clanId);
        enterStage(Stage.COLLECT);
    }

    private void renderScoreboard(long elapsed) {
        List<String> lines = new ArrayList<>();
        lines.add("§7Stage: §f" + stageLabel());
        long remain = stageRemaining(elapsed);
        if (remain >= 0) {
            lines.add("§7Time: §f" + (remain / 60) + "m " + (remain % 60) + "s");
        }
        lines.add("");
        lines.add("§7Players: §f" + tracker.participantCount());
        lines.add("§7Clans alive: §f" + tracker.aliveClanIds().size());
        if (winnerTag != null) {
            lines.add("");
            lines.add("§aWinner: §f" + winnerTag);
        }
        scoreboard.render(lines);
    }

    private String stageLabel() {
        return switch (stage) {
            case PREP -> "Prep";
            case LANDING -> "Landing";
            case FINALE -> "Finale";
            case COLLECT -> "Loot";
            case ENDED -> "Ended";
        };
    }

    private long stageRemaining(long elapsed) {
        return switch (stage) {
            case PREP -> Math.max(0, prepSec - elapsed);
            case LANDING -> Math.max(0, landingSec - elapsed);
            case COLLECT -> Math.max(0, collectSec - elapsed);
            default -> -1;
        };
    }

    @EventHandler
    public void onDeath(PlayerDeathEvent e) {
        if (stage != Stage.LANDING && stage != Stage.FINALE) return;
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
                    + "] eliminated.");
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
        body.addProperty("type", "airdrop");
        body.addProperty("zoneCenterX", zone.centerX());
        body.addProperty("zoneCenterZ", zone.centerZ());
        body.addProperty("zoneRadius", zone.radius());
        plugin.getPanelClient().postEventStart(body)
                .thenAccept(json -> {
                    if (json != null && json.has("id")) {
                        eventId = json.get("id").getAsInt();
                    }
                })
                .exceptionally(ex -> {
                    plugin.getLogger().warning("[airdrop] start POST failed: "
                            + ex.getMessage());
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
                    plugin.getLogger().warning("[airdrop] end POST failed: "
                            + ex.getMessage());
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
