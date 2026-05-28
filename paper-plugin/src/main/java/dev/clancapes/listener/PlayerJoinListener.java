package dev.clancapes.listener;

import dev.clancapes.ClanCapesPlugin;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

/**
 * Triggers cache warm-up if the plugin has been linked but the
 * snapshot is empty (e.g. first join after server restart). Avoids
 * the "player joins, /clan info returns nothing because we haven't
 * polled yet" footgun.
 */
public final class PlayerJoinListener implements Listener {

    private final ClanCapesPlugin plugin;

    public PlayerJoinListener(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onJoin(PlayerJoinEvent event) {
        if (plugin.getClanRepository().all().isEmpty()
                && plugin.getPanelClient().isConfigured()) {
            plugin.getClanRepository().refresh();
        }
    }
}
