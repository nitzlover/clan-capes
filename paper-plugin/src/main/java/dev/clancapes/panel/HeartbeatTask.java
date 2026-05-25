package dev.clancapes.panel;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.clancapes.ClanCapesPlugin;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitTask;

import java.util.logging.Level;

/**
 * Periodically POSTs {@code /api/plugin/heartbeat} so the panel can
 * surface a live online/stale/offline pill on /dashboard/servers and
 * the plugin gets early warning if its API key has been rotated.
 * <p>
 * Schedule:
 * <ul>
 *   <li>Initial fire at +30 seconds after enable so we don't race the
 *       server's own bootstrap noise.</li>
 *   <li>Repeats every 5 minutes. Matches the panel's status-pill
 *       cutoffs (10 min = "stale", 30 min = "offline"), so even with
 *       one missed beat the row still reads as healthy.</li>
 * </ul>
 * <p>
 * Failures are logged at WARNING but the task keeps running — a flaky
 * network shouldn't permanently silence heartbeats. A 401 (key
 * rejected) is special-cased: we log louder so the operator notices
 * they need to re-run {@code /clancape link} with a freshly minted
 * key.
 */
public final class HeartbeatTask {
    private static final long INITIAL_DELAY_TICKS = 20L * 30;          // +30s
    private static final long PERIOD_TICKS = 20L * 60 * 5;             // every 5 min

    private final ClanCapesPlugin plugin;
    private BukkitTask task;
    private boolean warnedAuth = false;

    public HeartbeatTask(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    /**
     * Wire the scheduler. No-op if the panel URL or API key is empty —
     * a server that hasn't completed the one-time-pass setup yet
     * stays silent until the operator runs {@code /clancape link}.
     */
    public void start() {
        if (task != null) return;
        task = plugin.getServer().getScheduler().runTaskTimerAsynchronously(
                plugin, this::tick, INITIAL_DELAY_TICKS, PERIOD_TICKS);
    }

    public void stop() {
        if (task != null) {
            task.cancel();
            task = null;
        }
    }

    private void tick() {
        var cfg = plugin.getPluginConfig();
        String panelUrl = cfg.getPanelUrl();
        String apiKey = cfg.getPanelApiKey();
        if (panelUrl == null || panelUrl.isBlank() || apiKey == null || apiKey.isBlank()) {
            return; // Not registered yet — staying silent.
        }

        // Lightweight telemetry the panel can audit if it wants — bumped
        // every heartbeat so version drift across upgrades is visible
        // in /dashboard/audit.
        JsonObject body = new JsonObject();
        body.addProperty("pluginVersion", plugin.getDescription().getVersion());
        body.addProperty("mcVersion", plugin.getServer().getBukkitVersion());
        var online = plugin.getServer().getOnlinePlayers();
        body.addProperty("onlinePlayers", online.size());
        // Full UUID list so the panel can decorate the clan roster with
        // a green-dot "online now" indicator without a second
        // round-trip. Capped at 200 entries to keep payload bounded on
        // pathological MMO-scale servers — the panel only needs them
        // for the small set of clan members anyway.
        JsonArray uuids = new JsonArray();
        int capped = Math.min(online.size(), 200);
        int i = 0;
        for (Player op : online) {
            if (i++ >= capped) break;
            uuids.add(op.getUniqueId().toString());
        }
        body.add("onlinePlayerUuids", uuids);

        try {
            var client = new PanelClient(plugin);
            client.heartbeat(panelUrl, apiKey, body);
            if (warnedAuth) {
                plugin.getLogger().info("Panel API key accepted again — heartbeats resumed.");
                warnedAuth = false;
            }
        } catch (PanelClient.PanelException e) {
            String msg = String.valueOf(e.getMessage());
            if (msg.contains("HTTP 401") || msg.contains("API key rejected")) {
                if (!warnedAuth) {
                    plugin.getLogger().severe(
                            "Panel rejected the configured API key — run /clancape link <ck_live_…> with a fresh one. "
                                    + msg);
                    warnedAuth = true;
                }
            } else {
                plugin.getLogger().log(Level.WARNING, "panel heartbeat failed: " + msg);
            }
        }
    }
}
