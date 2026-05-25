package dev.clancapes.listener;

import com.google.gson.JsonObject;
import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.panel.PanelClient;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;

import java.util.UUID;
import java.util.logging.Level;

/**
 * Bukkit listener that ships every PvP kill to the panel so the
 * Phase-5 stats engine can update aggregates.
 *
 * Rules:
 *   - Killer must be a Player (so mob kills and environmental deaths
 *     don't count).
 *   - Killer != victim (PlayerDeathEvent can fire with the same UUID
 *     for "killed yourself" cases — the panel skips it too but we
 *     drop early to avoid the round-trip).
 *
 * Network call runs on Bukkit's async scheduler so the death event
 * handler never blocks the main thread. Failures are logged at
 * WARNING and dropped — losing a single kill ingest is preferable
 * to crashing the game tick.
 */
public final class PvpKillListener implements Listener {
    private final ClanCapesPlugin plugin;

    public PvpKillListener(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onDeath(PlayerDeathEvent event) {
        Player victim = event.getEntity();
        Player killer = victim.getKiller();
        if (killer == null) {
            // Not a PvP death (mob, environment, void, suicide) — ignore.
            return;
        }
        UUID killerUuid = killer.getUniqueId();
        UUID victimUuid = victim.getUniqueId();
        if (killerUuid.equals(victimUuid)) {
            return;
        }

        String panelUrl = plugin.getPluginConfig().getPanelUrl();
        String apiKey = plugin.getPluginConfig().getPanelApiKey();
        if (panelUrl == null || panelUrl.isBlank() || apiKey == null || apiKey.isBlank()) {
            // Not registered to a panel yet — skip silently.
            return;
        }

        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("killerUuid", killerUuid.toString());
                body.addProperty("victimUuid", victimUuid.toString());
                new PanelClient(plugin).recordKill(panelUrl, apiKey, body);
                // Refresh the involved players' stats cache so the
                // placeholder picks the new number up on the next read
                // instead of waiting for the cache TTL to expire.
                var cache = plugin.getStatsCache();
                if (cache != null) {
                    cache.invalidate(killerUuid);
                    cache.invalidate(victimUuid);
                }
            } catch (PanelClient.PanelException e) {
                plugin.getLogger().log(Level.WARNING,
                        "panel kill ingest failed: " + e.getMessage());
            }
        });
    }
}
