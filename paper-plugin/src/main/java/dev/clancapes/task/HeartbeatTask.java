package dev.clancapes.task;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.clancapes.ClanCapesPlugin;
import org.bukkit.Bukkit;
import org.bukkit.scheduler.BukkitRunnable;

/**
 * Sends a heartbeat to the panel on a fixed cadence. Payload includes
 * the live online UUIDs so the panel's in-memory online cache stays
 * fresh and /dashboard/clans paints accurate dots without re-polling
 * the game server.
 */
public final class HeartbeatTask extends BukkitRunnable {

    private final ClanCapesPlugin plugin;

    public HeartbeatTask(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public void run() {
        if (!plugin.getPanelClient().isConfigured()) return;

        // Paper 26.1.2 enforces the main-thread invariant on
        // Bukkit.getOnlinePlayers() / player accessors; iterating from
        // the async scheduler tripped the async-catcher under join
        // storms and risked ConcurrentModificationException. Collect
        // the uuids on the main thread, then hop back out via the
        // HttpClient call (already async-internal).
        Bukkit.getScheduler().runTask(plugin, () -> {
            JsonArray uuids = new JsonArray();
            for (var p : Bukkit.getOnlinePlayers()) {
                uuids.add(p.getUniqueId().toString());
            }

            JsonObject payload = new JsonObject();
            payload.addProperty("pluginVersion", plugin.getPluginMeta().getVersion());
            payload.addProperty("paperVersion", Bukkit.getVersion());
            payload.addProperty("onlineCount", uuids.size());
            payload.add("onlinePlayerUuids", uuids);

            plugin.getPanelClient().postHeartbeat(payload)
                    .exceptionally(t -> {
                        if (plugin.getConfig().getBoolean("logging.debug", false)) {
                            plugin.getLogger().warning("[heartbeat] failed: " + t.getMessage());
                        }
                        return null;
                    });
        });
    }
}
